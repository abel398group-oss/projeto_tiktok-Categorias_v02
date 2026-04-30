const LS_KEY = "tiktok-analytics-workspace-recent";
const MAX = 20;

/**
 * Guarda/atualiza entrada no topo da lista (apenas este browser).
 * @param {{ productId: string, nome?: string }} entry
 */
export function pushRecentWorkspace(entry) {
  const productId = String(entry.productId ?? "").trim();
  const nome = String(entry.nome ?? "—").trim() || "—";
  if (!productId) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    /** @type {{ productId: string, nome: string, at: string }[]} */
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    const next = [{ productId, nome, at: new Date().toISOString() }, ...list.filter((x) => x?.productId !== productId)].slice(
      0,
      MAX
    );
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** @returns {{ productId: string, nome: string, at: string }[]} */
export function getRecentWorkspace() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearRecentWorkspace() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
