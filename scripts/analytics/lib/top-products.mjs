/**
 * Top produtos por salesCount no último ScrapeRun — lógica partilhada CLI / API.
 *
 * Modo sem `categoryUrl` (global): apenas snapshots do **último** ScrapeRun (comportamento herdado).
 *
 * Modo com `categoryUrl`: para cada produto cuja `Product.categoryUrl` normaliza igual ao parâmetro,
 * escolhe-se o snapshot com `sales_count` não nulo cujo run tem **`ScrapeRun.collected_at` máximo**
 * entre todos os snapshots desse produto — não limita aos snapshots só do último run global — e depois
 * ordenam-se por vendas desc; o parâmetro `limit` corta quantas linhas devolver (defeito 20, máx. 10000).
 */
import { getLatestAndPreviousRun } from "../_common.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { parseCategory } from "./parse-category.mjs";
import { hasAtLeastHttpPdpImages } from "../../lib/extract-image-urls.mjs";
import { SNAPSHOT_REPORT_SELECT, SNAPSHOT_REPORT_SELECT_WITH_RUN } from "./snapshot-select.mjs";

export const TOP_PRODUCTS_DEFAULT_LIMIT = 20;
export const TOP_PRODUCTS_MAX_LIMIT = 10000;

/** @param {unknown} raw */
export function clampTopProductsLimit(raw) {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw.trim())
        : NaN;
  if (!Number.isFinite(n) || n < 1) {
    return TOP_PRODUCTS_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(n), TOP_PRODUCTS_MAX_LIMIT);
}

/**
 * @param {*} s — ProductSnapshot com product.seller
 */
function snapshotToItemRow(s) {
  const { masterCategory: categoriaPrincipal, subcategory: subcategoria } = parseCategory(s.product?.categoryUrl);
  const enriched =
    s?.dataQuality &&
    typeof s.dataQuality === "object" &&
    s.dataQuality.enrichment &&
    typeof s.dataQuality.enrichment === "object" &&
    s.dataQuality.enrichment.status === "enriched"
      ? true
      : hasAtLeastHttpPdpImages(s, 3);
  return {
    productId: s.product.productId,
    nome: (s.product.name ?? "").trim() || "—",
    categoriaPrincipal,
    subcategoria,
    loja: (s.product.seller?.name ?? "").trim() || "—",
    preco: s.price,
    vendas: s.salesCount,
    avaliacao: s.ratingAverage != null ? s.ratingAverage : null,
    enriched,
    link: s.product.productUrl ?? ""
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string, limit?: number }} [opts]
 *   — `limit` em [1, TOP_PRODUCTS_MAX_LIMIT]; omitido → TOP_PRODUCTS_DEFAULT_LIMIT (CLI).
 */
export async function getTopProductsReport(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit)
      ? Math.min(Math.max(1, Math.floor(opts.limit)), TOP_PRODUCTS_MAX_LIMIT)
      : TOP_PRODUCTS_DEFAULT_LIMIT;

  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado. Importa primeiro (npm run db:import:output)."
    };
  }

  if (!rawCat) {
    const whereGlobal = {
      scrapeRunId: latest.id,
      salesCount: { not: null },
      product: { hiddenAt: null }
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
        message: `Último ScrapeRun (${latest.id}): nenhum snapshot com sales_count.`
      };
    }

    const rows = await prisma.productSnapshot.findMany({
      where: whereGlobal,
      select: SNAPSHOT_REPORT_SELECT,
      orderBy: { salesCount: "desc" },
      take: limit
    });

    const items = rows.map((s) => snapshotToItemRow(s));
    const truncated = rankingTotal > items.length;

    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items,
      listed: items.length,
      rankingTotal,
      limit,
      truncated,
      /** Compatível com cliente antigo (`maxRows` = linhas máximas pedidas nesta resposta). */
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
      categoryUrlFilter: filterKey,
      message: "categoryUrl normalizado ficou vazio — confirme a URL da categoria."
    };
  }

  const products = await prisma.product.findMany({
    where: { categoryUrl: { not: null }, hiddenAt: null },
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
    where: {
      productRefId: { in: inCategoryIds },
      salesCount: { not: null }
    },
    select: SNAPSHOT_REPORT_SELECT_WITH_RUN
  });

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

  const ranked = [...bestByProductRef.values()].sort((a, b) => {
    const va = Number(a.salesCount ?? 0);
    const vb = Number(b.salesCount ?? 0);
    return vb - va;
  });

  const rankingTotal = ranked.length;

  if (rankingTotal === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      rankingTotal: 0,
      limit,
      truncated: false,
      maxRows: limit,
      categoryUrlFilter: filterKey,
      message: `Produtos nesta categoria sem sales_count nos snapshots (${filterKey}).`
    };
  }

  const top = ranked.slice(0, limit);
  const items = top.map((s) => snapshotToItemRow(s));
  const truncated = rankingTotal > items.length;

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    items,
    listed: items.length,
    rankingTotal,
    limit,
    truncated,
    maxRows: limit,
    categoryUrlFilter: filterKey
  };
}
