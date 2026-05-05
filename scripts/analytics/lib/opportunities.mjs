/**
 * Oportunidades heurísticas v1 — lógica partilhada CLI / API.
 *
 * Sem `categoryUrl`: apenas snapshots do **último** ScrapeRun (comportamento original).
 *
 * Com `categoryUrl`: por cada produto da categoria, usa-se o snapshot cujo run tem o maior
 * **`ScrapeRun.collected_at`** (empate determinístico no `run.id`), alinhado ao padrão de Top Products;
 * em seguida aplicam‑se os **mesmos** critérios v1 já usados na query global (preço definido,
 * rating / total de avaliações, vendas entre 10 e 300).
 */
import { getLatestAndPreviousRun } from "../_common.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { parseCategory } from "./parse-category.mjs";

export const OPPORTUNITIES_DEFAULT_LIMIT = 20;
export const OPPORTUNITIES_MAX_LIMIT = 10000;

/** @param {unknown} raw */
export function clampOpportunitiesLimit(raw) {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw.trim())
        : NaN;
  if (!Number.isFinite(n) || n < 1) {
    return OPPORTUNITIES_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(n), OPPORTUNITIES_MAX_LIMIT);
}

/** Texto público da regra (ANALYTICS v1). */
export const OPPORTUNITIES_RULE_V1_NOTE =
  "rating≥4.5, aval≥5, vendas entre 10 e 300, preço definido — heurística v1 (ver docs/ANALYTICS.md).";

/** Espelho dos predicados da query Prisma global (modo último run). */
function snapshotMatchesOpportunityV1(s) {
  if (s.price == null) {
    return false;
  }
  if (s.ratingAverage == null || s.ratingAverage < 4.5) {
    return false;
  }
  if (s.ratingTotal == null || s.ratingTotal < 5) {
    return false;
  }
  if (s.salesCount == null) {
    return false;
  }
  if (s.salesCount < 10 || s.salesCount > 300) {
    return false;
  }
  return true;
}

/**
 * @param {Array<import("@prisma/client").ProductSnapshot & { scrapeRun?: { id: string, collectedAt: Date } | null }>} snaps
 */
function pickLatestSnapshotPerProductRef(snaps) {
  /** @type {Map<string, (typeof snaps)[number]>} */
  const bestByProductRef = new Map();
  for (const s of snaps) {
    const ct = s.scrapeRun?.collectedAt ? new Date(s.scrapeRun.collectedAt).getTime() : 0;
    const rid = s.scrapeRun?.id ?? "";
    const prev = bestByProductRef.get(s.productRefId);
    if (!prev) {
      bestByProductRef.set(s.productRefId, s);
      continue;
    }
    const pCt = prev.scrapeRun?.collectedAt ? new Date(prev.scrapeRun.collectedAt).getTime() : 0;
    const pRid = prev.scrapeRun?.id ?? "";
    if (ct > pCt || (ct === pCt && rid && pRid && rid.localeCompare(pRid) < 0)) {
      bestByProductRef.set(s.productRefId, s);
    }
  }
  return bestByProductRef;
}

/**
 * @param {*} s — snapshot com product + seller
 */
function snapshotToOpportunityRow(s) {
  const { masterCategory: categoriaPrincipal, subcategory: subcategoria } = parseCategory(s.product?.categoryUrl);
  return {
    productId: s.product.productId,
    nome: (s.product.name ?? "").slice(0, 40),
    categoriaPrincipal,
    subcategoria,
    loja: (s.product.seller?.name ?? "—").slice(0, 28),
    preco: s.price,
    vendas: s.salesCount,
    avalMed: s.ratingAverage,
    avalTot: s.ratingTotal,
    motivo: "regra ANALYTICS v1",
    link: s.product.productUrl ?? ""
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string, limit?: number }} [opts]
 *   — `limit` em [1, OPPORTUNITIES_MAX_LIMIT]; omitido → OPPORTUNITIES_DEFAULT_LIMIT (CLI).
 */
export async function getOpportunitiesReport(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit)
      ? Math.min(Math.max(1, Math.floor(opts.limit)), OPPORTUNITIES_MAX_LIMIT)
      : OPPORTUNITIES_DEFAULT_LIMIT;

  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado."
    };
  }

  if (!rawCat) {
    const whereGlobal = {
      scrapeRunId: latest.id,
      price: { not: null },
      ratingAverage: { gte: 4.5 },
      ratingTotal: { gte: 5 },
      salesCount: { gte: 10, lte: 300 }
    };

    const rankingTotal = await prisma.productSnapshot.count({ where: whereGlobal });

    if (rankingTotal === 0) {
      return {
        scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
        items: [],
        rankingTotal: 0,
        listed: 0,
        limit,
        truncated: false,
        maxRows: limit,
        message: `Último ScrapeRun (${latest.id}): nenhum produto coincide com os filtros de oportunidade v1.`
      };
    }

    const rows = await prisma.productSnapshot.findMany({
      where: whereGlobal,
      include: {
        product: { include: { seller: true } }
      },
      orderBy: [{ ratingAverage: "desc" }, { salesCount: "desc" }],
      take: limit
    });

    const items = rows.map((s) => snapshotToOpportunityRow(s));
    const truncated = rankingTotal > items.length;

    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items,
      ruleNote: OPPORTUNITIES_RULE_V1_NOTE,
      listed: items.length,
      rankingTotal,
      limit,
      truncated,
      maxRows: limit
    };
  }

  const filterKey = normalizeCategoryKey(rawCat);
  if (!filterKey) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      rankingTotal: 0,
      limit,
      truncated: false,
      maxRows: limit,
      message: "categoryUrl normalizado ficou vazio — confirme a URL da categoria."
    };
  }

  const products = await prisma.product.findMany({
    where: { categoryUrl: { not: null } },
    select: { id: true, categoryUrl: true }
  });
  const inCategoryIds = products
    .filter((p) => p.categoryUrl != null && normalizeCategoryKey(p.categoryUrl) === filterKey)
    .map((p) => p.id);

  if (inCategoryIds.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      rankingTotal: 0,
      limit,
      truncated: false,
      maxRows: limit,
      categoryUrlFilter: filterKey,
      message: `Nenhum produto encontrado para categoria (${filterKey}).`
    };
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: { productRefId: { in: inCategoryIds } },
    include: {
      product: { include: { seller: true } },
      scrapeRun: { select: { id: true, collectedAt: true } }
    }
  });

  const latestByProd = pickLatestSnapshotPerProductRef(snaps);

  /** @type {typeof snaps} */
  const candidates = [...latestByProd.values()].filter((s) => snapshotMatchesOpportunityV1(s));
  candidates.sort((a, b) => {
    const ra = a.ratingAverage ?? 0;
    const rb = b.ratingAverage ?? 0;
    if (rb !== ra) {
      return rb - ra;
    }
    return Number(b.salesCount ?? 0) - Number(a.salesCount ?? 0);
  });
  const rankingTotal = candidates.length;
  const top = candidates.slice(0, limit);

  if (top.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      rankingTotal: 0,
      limit,
      truncated: false,
      maxRows: limit,
      categoryUrlFilter: filterKey,
      message: `Último snapshot por produto nesta categoria: nenhum coincide com os filtros de oportunidade v1 (${filterKey}).`
    };
  }

  const items = top.map((s) => snapshotToOpportunityRow(s));
  const truncated = rankingTotal > items.length;

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    items,
    ruleNote: OPPORTUNITIES_RULE_V1_NOTE,
    listed: items.length,
    rankingTotal,
    limit,
    truncated,
    maxRows: limit,
    categoryUrlFilter: filterKey
  };
}
