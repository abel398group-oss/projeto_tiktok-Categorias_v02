/**
 * Classificação visual de ticket (preço) só no cliente — não altera API nem score.
 */
import { firstFloat } from "./sortUtils.js";

/** @typedef {'baixo' | 'medio' | 'alto'} TicketTier */

/**
 * Filtro client-side: faixas simples ou combinações usadas pelos Creator Presets.
 * @typedef {'all' | TicketTier | 'medio_alto' | 'baixo_medio'} TicketFilterMode
 */

/**
 * @typedef {{ tier: TicketTier | null, label: string, shortLabel: string }} TicketLabelResult
 */

/** @param {unknown} raw */
function parsePriceField(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (s === "" || s === "—") return null;
  const normalized = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isFinite(n)) return n;
  const f = firstFloat(s);
  return Number.isFinite(f) ? f : null;
}

/**
 * Preço numérico a partir dos campos habituais das linhas do painel.
 * @param {unknown} item
 * @returns {number | null}
 */
export function getTicketPrice(item) {
  if (item == null || typeof item !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (item);
  return parsePriceField(o.preco ?? o.price ?? o.avgPrice);
}

/**
 * @param {unknown} item
 * @returns {TicketLabelResult}
 */
export function getTicketLabel(item) {
  const price = getTicketPrice(item);
  if (price == null) {
    return { tier: null, label: "Sem preço numérico", shortLabel: "—" };
  }
  if (price < 30) {
    return { tier: "baixo", label: "Ticket baixo", shortLabel: "Baixo" };
  }
  if (price < 80) {
    return { tier: "medio", label: "Ticket médio", shortLabel: "Médio" };
  }
  return { tier: "alto", label: "Ticket alto", shortLabel: "Alto" };
}

/**
 * @param {TicketFilterMode} filter
 * @param {unknown} row
 */
export function rowMatchesTicketFilter(filter, row) {
  if (filter === "all") return true;
  const tier = getTicketLabel(row).tier;
  if (filter === "medio_alto") return tier === "medio" || tier === "alto";
  if (filter === "baixo_medio") return tier === "baixo" || tier === "medio";
  return tier === filter;
}
