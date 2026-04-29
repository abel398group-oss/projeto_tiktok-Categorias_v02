/**
 * Mapa de categoria — agregação read-only sobre produtos/score do último ScrapeRun.
 */
import { getLatestAndPreviousRun } from "./_common.mjs";
import { computeProductScoreLine, rotuloScore } from "./lib/product-score.mjs";

const TOP_PRODUCTS_PER_SUB = 5;

const TIKTOK_SHOP_MASTER = "TikTok Shop";

/**
 * Aceita último segmento numérico (ID da categoria) e remove-o da lista de slugs.
 * @param {string[]} segments
 */
function dropTrailingNumericCategoryId(segments) {
  const out = [...segments];
  while (out.length > 0) {
    const last = String(out[out.length - 1]).split("?")[0];
    if (/^\d+$/.test(last)) out.pop();
    else break;
  }
  return out;
}

/** Último segmento só numérico no path TikTok (= ID da pasta), sem query. */
function extractTrailingCategoryIdNumeric(segmentsAfterC) {
  if (!segmentsAfterC.length) return null;
  const last = String(segmentsAfterC[segmentsAfterC.length - 1]).split("?")[0];
  return /^\d+$/.test(last) ? last : null;
}

/** @param {string} segment */
function humanizeSlugSegment(segment) {
  const base = String(segment).split("?")[0];
  if (!base || base.toLowerCase() === "c") return "";
  if (/^\d+$/.test(base)) return "";
  try {
    const decoded = decodeURIComponent(base);
    return decoded
      .replace(/[+]/g, " ")
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  } catch {
    return base.replace(/-/g, " ");
  }
}

/**
 * Algumas fontes repetem barras como `https: / … / shop.tiktok.com / br / …` ou `shop … / br /`.
 * Junta em path válido antes de `parseCategoryFromTikTokUrl` ou `URL()`.
 *
 * @param {string} t
 */
