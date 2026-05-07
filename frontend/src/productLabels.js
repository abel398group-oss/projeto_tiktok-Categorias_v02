/**
 * Etiquetas só de leitura no browser — não altera score, filtros nem API.
 * Avalia sempre que os dados mínimos existem; caso contrário ignora a regra.
 */
import { firstFloat, parseDelta } from "./sortUtils.js";

/** @typedef {{ id: string, emoji: string, label: string }} ProductUiLabel */

/** @param {unknown} x */
function finiteNum(x) {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rating numérico: campos típicos das tabelas ou prefixo na string `rating` (ex.: "4.6 (12 aval)").
 * @param {Record<string, unknown>} row
 * @returns {number | null}
 */
function ratingValue(row) {
  const direct = finiteNum(row.ratingAverage ?? row.avalMed);
  if (direct != null) return direct;
  const r = row.rating;
  if (typeof r === "number") return finiteNum(r);
  if (typeof r === "string") {
    const f = firstFloat(r);
    return Number.isFinite(f) ? f : null;
  }
  return null;
}

/**
 * Número de avaliações quando existir campo dedicado ou sufixo em `rating`.
 * @param {Record<string, unknown>} row
 * @returns {number | null}
 */
function reviewsCount(row) {
  const d = finiteNum(row.avalTot ?? row.ratingTotal ?? row.reviews);
  if (d != null) return Math.round(d);
  const r = row.rating;
  if (typeof r === "string") {
    const m = r.match(/\(\s*(\d+)\s*aval/i);
    if (m) {
      const v = parseInt(m[1], 10);
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

/** Vendas “actuais” para regras (último snapshot / listagem habitual). */
function salesCurrent(row) {
  const v =
    finiteNum(row.vendas) ??
    finiteNum(row.vendasAtual) ??
    finiteNum(row.salesCount);
  return v;
}

function price(row) {
  return finiteNum(row.preco ?? row.price);
}

function score(row) {
  return finiteNum(row.score);
}

/**
 * Crescimento positivo segundo campos já usados nos payloads (Score/Opp/Growth).
 * @param {Record<string, unknown>} row
 */
function hasPositiveGrowth(row) {
  const delta = finiteNum(row.delta);
  if (delta != null && delta > 0) return true;
  const deltaNum = finiteNum(row.deltaNumeric);
  if (deltaNum != null && deltaNum > 0) return true;
  const salesD = finiteNum(row.salesDelta);
  if (salesD != null && salesD > 0) return true;
  const dv = row.deltaVendas;
  if (dv != null && dv !== "—") {
    const p = typeof dv === "string" ? parseDelta(dv) : finiteNum(dv);
    if (p != null && !Number.isNaN(p) && p > 0) return true;
  }
  return false;
}

/**
 * @param {unknown} row — linha típica de Product Score, Opportunities ou Em Ascensão
 * @returns {ReadonlyArray<ProductUiLabel>}
 */
export function deriveProductLabels(row) {
  try {
    if (row == null || typeof row !== "object") return [];
    /** @type {Record<string, unknown>} */
    const r = /** @type {Record<string, unknown>} */ (row);

    /** @type {ProductUiLabel[]} */
    const out = [];

    if (hasPositiveGrowth(r)) {
      out.push({ id: "crescendo", emoji: "🔥", label: "Crescendo" });
    }

    const sv = salesCurrent(r);
    const rv = ratingValue(r);
    const rc = reviewsCount(r);
    if (sv != null && sv >= 1 && sv <= 300 && rv != null && rv >= 4.5 && rc != null && rc >= 5) {
      out.push({ id: "hidden_gem", emoji: "💎", label: "Hidden Gem" });
    }

    if (sv != null && sv >= 10000) {
      out.push({ id: "saturado", emoji: "⚠️", label: "Saturado" });
    }

    const pv = price(r);
    if (pv != null && pv >= 80) {
      out.push({ id: "ticket_alto", emoji: "💰", label: "Ticket alto" });
    }

    const sc = score(r);
    if (
      sc != null &&
      sc >= 55 &&
      sv != null &&
      sv >= 50 &&
      sv <= 1000 &&
      rv != null &&
      rv >= 4.3
    ) {
      out.push({ id: "testar", emoji: "🧪", label: "Testar" });
    }

    return out;
  } catch {
    return [];
  }
}
