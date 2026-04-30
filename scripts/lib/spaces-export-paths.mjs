/**
 * Convenção de pastas no object storage (DigitalOcean Spaces, S3-compatível).
 *
 * Estrutura:
 *   {root}/{platform}/{categorySlug}/{productSlug}__{productId}/
 *
 * Ex.: product-research/tiktok-shop/roupas-intimas/camiseta-basica__1732593847561/
 *
 * O `productId` estabiliza colisões quando dois títulos geram o mesmo slug.
 */

const DEFAULT_ROOT = "product-research";
const DEFAULT_PLATFORM = "tiktok-shop";

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
  const root = slugifySegment(p.root?.trim() || DEFAULT_ROOT, 48) || DEFAULT_ROOT.replace(/[^a-z0-9-]/g, "");
  const platform = slugifySegment(p.platform?.trim() || DEFAULT_PLATFORM, 48) || DEFAULT_PLATFORM;
  const category = slugifySegment(p.categorySlug?.trim() || "sem-categoria", 72) || "sem-categoria";
  const nameSlug = slugifySegment(p.productName?.trim() || "produto", 80) || "produto";
  const id = sanitizeProductId(p.productId);
  const folder = `${nameSlug}__${id}`;
  return [root, platform, category, folder].join("/").replace(/\/+/g, "/");
}

export { DEFAULT_ROOT, DEFAULT_PLATFORM };
