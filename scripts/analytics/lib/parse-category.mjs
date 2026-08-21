/**
 * Parsing de categorias gravadas em produto (`Product.categoryUrl`) — breadcrumbs e URLs TikTok Shop.
 * Partilhado por mapa, score, top-products, opportunities e UI.
 */
import { CATEGORY_GROUP_BY_SLUG_ID } from "./category-groups.mjs";

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

/** @param {string[]} segmentsAfterC */
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

/** @param {string} t */
function normalizeSpacedSlashUrlCandidate(t) {
  if (!/\s\/\s/.test(t)) return t;
  const collapsed = t.replace(/\s/g, "");
  const seemsUrlish =
    /^https?\s*:|\b(?:https?):/i.test(t) ||
    /tiktok\.com|shop\.tiktok/i.test(collapsed) ||
    (/\.(?:com|shop)(?:\/|$|[?#])/i.test(collapsed) && /\/(?:br|c|shop|category|pdp)\b/i.test(collapsed));

  if (!seemsUrlish) return t;

  let out = t.replace(/\s*\/\s*/g, "/");
  out = out.replace(/^https:\/(?!\/)/i, "https://").replace(/^http:\/(?!\/)/i, "http://");
  out = out.replace(/^https:\/\/\/+/, "https://");
  out = out.replace(/^http:\/\/\/+/, "http://");
  return out.trim();
}

/** @param {string} raw */
function parseCategoryFromTikTokUrl(raw) {
  let normalized = raw.trim();
  if (!normalized) return null;
  if (!/^https?:\/\//i.test(normalized)) {
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
    // CATALOG só guarda a folha (1 segmento) — sem breadcrumb na URL não dá
    // para derivar o grupo-pai geometricamente. CATEGORY_GROUP_BY_SLUG_ID é o
    // mesmo agrupamento que o CATALOG já usa (ver category-groups.mjs); só cai
    // no genérico "TikTok Shop" quando a folha não está catalogada.
    const groupKey = numericId ? `${slugSegs[0]}/${numericId}` : null;
    const master = (groupKey && CATEGORY_GROUP_BY_SLUG_ID[groupKey]) || TIKTOK_SHOP_MASTER;
    return { masterCategory: master, subcategory: `${labels[0]}${idSuffix}` };
  }
  return {
    masterCategory: labels.slice(0, -1).join(" · "),
    subcategory: `${labels[labels.length - 1]}${idSuffix}`
  };
}

/** @param {string} s */
function stripQueryIfUrlLooksLikePath(s) {
  if (s == null || !s.includes("?")) return s;
  if (/tiktok\.com|shop\.tiktok|^https?:\/\//i.test(s)) return s.split("?")[0].trimEnd();
  return s;
}

/** @param {string} t */
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
 * Extrai mestre e sub a partir do texto/url de categoria (mesma semântica que o relatório Mapa).
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

  const tBread = tNormalized;

  const hasHumanSep = /\s\/\s/.test(tBread);
  const looksLikeBareUrlHost = /\btiktok\.com\b|\bshop\.tiktok\b/i.test(tBread);
  const hasScheme = /^https?:\/\//i.test(tBread);

  if (hasHumanSep && !looksLikeBareUrlHost && !hasScheme) {
    const segs = tBread
      .split(/\s*\/\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (segs.length >= 2 && !/^(?:https?|ftp):$/i.test(segs[0])) {
      return { masterCategory: segs[0], subcategory: segs.slice(1).join(" / ") };
    }
  }

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
