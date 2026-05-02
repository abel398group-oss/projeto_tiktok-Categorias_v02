/**
 * Formato legível no Mapa (defensivo): repara mestre `https:` + sub como path TikTok bruto,
 * até quando a API ainda não aplica parse no servidor ou há cache antigo.
 */

const SHOP_MASTER = "TikTok Shop";

/** @param {string} segment */
function humanizeSlug(segment) {
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
 * @param {URL} u
 * @returns {{ mestre: string, categoria: string } | null}
 */
function fromTiktokShopCategoryUrl(u) {
  if (!/(^|\.)tiktok\.com$/i.test(u.hostname)) return null;

  const segments = u.pathname.split("/").filter(Boolean);
  const ci = segments.findIndex((s) => String(s).toLowerCase() === "c");
  if (ci === -1) return null;

  const tail = [...segments.slice(ci + 1)];
  let id = null;
  while (tail.length) {
    const last = String(tail[tail.length - 1]).split("?")[0];
    if (/^\d+$/.test(last)) {
      id = last;
      tail.pop();
    } else break;
  }

  const labels = tail.map((s) => humanizeSlug(s)).filter(Boolean);
  const suffix = id ? ` · ${id}` : "";

  if (!labels.length) return { mestre: SHOP_MASTER, categoria: id ? `ID ${id}` : "—" };
  if (labels.length === 1) return { mestre: SHOP_MASTER, categoria: `${labels[0]}${suffix}` };
  return { mestre: labels.slice(0, -1).join(" · "), categoria: `${labels[labels.length - 1]}${suffix}` };
}

/** @param {string} messy */
function tiktokShopUrlFromChunk(messy) {
  /** ` / ` → `/`; path até `?`/`#`. */
  let pathChunk = messy.trim().replace(/\s*\/\s*/g, "/").split(/[?#]/)[0] ?? "";

  if (!/^https?:\/\//i.test(pathChunk)) pathChunk = `https://${pathChunk}`;

  pathChunk = pathChunk.replace(/^https:\/(?!\/)/i, "https://");

  try {
    return new URL(pathChunk);
  } catch {
    return null;
  }
}

/** @param {string} t */
function coerceShopCategoryUrlLocal(t) {
  if (!t) return t;
  if (!/tiktok|shop\.tiktok/i.test(t)) return t;
  let out = t.replace(/\s*\/\s*/g, "/");
  out = out.replace(/^https:\/(?!\/)/i, "https://").replace(/^http:\/(?!\/)/i, "http://");
  out = out.replace(/^https:\/\/\/+/, "https://");
  out = out.replace(/^http:\/\/\/+/, "http://");
  if (!/^https?:\/\//i.test(out) && /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(out)) out = `https://${out}`;
  return out.trim();
}

/** @param {string} s */
function stripQueryIfUrlLooksLikePath(s) {
  if (s == null || !s.includes("?")) return s;
  if (/tiktok\.com|shop\.tiktok|^https?:\/\//i.test(s)) return s.split("?")[0].trimEnd();
  return s;
}

/**
 * Extrai mestre + sub para o cabeçalho de analytics por categoria (alinhado ao Mapa /
 * heuristicas de Product.categoryUrl: TikTok `/c/slug/id`, breadcrumbs "A / B", outros HTTPS).
 *
 * @param {string | null | undefined} categoryUrlStored URL normalizada da API ou texto guardado na BD.
 * @returns {{ masterCategory: string, subcategory: string }}
 */
export function parseCategoryBreadForHeader(categoryUrlStored) {
  if (categoryUrlStored == null || typeof categoryUrlStored !== "string") {
    return { masterCategory: "—", subcategory: "—" };
  }
  let raw = categoryUrlStored.trim();
  if (!raw) return { masterCategory: "—", subcategory: "—" };

  raw = coerceShopCategoryUrlLocal(raw);

  /** @type {URL | null} */
  let u = null;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    u = tiktokShopUrlFromChunk(raw);
  }

  if (u && /(^|\.)tiktok\.com$/i.test(u.hostname)) {
    const p = fromTiktokShopCategoryUrl(u);
    if (p) return { masterCategory: p.mestre, subcategory: p.categoria };
  }

  const hasHumanSep = /\s\/\s/.test(raw);
  const looksLikeBareUrlHost = /\btiktok\.com\b|\bshop\.tiktok\b/i.test(raw);
  const hasScheme = /^https?:\/\//i.test(raw);

  if (hasHumanSep && !looksLikeBareUrlHost && !hasScheme) {
    const segs = raw
      .split(/\s*\/\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (segs.length >= 2 && !/^(?:https?|ftp):$/i.test(segs[0])) {
      return { masterCategory: segs[0], subcategory: segs.slice(1).join(" / ") };
    }
  }

  if (hasScheme && u) {
    const pathSegs = u.pathname.split("/").filter(Boolean);
    const leaf = humanizeSlug(pathSegs[pathSegs.length - 1] ?? "") || pathSegs.join(" › ") || "—";
    const host = u.hostname.replace(/^www\./, "");
    return { masterCategory: host || "—", subcategory: leaf || "—" };
  }

  const stripped = stripQueryIfUrlLooksLikePath(raw);
  return { masterCategory: stripped, subcategory: stripped };
}

/**
 * Labels finais para células **mestre** | **categoria · ID** no Mapa.
 *
 * @param {string | undefined | null} masterName
 * @param {string | undefined | null} subName
 * @returns {{ mestre: string, categoria: string }}
 */
export function mapCategoryTableLabels(masterName, subName) {
  const mestre = masterName ?? "—";
  const subRaw = String(subName ?? "");

  /** Padrão típico: mestre só `https:` + sub como path TikTok espaçado/bruto */
  const needsRepair =
    /^https?:$/i.test(String(masterName ?? "").trim()) &&
    /\btiktok\b/i.test(subRaw) &&
    /\/c\//i.test(subRaw.replace(/\s/g, ""));

  if (!needsRepair) return { mestre, categoria: subRaw || "—" };

  const u = tiktokShopUrlFromChunk(subRaw);
  const parsed = u ? fromTiktokShopCategoryUrl(u) : null;
  if (parsed) return parsed;

  return { mestre, categoria: subRaw.replace(/\?[^\s]+$/, "").trimEnd() };
}
