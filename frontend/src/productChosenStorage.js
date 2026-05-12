export const CHOSEN_PRODUCTS_STORAGE_KEY = "tiktok-analytics-chosen-products";
export const CHOSEN_PRODUCTS_CHANGED_EVENT = "tiktok-analytics-chosen-products-changed";

const LS_KEY = CHOSEN_PRODUCTS_STORAGE_KEY;
const MAX = 200;

function dispatchChosenChanged() {
  try {
    window.dispatchEvent(new Event(CHOSEN_PRODUCTS_CHANGED_EVENT));
  } catch {
  }
}

function normalizeEntry(entry) {
  const productId = String(entry?.productId ?? "").trim();
  if (!productId) return null;
  const nome = String(entry?.nome ?? "").trim();
  const tiktokUrl = String(entry?.tiktokUrl ?? "").trim();
  return {
    productId,
    ...(nome ? { nome } : {}),
    ...(tiktokUrl ? { tiktokUrl } : {}),
    at: new Date().toISOString()
  };
}

export function getChosenProducts() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((x) => ({
        productId: String(x?.productId ?? "").trim(),
        nome: typeof x?.nome === "string" ? x.nome : undefined,
        tiktokUrl: typeof x?.tiktokUrl === "string" ? x.tiktokUrl : undefined,
        at: typeof x?.at === "string" ? x.at : undefined
      }))
      .filter((x) => x.productId !== "");
  } catch {
    return [];
  }
}

export function addChosenProduct(entry) {
  const norm = normalizeEntry(entry);
  if (!norm) return false;
  try {
    const prev = getChosenProducts();
    const next = [norm, ...prev.filter((x) => x.productId !== norm.productId)].slice(0, MAX);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    dispatchChosenChanged();
    return true;
  } catch {
    return false;
  }
}

export function removeChosenProduct(productId) {
  const pid = String(productId ?? "").trim();
  if (!pid) return false;
  try {
    const prev = getChosenProducts();
    const next = prev.filter((x) => x.productId !== pid);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    dispatchChosenChanged();
    return true;
  } catch {
    return false;
  }
}

export function isProductChosen(productId) {
  const pid = String(productId ?? "").trim();
  if (!pid) return false;
  try {
    return getChosenProducts().some((x) => x.productId === pid);
  } catch {
    return false;
  }
}
