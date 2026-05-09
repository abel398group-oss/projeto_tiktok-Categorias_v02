/**
 * Estado local por produto (somente este browser): productId → chave de pipeline.
 * Armazén: localStorage sob a chave `productStatus` — objeto { [productId]: statusKey }.
 * Valores legados (`exportado`, `testar`) são migrados na leitura para chaves canónicas.
 */

export const PRODUCT_STATUS_STORAGE_KEY = "productStatus";

const LS_KEY = PRODUCT_STATUS_STORAGE_KEY;

/**
 * Chaves canónicas do pipeline creator.
 * @typedef {"descoberto" | "em_analise" | "em_teste" | "conteudo_produzido" | "publicado" | "descartado"} ProductStatusKey
 */

/** @type {ProductStatusKey} */
export const PRODUCT_STATUS_DEFAULT = "descoberto";

/**
 * Migra valor bruto guardado antes do pipeline v2.
 * @param {unknown} v
 * @returns {string}
 */
export function migrateRawStatusValue(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === "exportado") return "conteudo_produzido";
  if (s === "testar") return "em_teste";
  return s;
}

/** @type {{ key: ProductStatusKey, label: string, emoji: string, hint: string }[]} */
export const PRODUCT_STATUS_OPTIONS = [
  { key: "descoberto", label: "Descoberto", emoji: "📥", hint: "Viu o produto nos dados; ainda não avançou o trabalho criativo." },
  { key: "em_analise", label: "Em análise", emoji: "🔎", hint: "A avaliar fit, concorrência e números antes de comprometer conteúdo." },
  { key: "em_teste", label: "Em teste", emoji: "🧪", hint: "A testar criativo, ângulo ou pequena aposta antes de escalar." },
  {
    key: "conteudo_produzido",
    label: "Conteúdo produzido",
    emoji: "🎬",
    hint: "Material pronto (ex.: gravação/edit); alinhado ao que antes era «Exportado» após envio ao Spaces."
  },
  { key: "publicado", label: "Publicado", emoji: "🚀", hint: "Conteúdo ou promoção já no ar no canal." },
  { key: "descartado", label: "Descartado", emoji: "❌", hint: "Não seguir com este produto neste momento." }
];

const ALLOWED = new Set(/** @type {string[]} */ (PRODUCT_STATUS_OPTIONS.map((o) => o.key)));

/**
 * Normaliza qualquer valor (canónico, legado ou vazio) para uma chave de pipeline válida.
 * @param {unknown} v
 * @returns {ProductStatusKey}
 */
export function normalizeProductStatusKey(v) {
  const s = migrateRawStatusValue(v);
  if (!s || !ALLOWED.has(s)) return PRODUCT_STATUS_DEFAULT;
  return /** @type {ProductStatusKey} */ (s);
}

/**
 * @param {ProductStatusKey | string} key
 * @returns {{ key: ProductStatusKey, label: string, emoji: string, hint: string } | undefined}
 */
export function productStatusMeta(key) {
  const k = normalizeProductStatusKey(key);
  return PRODUCT_STATUS_OPTIONS.find((o) => o.key === k);
}

/**
 * Texto curto para badge (emoji + label).
 * @param {ProductStatusKey | string} key
 */
export function badgeTextForProductStatus(key) {
  const m = productStatusMeta(key);
  if (!m) return "📥 Descoberto";
  return `${m.emoji} ${m.label}`;
}

/**
 * @returns {Record<string, ProductStatusKey>}
 */
export function getProductStatuses() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (obj == null || typeof obj !== "object") return {};
    /** @type {Record<string, ProductStatusKey>} */
    const out = {};
    let dirty = false;
    for (const [k, val] of Object.entries(obj)) {
      const pid = String(k ?? "").trim();
      if (!pid) continue;
      const storedStr = typeof val === "string" ? val.trim() : "";
      const canonical = normalizeProductStatusKey(val);
      out[pid] = canonical;
      if (storedStr !== canonical) dirty = true;
    }
    if (dirty) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(out));
      } catch {
        /* ignore quota */
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Estado efectivo para um productId (sem gravar): ausente ou inválido → descoberto.
 * @param {string} productId
 * @returns {ProductStatusKey}
 */
export function getProductStatusForProduct(productId) {
  const pid = String(productId ?? "").trim();
  if (!pid) return PRODUCT_STATUS_DEFAULT;
  const m = getProductStatuses();
  return normalizeProductStatusKey(m[pid]);
}

/**
 * @param {string} productId
 * @param {ProductStatusKey | "exportado" | "testar"} statusKey — aceita chaves legadas; grava sempre canónico.
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

/** @param {ProductStatusKey | string} key */
export function labelForProductStatus(key) {
  return productStatusMeta(key)?.label ?? "Descoberto";
}
