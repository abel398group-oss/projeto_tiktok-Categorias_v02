/**
 * Mapa de categoria — agregação read-only sobre snapshots pontuados.
 * Sem query: apenas último ScrapeRun global. Com `categoryUrl`: mesmo critério de snapshot por produto que Product Score por categoria.
 */
import { getLatestAndPreviousRun } from "./_common.mjs";
import { normalizeCategoryKey } from "./lib/categories-catalog.mjs";
import {
  computeProductScoreLine,
  fetchSnapshotsWithScoreCtxForNormalizedCategory,
  rotuloScore
} from "./lib/product-score.mjs";
import { parseCategory } from "./lib/parse-category.mjs";

const TOP_PRODUCTS_PER_SUB = 5;

/** Reexport mantém imports existentes tipo `category-map.mjs#getCategory…` consumidores de `parseCategory`. */
export { parseCategory };

/**
 * @param {number | null | undefined[]} xs
 */
function meanSkipNull(xs) {
  const n = xs.filter((x) => x != null && !Number.isNaN(Number(x)));
  if (n.length === 0) return 0;
  return n.reduce((a, x) => a + Number(x), 0) / n.length;
}

/**
 * @param {number | undefined} vendasRaw
 */
function vendasNum(vendasRaw) {
  if (vendasRaw === "" || vendasRaw == null) return 0;
  const n = Number(vendasRaw);
  return Number.isFinite(n) ? n : 0;
}

function precoNum(precoRaw) {
  if (precoRaw === "" || precoRaw == null) return null;
  const n = Number(precoRaw);
  return Number.isFinite(n) ? n : null;
}

const SCORE_METHOD_NOTE = `Subcategoria: média arredondada dos scores individuais (product-score v1). Top produtos por score (até ${TOP_PRODUCTS_PER_SUB}).`;

/**
 * @param {Array<*>} snaps — ProductSnapshot com `product.seller`
 * @param {{ prevPorRef: Map<string, unknown>, count: number, previous: unknown }} ctx
 */
function aggregateCategoryMapFromSnapshots(snaps, ctx) {
  /** @type Map<string, { master: string, sub: string, rows: Array<ReturnType<typeof computeProductScoreLine>> }>*/
  const bySubKey = new Map();

  for (const s of snaps) {
    const { masterCategory: master, subcategory: sub } = parseCategory(s.product.categoryUrl);
    const key = `${master}\x00${sub}`;
    let ent = bySubKey.get(key);
    if (!ent) {
      ent = { master, sub, rows: [] };
      bySubKey.set(key, ent);
    }
    ent.rows.push(computeProductScoreLine(s, ctx));
  }

  /** @type Map<string, { name: string, subs: Array<*> }>} */
  const byMaster = new Map();

  for (const { master, sub, rows } of bySubKey.values()) {
    const scores = rows.map((r) => r.score);
    /** Score da subcategoria: média simples das pontuações dos produtos (v1). */
    const score = Math.round(scores.reduce((a, x) => a + x, 0) / Math.max(scores.length, 1));

    let totalSales = 0;
    for (const r of rows) totalSales += vendasNum(r.vendas);

    const ratings = rows.map((r) => r.ratingAverage);
    const avgRating = Number(meanSkipNull(ratings).toFixed(2));

    const prices = rows.map((r) => precoNum(r.preco)).filter((p) => p != null);
    const avgPrice = prices.length ? Number(meanSkipNull(prices).toFixed(2)) : 0;

    const opportunities = rows.filter((r) => r.isOpportunityV1).length;

    const sorted = [...rows].sort((a, b) => b.score - a.score).slice(0, TOP_PRODUCTS_PER_SUB);

    const topProducts = sorted.map((r) => ({
      productId: r.productId,
      nome: r.nome,
      categoriaPrincipal: r.categoriaPrincipal ?? "—",
      subcategoria: r.subcategoria ?? "—",
      score: r.score,
      vendas: vendasNum(r.vendas),
      rating: r.ratingAverage,
      preço: precoNum(r.preco),
      delta: r.deltaNumeric,
      link: r.link ?? ""
    }));

    const subEntry = {
      name: sub,
      score,
      classification: rotuloScore(score),
      totalProducts: rows.length,
      totalSales,
      avgRating,
      avgPrice,
      opportunities,
      topProducts
    };

    let mEnt = byMaster.get(master);
    if (!mEnt) {
      mEnt = { name: master, subs: [] };
      byMaster.set(master, mEnt);
    }
    mEnt.subs.push(subEntry);
  }

  for (const m of byMaster.values()) {
    m.subs.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  const masterCategories = [...byMaster.values()]
    .map((m) => ({
      name: m.name,
      subcategories: m.subs
    }))
    .sort((a, b) => {
      const am = Math.max(0, ...a.subcategories.map((s) => s.score));
      const bm = Math.max(0, ...b.subcategories.map((s) => s.score));
      if (bm !== am) return bm - am;
      return a.name.localeCompare(b.name);
    });

  return { masterCategories };
}

/**
 * Mapa global: último ScrapeRun apenas.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 */
async function getCategoryMapReportGlobal(prisma) {
  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      previousRun: null,
      hasGrowthComparableRuns: false,
      masterCategories: [],
      message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)."
    };
  }

  const prevPorRef = new Map();
  if (count >= 2 && previous) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: previous.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) prevPorRef.set(ps.productRefId, ps.salesCount);
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: { scrapeRunId: latest.id },
    include: {
      product: { include: { seller: true } }
    }
  });

  if (snaps.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      previousRun: previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null,
      hasGrowthComparableRuns: !!(count >= 2 && previous),
      masterCategories: [],
      message: "Último ScrapeRun sem ProductSnapshot.",
      snapshotsInLatestRun: 0
    };
  }

  const ctx = { prevPorRef, count, previous };
  const { masterCategories } = aggregateCategoryMapFromSnapshots(snaps, ctx);

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    previousRun: previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null,
    hasGrowthComparableRuns: !!(count >= 2 && previous),
    masterCategories,
    snapshotsInLatestRun: snaps.length,
    topProductsPerSubcategory: TOP_PRODUCTS_PER_SUB,
    scoreMethod: SCORE_METHOD_NOTE
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string }} [opts]
 */
