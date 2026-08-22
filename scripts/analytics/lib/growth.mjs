/**
 * Crescimento de vendas último vs run anterior — lógica partilhada CLI / API.
 *
 * Com `categoryUrl` opcional: restringe o universo aos produtos dessa categoria (mesma normalização que outros relatórios).
 * A fórmula de cada par (delta, %, ordenação) mantém-se igual.
 */
import { getLatestAndPreviousRun } from "../_common.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { hasAtLeastHttpPdpImages } from "../../lib/extract-image-urls.mjs";

const TOP_LIMIT = 20;

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string }} [opts]
 */
export async function getGrowthReport(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";

  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      latestRun: null,
      previousRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado."
    };
  }

  if (count < 2 || !previous) {
    return {
      latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      previousRun: null,
      items: [],
      message: "É necessário ter pelo menos 2 ScrapeRuns para calcular crescimento."
    };
  }

  /** Restringir por categoria TikTok quando pedido — mesmo critério de `normalizeCategoryKey`. */
  let categoryFilterIds = /** @type {string[] | null} */ (null);
  let categoryUrlFilter = /** @type {string | undefined} */ (undefined);
  if (rawCat !== "") {
    const filterKey = normalizeCategoryKey(rawCat);
    if (!filterKey) {
      return {
        latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
        previousRun: { id: previous.id, collectedAt: previous.collectedAt.toISOString() },
        items: [],
        message: "categoryUrl normalizado ficou vazio — confirme a URL da categoria."
      };
    }
    categoryUrlFilter = filterKey;
    const products = await prisma.product.findMany({
      where: { categoryUrl: { not: null }, hiddenAt: null },
      select: { id: true, categoryUrl: true }
    });
    categoryFilterIds = products
      .filter((p) => p.categoryUrl != null && normalizeCategoryKey(p.categoryUrl) === filterKey)
      .map((p) => p.id);
    if (categoryFilterIds.length === 0) {
      return {
        latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
        previousRun: { id: previous.id, collectedAt: previous.collectedAt.toISOString() },
        items: [],
        categoryUrlFilter,
        message: `Nenhum produto encontrado para categoria (${filterKey}).`
      };
    }
  }

  const snapWhereBase = {
    salesCount: { not: null },
    ...(categoryFilterIds != null ? { productRefId: { in: categoryFilterIds } } : {})
  };

  const prevSnaps = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: previous.id,
      ...snapWhereBase
    },
    select: {
      productRefId: true,
      salesCount: true
    }
  });
  const prevByProd = new Map(prevSnaps.map((s) => [s.productRefId, s.salesCount]));

  const latestSnaps = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: latest.id,
      product: { hiddenAt: null },
      ...snapWhereBase
    },
    include: {
      product: { include: { seller: true } }
    }
  });

  /** @type {Array<{delta: number, deltaPctLabel: string, s: (typeof latestSnaps)[number], prevSales: number}>} */
  const pairs = [];

  for (const s of latestSnaps) {
    const pv = prevByProd.get(s.productRefId);
    if (pv == null || s.salesCount == null) continue;
    let deltaPctLabel;
    if (pv === 0) {
      deltaPctLabel = s.salesCount > pv ? "∞" : "—";
    } else {
      deltaPctLabel = `${(((s.salesCount - pv) / pv) * 100).toFixed(1)}%`;
    }
    pairs.push({ delta: s.salesCount - pv, deltaPctLabel, s, prevSales: pv });
  }

  pairs.sort((a, b) => b.delta - a.delta);

  const slice = pairs.slice(0, TOP_LIMIT);

  if (slice.length === 0) {
    return {
      latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      previousRun: { id: previous.id, collectedAt: previous.collectedAt.toISOString() },
      items: [],
      ...(categoryUrlFilter != null ? { categoryUrlFilter } : {}),
      message:
        "Sem pares comparáveis: nenhum produto com vendas não nulas no último e no run anterior (ou apenas um run com dados)."
    };
  }

  const items = slice.map(({ s, prevSales, delta, deltaPctLabel }) => ({
    enriched:
      s?.dataQuality &&
      typeof s.dataQuality === "object" &&
      s.dataQuality.enrichment &&
      typeof s.dataQuality.enrichment === "object" &&
      s.dataQuality.enrichment.status === "enriched"
        ? true
        : hasAtLeastHttpPdpImages(s, 3),
    productId: s.product.productId,
    nome: (s.product.name ?? "").slice(0, 38),
    loja: (s.product.seller?.name ?? "—").slice(0, 24),
    preco: s.price ?? null,
    vendasAnt: prevSales,
    vendasAtual: s.salesCount,
    delta,
    deltaPct: deltaPctLabel,
    link: s.product.productUrl ?? ""
  }));

  return {
    latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    previousRun: { id: previous.id, collectedAt: previous.collectedAt.toISOString() },
    items,
    sortNote: "ordenação por maior delta absoluto de vendas",
    listed: items.length,
    maxRows: TOP_LIMIT,
    ...(categoryUrlFilter != null ? { categoryUrlFilter } : {})
  };
}
