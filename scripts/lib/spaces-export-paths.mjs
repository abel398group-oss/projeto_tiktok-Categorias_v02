/**
 * Convenção de pastas no object storage (DigitalOcean Spaces, S3-compatível).
 *
 * Estrutura por defeito (sem nível extra na raiz):
 *   {platform}/{categorySlug}/{productSlug}__{productId}/
 *
 * Opcional: prefixar com `SPACES_EXPORT_ROOT` (ex. product-research) →
 *   {root}/{platform}/{categorySlug}/{productSlug}__{productId}/
 *
 * O `productId` estabiliza colisões quando dois títulos geram o mesmo slug.
 */

const DEFAULT_ROOT = "";
const DEFAULT_PLATFORM = "tiktok-shop";

/**
 * Raiz opcional vinda do env. Sem `SPACES_EXPORT_ROOT` definido → string vazia (sem pasta extra antes de tiktok-shop).
 * Para o layout antigo: `SPACES_EXPORT_ROOT=product-research`
 */
export function resolvedExportRoot() {
  const raw = process.env.SPACES_EXPORT_ROOT;
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

/**
 * @param {string | null | undefined} s
 * @param {number} [maxLen]
 */
export function slugifySegment(s, maxLen = 64) {
  if (s == null || String(s).trim() === "") return "";
  let t = String(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  t = t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (maxLen > 0 && t.length > maxLen) t = t.slice(0, maxLen).replace(/-+$/, "");
  return t || "item";
}

/**
 * @param {string | null | undefined} id
 */
export function sanitizeProductId(id) {
  const s = String(id ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "unknown";
}

/**
 * Prefixo da pasta do produto (sem barra final).
 * @param {{
 *   root?: string,
 *   platform?: string,
 *   categorySlug?: string | null,
 *   productName?: string | null,
 *   productId?: string | null,
 * }} p
 */
export function buildProductExportPrefix(p) {
  const rawRoot = p.root != null ? String(p.root).trim() : "";
  const rootSlug = rawRoot ? slugifySegment(rawRoot, 48) : "";
  const platform = slugifySegment(p.platform?.trim() || DEFAULT_PLATFORM, 48) || DEFAULT_PLATFORM;
  const category = slugifySegment(p.categorySlug?.trim() || "sem-categoria", 72) || "sem-categoria";
  const nameSlug = slugifySegment(p.productName?.trim() || "produto", 80) || "produto";
  const id = sanitizeProductId(p.productId);
  const folder = `${nameSlug}__${id}`;
  /** @type {string[]} */
  const segments = [rootSlug, platform, category, folder].filter((s) => s.length > 0);
  return segments.join("/").replace(/\/+/g, "/");
}

/**
 * Extrai slug de categoria legível a partir de `categoryUrl` (feed TikTok Shop).
 * @param {string | null | undefined} categoryUrl
 */
export function deriveCategorySlugFromUrl(categoryUrl) {
  if (categoryUrl == null || String(categoryUrl).trim() === "") return "sem-categoria";
  try {
    const trimmed = String(categoryUrl).trim();
    const base = trimmed.startsWith("http") ? undefined : "https://shop.tiktok.com";
    const u = new URL(trimmed, base);
    const segs = u.pathname.split("/").filter(Boolean);
    if (!segs.length) return slugifySegment(categoryUrl, 72) || "sem-categoria";
    const raw = segs.slice(-2).join(" ") || segs[segs.length - 1];
    return slugifySegment(raw, 72) || "sem-categoria";
  } catch {
    return slugifySegment(String(categoryUrl), 72) || "sem-categoria";
  }
}

export { DEFAULT_ROOT, DEFAULT_PLATFORM };