function normalizeSpacedSlashUrlCandidate(t) {
  if (!/\s\/\s/.test(t)) return t;
  const collapsed = t.replace(/\s/g, "");
  const seemsUrlish =
    /^https?\s*:|\b(?:https?):/i.test(t) ||
    /tiktok\.com|shop\.tiktok/i.test(collapsed) ||
    (/\.(?:com|shop)(?:\/|$|[?#])/i.test(collapsed) && /\/(?:br|c|shop|category|pdp)\b/i.test(collapsed));

  if (!seemsUrlish) return t;

  let out = t.replace(/\s*\/\s*/g, "/");
  /** `https: / foo` ou `https:/foo` → `https://foo` */
  out = out.replace(/^https:\/(?!\/)/i, "https://").replace(/^http:\/(?!\/)/i, "http://");

  /** Ex.: `https:///host` após junção de espaços */
  out = out.replace(/^https:\/\/\/+/, "https://");
  out = out.replace(/^http:\/\/\/+/, "http://");

  return out.trim();
}

/**
 * Paths típicos: `…/br/c/womenswear-underwear/601152`, possivelmente vários slugs antes do ID.
 *
 * @param {string} raw
 */
function parseCategoryFromTikTokUrl(raw) {
  let normalized = raw.trim();
  if (!normalized) return null;
  if (!/^https?:\/\//i.test(normalized)) {
    // `shop.tiktok.com/...`
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    } else return null;
  }

  /** @type {URL} */
  let u;
  try {
    u = new URL(normalized);
  } catch {
    return null;
  }
  if (!/(^|\.)tiktok\.com$/i.test(u.hostname)) return null;

  const segments = u.pathname.split("/").filter(Boolean);
  const cIdx = segments.findIndex((s) => String(s).toLowerCase() === "c");
  if (cIdx === -1) return null;

  const afterC = segments.slice(cIdx + 1);
  const numericId = extractTrailingCategoryIdNumeric(afterC);
  const slugSegs = dropTrailingNumericCategoryId(afterC);
  const labels = slugSegs.map((s) => humanizeSlugSegment(s)).filter((x) => x.length > 0);

  const idSuffix = numericId ? ` · ${numericId}` : "";

  if (labels.length === 0) {
    return {
      masterCategory: TIKTOK_SHOP_MASTER,
      subcategory: numericId ? `ID ${numericId}` : "Categoria (slug vazio)"
    };
  }
  if (labels.length === 1) {
    return { masterCategory: TIKTOK_SHOP_MASTER, subcategory: `${labels[0]}${idSuffix}` };
  }
  return {
    masterCategory: labels.slice(0, -1).join(" · "),
    subcategory: `${labels[labels.length - 1]}${idSuffix}`
  };
}

/**
 * Extrai mestre e subcategoria a partir de `Product.categoryUrl` (texto breadcrumb ou URL).
 * URLs TikTok tipo `shop.tiktok.com/.../c/<slug>/<id>` são mostradas com nomes legíveis derivados dos slugs (hífen → espaços, capitalização).
 *
 * Ex. texto: "Womenswear & Underwear / Women's Dresses" → master primeiro segmento antes de " / ".
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

  const tNormalized = normalizeSpacedSlashUrlCandidate(coerceShopCategoryUrl(t));

  const tikTok = parseCategoryFromTikTokUrl(tNormalized);
  if (tikTok) return tikTok;

  /** Após tentar TikTok Shop: breadcrumbs humanos (espaços em torno de "/") só se não parecer URL. */
  const tBread = tNormalized;

  const hasHumanSep = /\s\/\s/.test(tBread);
  const looksLikeBareUrlHost = /\btiktok\.com\b|\bshop\.tiktok\b/i.test(tBread);
  const hasScheme = /^https?:\/\//i.test(tBread);

  if (hasHumanSep && !looksLikeBareUrlHost && !hasScheme) {
    const segs = tBread
      .split(/\s*\/\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    /** `https://…` partido por `/` dá `https:` como primeiro segmento — não é breadcrumb humano. */
    if (segs.length >= 2 && !/^(?:https?|ftp):$/i.test(segs[0])) {
      return { masterCategory: segs[0], subcategory: segs.slice(1).join(" / ") };
    }
  }

  /** Outras URLs HTTPS (não TikTok já tratado): hostname + último segmento nomeável */
  if (hasScheme) {
    try {
      const u = new URL(tBread);
      const pathSegs = u.pathname.split("/").filter(Boolean);
      const leaf =
        humanizeSlugSegment(pathSegs[pathSegs.length - 1] ?? "") || pathSegs.join(" › ") || "—";
      return {
        masterCategory: u.hostname.replace(/^www\./, ""),
        subcategory: leaf
      };
    } catch {
      /* noop */
    }
  }

  const stripped = stripQueryIfUrlLooksLikePath(tBread);
  return { masterCategory: stripped, subcategory: stripped };
}

/** Corta `?…` apenas quando o texto parece URL (útil para não exibir trackers longos). */
function stripQueryIfUrlLooksLikePath(s) {
  if (s == null || !s.includes("?")) return s;
  if (/tiktok\.com|shop\.tiktok|^https?:\/\//i.test(s)) return s.split("?")[0].trimEnd();
  return s;
}

/** TikTok Shop: junta barras mesmo com espaços; corrige schemes frágeis sem depender só de `\s/\s`. */
function coerceShopCategoryUrl(t) {
  if (!t) return t;
  if (!/tiktok|shop\.tiktok/i.test(t)) return t;
  let out = t.replace(/\s*\/\s*/g, "/");
  out = out.replace(/^https:\/(?!\/)/i, "https://").replace(/^http:\/(?!\/)/i, "http://");
  out = out.replace(/^https:\/\/\/+/, "https://");
  out = out.replace(/^http:\/\/\/+/, "http://");
  if (!/^https?:\/\//i.test(out) && /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(out)) out = `https://${out}`;
  return out.trim();
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
