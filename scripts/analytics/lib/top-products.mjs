/**
 * Top produtos por salesCount no último ScrapeRun — lógica partilhada CLI / API.
 *
 * Modo sem `categoryUrl` (global): apenas snapshots do **último** ScrapeRun (comportamento herdado).
 *
 * Modo com `categoryUrl`: para cada produto cuja `Product.categoryUrl` normaliza igual ao parâmetro,
 * escolhe-se o snapshot com `sales_count` não nulo cujo run tem **`ScrapeRun.collected_at` máximo**
 * entre todos os snapshots desse produto — não limita aos snapshots só do último run global — e depois
 * ordenam-se por vendas desc e aplicam-se 20 linhas (igual ao global).
 */
import { getLatestAndPreviousRun } from "../_common.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";

const MAX_ROWS = 20;

/**
 * @param {*} s — ProductSnapshot com product.seller
 */
function snapshotToItemRow(s) {
  return {
    productId: s.product.productId,
    nome: (s.product.name ?? "").trim() || "—",
    loja: (s.product.seller?.name ?? "").trim() || "—",
    preco: s.price,
    vendas: s.salesCount,
    avaliacao: s.ratingAverage != null ? s.ratingAverage : null,
    link: s.product.productUrl ?? ""
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string }} [opts]
 */
export async function getTopProductsReport(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";
  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado. Importa primeiro (npm run db:import:output)."
    };
  }

  if (!rawCat) {
    const rows = await prisma.productSnapshot.findMany({
      where: {
        scrapeRunId: latest.id,
        salesCount: { not: null }
      },
      include: {
        product: { include: { seller: true } }
      },
      orderBy: { salesCount: "desc" },
      take: MAX_ROWS
    });

    if (rows.length === 0) {
      return {
        scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
        items: [],
        message: `Último ScrapeRun (${latest.id}): nenhum snapshot com sales_count.`
      };
    }

    const items = rows.map((s) => snapshotToItemRow(s));

    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items,
      listed: items.length,
      maxRows: MAX_ROWS
    };
  }

  const filterKey = normalizeCategoryKey(rawCat);
  if (!filterKey) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      maxRows: MAX_ROWS,
      categoryUrlFilter: filterKey,
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
      maxRows: MAX_ROWS,
      categoryUrlFilter: filterKey,
      message: `Nenhum produto encontrado para categoria (${filterKey}).`
    };
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: {
      productRefId: { in: inCategoryIds },
      salesCount: { not: null }
    },
    include: {
      product: { include: { seller: true } },
      scrapeRun: { select: { id: true, collectedAt: true } }
    }
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
  const top = ranked.slice(0, MAX_ROWS);

  if (top.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      maxRows: MAX_ROWS,
      categoryUrlFilter: filterKey,
      message: `Produtos nesta categoria sem sales_count nos snapshots (${filterKey}).`
    };
  }

  const items = top.map((s) => snapshotToItemRow(s));

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    items,
    listed: items.length,
    maxRows: MAX_ROWS,
    categoryUrlFilter: filterKey
  };
}
