/**
 * Shortlist / favoritos do creator — só neste browser.
 * Chave: `tiktok-analytics-creator-shortlist`
 */

export const CREATOR_SHORTLIST_STORAGE_KEY = "tiktok-analytics-creator-shortlist";

const LS_KEY = CREATOR_SHORTLIST_STORAGE_KEY;

/** Máximo de entradas (evita crescimento descontrolado no localStorage). */
export const CREATOR_SHORTLIST_MAX = 100;

/**
 * @typedef {{ productId: string, nome: string, addedAt: string }} CreatorShortlistEntry
 */

/**
 * @returns {CreatorShortlistEntry[]}
 */
export function getCreatorShortlist() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /** @type {CreatorShortlistEntry[]} */
    const out = [];
    const seen = new Set();
    for (const item of parsed) {
      if (item == null || typeof item !== "object") continue;
      const productId = String(/** @type {Record<string, unknown>} */ (item).productId ?? "").trim();
      if (!productId || seen.has(productId)) continue;
      seen.add(productId);
      const nomeRaw = String(/** @type {Record<string, unknown>} */ (item).nome ?? "").trim();
      const nome = nomeRaw || "—";
      const at = String(/** @type {Record<string, unknown>} */ (item).addedAt ?? "").trim();
      const addedAt = at && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString();
      out.push({ productId, nome, addedAt });
      if (out.length >= CREATOR_SHORTLIST_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** @param {CreatorShortlistEntry[]} list */
function persistCreatorShortlist(list) {
  try {
    const next = list.slice(0, CREATOR_SHORTLIST_MAX);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

/** @param {unknown} productId */
export function isProductInShortlist(productId) {
  const id = String(productId ?? "").trim();
  if (!id) return false;
  return getCreatorShortlist().some((e) => e.productId === id);
}

/**
 * Adiciona à shortlist (dedupe: se já existir, actualiza só o nome se mudou).
 * @param {{ productId: string, nome?: string }} entry
 * @returns {{ added: boolean }} — `added` false se já estava na lista.
 */
export function addToCreatorShortlist(entry) {
  const productId = String(entry.productId ?? "").trim();
  if (!productId) return { added: false };
  const nome = String(entry.nome ?? "—").trim() || "—";
  const list = getCreatorShortlist();
  const idx = list.findIndex((e) => e.productId === productId);
  if (idx >= 0) {
    if (list[idx].nome !== nome) {
      const next = [...list];
      next[idx] = { ...next[idx], nome };
      persistCreatorShortlist(next);
    }
    return { added: false };
  }
  const next = [{ productId, nome, addedAt: new Date().toISOString() }, ...list].slice(0, CREATOR_SHORTLIST_MAX);
  persistCreatorShortlist(next);
  return { added: true };
}

/** @param {unknown} productId */
export function removeFromCreatorShortlist(productId) {
  const id = String(productId ?? "").trim();
  if (!id) return;
  const next = getCreatorShortlist().filter((e) => e.productId !== id);
  persistCreatorShortlist(next);
}

/**
 * @param {{ productId: string, nome?: string }} entry
 * @returns {{ inList: boolean }} — estado depois do toggle.
 */
export function toggleCreatorShortlist(entry) {
  const id = String(entry.productId ?? "").trim();
  if (!id) return { inList: false };
  if (isProductInShortlist(id)) {
    removeFromCreatorShortlist(id);
    return { inList: false };
  }
  addToCreatorShortlist(entry);
  return { inList: true };
}
