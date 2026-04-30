/**
 * Estado local por produto (somente este browser): productId → chave de status.
 * Armazén: localStorage sob a chave `productStatus` — objeto { [productId]: statusKey }.
 */

const LS_KEY = "productStatus";

/** @typedef {"em_analise" | "exportado" | "testar" | "descartado"} ProductStatusKey */

/** @type {ProductStatusKey} */
export const PRODUCT_STATUS_DEFAULT = "em_analise";

/** @type {{ key: ProductStatusKey, label: string }[]} */
export const PRODUCT_STATUS_OPTIONS = [
  { key: "em_analise", label: "Em análise" },
  { key: "exportado", label: "Exportado" },
  { key: "testar", label: "Testar" },
  { key: "descartado", label: "Descartado" }
];

const ALLOWED = new Set(PRODUCT_STATUS_OPTIONS.map((o) => o.key));

/** @param {unknown} v */
export function normalizeProductStatusKey(v) {
  const s = typeof v === "string" ? v.trim() : "";
  /** @type {ProductStatusKey} */
  const def = PRODUCT_STATUS_DEFAULT;
  if (!s || !ALLOWED.has(/** @type {ProductStatusKey} */ (s))) return def;
  return /** @type {ProductStatusKey} */ (s);
}

/** @returns {Record<string, ProductStatusKey>} */
export function getProductStatuses() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (obj == null || typeof obj !== "object") return {};
    /** @type {Record<string, ProductStatusKey>} */
    const out = {};
    for (const [k, val] of Object.entries(obj)) {
      const pid = String(k ?? "").trim();
      if (!pid) continue;
      out[pid] = normalizeProductStatusKey(val);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {string} productId
 * @param {ProductStatusKey} statusKey
 */
export function setProductStatus(productId, statusKey) {
  const pid = String(productId ?? "").trim();
  if (!pid) return;
  const key = normalizeProductStatusKey(statusKey);
  try {
    const prev = getProductStatuses();
    const next = { ...prev, [pid]: key };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

/** @param {ProductStatusKey} key */
export function labelForProductStatus(key) {
  const k = normalizeProductStatusKey(key);
  return PRODUCT_STATUS_OPTIONS.find((o) => o.key === k)?.label ?? "Em análise";
}
