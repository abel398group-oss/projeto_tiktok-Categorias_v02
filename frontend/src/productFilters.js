/**
 * Filtros client-side sobre linhas tabulares (Product Score / shapes semelhantes).
 * Alias de campo documentados pelo contrato Analytics — apenas leitura; sem API.
 */

/** @typedef {{
 * precoMin: string,
 * precoMax: string,
 * vendasMin: string,
 * vendasMax: string,
 * ratingMin: string,
 * scoreMin: string,
 * }} ProductFilterState */

/** Estado inicial — strings vazias = sem limite naquele lado. */
export const INITIAL_FILTER_STATE = {
  precoMin: "",
  precoMax: "",
  vendasMin: "",
  vendasMax: "",
  ratingMin: "",
  scoreMin: ""
};

/** @param {string} s */
function parseBound(s) {
  const t = String(s ?? "").trim();
  if (t === "") return null;
  const n = parseFloat(t.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} x */
function numLike(x) {
  if (x == null || x === "") return NaN;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = parseFloat(String(x).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Preço efectivo por linha (`preco`, `price`, `avgPrice`).
 * @param {Record<string, unknown>} row
 */
export function pickPrice(row) {
  for (const k of ["preco", "price", "avgPrice"]) {
    if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined && row[k] !== "") {
      const n = numLike(row[k]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return NaN;
}

/** @param {string | undefined} s */
function ratingFromString(s) {
  if (s == null || s === "") return NaN;
  const m = String(s).match(/^([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

/** Vendas: `vendas`, `salesCount`, `totalSales`. */
export function pickSales(row) {
  for (const k of ["vendas", "salesCount", "totalSales"]) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      const n = numLike(row[k]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return NaN;
}

/** Rating numérico: `ratingAverage`, `avgRating`, ou primeira fração em `rating` (texto API). */
export function pickRating(row) {
  const ra = row.ratingAverage;
  if (typeof ra === "number" && Number.isFinite(ra)) return ra;
  const ar = row.avgRating;
  if (typeof ar === "number" && Number.isFinite(ar)) return ar;
  const r = row.rating;
  if (typeof r === "number" && Number.isFinite(r)) return r;
  if (typeof r === "string") return ratingFromString(r);
  return NaN;
}

/** @param {Record<string, unknown>} row */
export function pickScore(row) {
  return numLike(row.score);
}

/** @param {ProductFilterState} f */
export function filtersAreInactive(f) {
  return (
    String(f.precoMin ?? "").trim() === "" &&
    String(f.precoMax ?? "").trim() === "" &&
    String(f.vendasMin ?? "").trim() === "" &&
    String(f.vendasMax ?? "").trim() === "" &&
    String(f.ratingMin ?? "").trim() === "" &&
    String(f.scoreMin ?? "").trim() === ""
  );
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ min?: number|null, max?: number|null }} range
 */
function passesRange(value, range) {
  const { min, max } = range;
  if ((min != null || max != null) && Number.isNaN(value)) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

/**
 * Devolve linhas que cumprem os limites preenchidos.
 * Limite em branco não filtra esse lado (min/max ausentes tratados como `null`).
 *
 * @param {readonly Record<string, unknown>[]} rows
 * @param {ProductFilterState} filters
 */
export function applyProductFilters(rows, filters) {
  const precoMin = parseBound(filters.precoMin);
  const precoMax = parseBound(filters.precoMax);
  const vendasMin = parseBound(filters.vendasMin);
  const vendasMax = parseBound(filters.vendasMax);
  const ratingMin = parseBound(filters.ratingMin);
  const scoreMin = parseBound(filters.scoreMin);

  if (
    precoMin == null &&
    precoMax == null &&
    vendasMin == null &&
    vendasMax == null &&
    ratingMin == null &&
    scoreMin == null
  ) {
    return [...rows];
  }

  const precoLim = { min: precoMin, max: precoMax };
  const vendasLim = { min: vendasMin, max: vendasMax };
  /** @type {readonly Record<string, unknown>[]} */
  const out = [];

  for (const row of rows) {
    const p = pickPrice(row);
    const v = pickSales(row);
    const r = pickRating(row);
    const s = pickScore(row);
    if (!passesRange(p, precoLim)) continue;
    if (!passesRange(v, vendasLim)) continue;
    if (!passesRange(r, { min: ratingMin, max: null })) continue;
    if (!passesRange(s, { min: scoreMin, max: null })) continue;
    out.push(row);
  }
  return out;
}

/** @param {Partial<ProductFilterState>} partial */
export function mergeFilterState(partial) {
  return { ...INITIAL_FILTER_STATE, ...partial };
}

/** Presets apenas preenchem rascunho (o utilizador decide quando aplicar). */
export const PRODUCT_SCORE_PRESETS = [
  {
    id: "saturated",
    label: "🔥 Saturados",
    description: "Volume eletrado antes de filtros estritos ao ticket — grandes quantidades já visíveis no feed.",
    fill: mergeFilterState({
      precoMin: "",
      precoMax: "",
      vendasMin: "2500",
      vendasMax: "",
      ratingMin: "4",
      scoreMin: "45"
    })
  },
  {
    id: "intermediate",
    label: "⚖️ Intermediários",
    description: "Zona média típica entre oportunidade e grandes volumes.",
    fill: mergeFilterState({
      precoMin: "",
      precoMax: "",
      vendasMin: "300",
      vendasMax: "2499",
      ratingMin: "4",
      scoreMin: "45"
    })
  },
  {
    id: "opportunity",
    label: "💎 Oportunidade",
    description: "Espelho aproximado da heurística v1 Opportunities (exploratória).",
    fill: mergeFilterState({
      precoMin: "",
      precoMax: "",
      vendasMin: "10",
      vendasMax: "300",
      ratingMin: "4.5",
      scoreMin: ""
    })
  },
  {
    id: "explore",
    label: "🧪 Explorar",
    description: "Intervalo largo para explorar diferentes faixas de score.",
    fill: mergeFilterState({
      precoMin: "",
      precoMax: "",
      vendasMin: "",
      vendasMax: "",
      ratingMin: "3",
      scoreMin: "35"
    })
  },
  {
    id: "ticketHigh",
    label: "💰 Ticket alto",
    description:
      "Produtos com preço mais alto e vendas intermediárias. Geralmente oferecem melhor margem e ainda não estão saturados.",
    fill: mergeFilterState({
      precoMin: "80",
      precoMax: "",
      vendasMin: "100",
      vendasMax: "1000",
      ratingMin: "4.5",
      scoreMin: "55"
    })
  }
];
