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
