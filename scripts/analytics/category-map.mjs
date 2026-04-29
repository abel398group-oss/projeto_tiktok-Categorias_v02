/**
 * Mapa de categoria — agregação read-only sobre produtos/score do último ScrapeRun.
 */
import { getLatestAndPreviousRun } from "./_common.mjs";
import { computeProductScoreLine, rotuloScore } from "./lib/product-score.mjs";

const TOP_PRODUCTS_PER_SUB = 5;

/**
 * Extrai mestre e subcategoria a partir de `Product.categoryUrl` (texto breadcrumb ou URL única linha).
 * Ex.: "Womenswear & Underwear / Women's Dresses" → master primeiro segmento antes de " / ".
 *
 * @param {string | null | undefined} categoryUrl
 * @returns {{ masterCategory: string, subcategory: string }}
 */
export function parseCategory(categoryUrl) {
  if (categoryUrl == null || typeof categoryUrl !== "string") {
    return { masterCategory: "Sem categoria", subcategory: "—" };
  }
  const t = categoryUrl.trim();
  if (!t) return { masterCategory: "Sem categoria", subcategory: "—" };

  const parts = t
    .split(/\s*\/\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return { masterCategory: parts[0], subcategory: parts.slice(1).join(" / ") };
  }

  /** URL sem breadcrumb texto: usar pathname como etiqueta grossa */
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      const slug = decodeURIComponent(u.pathname.split("/").filter(Boolean).slice(-2).join(" / "));
      if (slug) {
        const sub = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return {
          masterCategory: u.hostname.replace(/^www\./, ""),
          subcategory: sub || "Raiz"
        };
      }
    }
  } catch {
    /* continua fallback */
  }

  const only = parts[0] ?? t;
  return { masterCategory: only, subcategory: only };
}

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

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getCategoryMapReport(prisma) {
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

  /** @type Map<string, { name: string, subs: typeof subAggs}> */
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

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    previousRun: previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null,
    hasGrowthComparableRuns: !!(count >= 2 && previous),
    masterCategories,
    snapshotsInLatestRun: snaps.length,
    topProductsPerSubcategory: TOP_PRODUCTS_PER_SUB,
    scoreMethod: `Subcategoria: média arredondada dos scores individuais (product-score v1). Top produtos por score (até ${TOP_PRODUCTS_PER_SUB}).`
  };
}