export async function getCategoryMapReport(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";

  if (!rawCat) {
    return getCategoryMapReportGlobal(prisma);
  }

  const filterKeyPreview = normalizeCategoryKey(rawCat);
  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      previousRun: null,
      hasGrowthComparableRuns: false,
      masterCategories: [],
      message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output).",
      ...(filterKeyPreview !== "" ? { categoryUrlFilter: filterKeyPreview } : {})
    };
  }

  if (!filterKeyPreview) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      previousRun: previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null,
      hasGrowthComparableRuns: !!(count >= 2 && previous),
      masterCategories: [],
      categoryUrlFilter: filterKeyPreview,
      message: "categoryUrl normalizado ficou vazio — confirme a URL da categoria.",
      snapshotsInLatestRun: 0
    };
  }

  const r = await fetchSnapshotsWithScoreCtxForNormalizedCategory(prisma, filterKeyPreview);

  if (!r.ok) {
    if (r.type === "no-run") {
      return {
        scrapeRun: null,
        previousRun: null,
        hasGrowthComparableRuns: false,
        masterCategories: [],
        message: r.message,
        categoryUrlFilter: filterKeyPreview
      };
    }
    return {
      scrapeRun: r.scrapeRun,
      previousRun: r.previousRun,
      hasGrowthComparableRuns: r.hasGrowthComparableRuns,
      masterCategories: [],
      message: r.message,
      categoryUrlFilter: r.categoryUrlFilter,
      snapshotsInLatestRun: 0
    };
  }

  const { masterCategories } = aggregateCategoryMapFromSnapshots(r.snapshots, r.ctx);

  return {
    scrapeRun: r.scrapeRun,
    previousRun: r.previousRun,
    hasGrowthComparableRuns: r.hasGrowthComparableRuns,
    masterCategories,
    snapshotsInLatestRun: r.snapshots.length,
    topProductsPerSubcategory: TOP_PRODUCTS_PER_SUB,
    scoreMethod: SCORE_METHOD_NOTE,
    categoryUrlFilter: r.categoryUrlFilter
  };
}
