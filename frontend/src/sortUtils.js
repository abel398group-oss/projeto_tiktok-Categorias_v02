/**
 * Ordenação no browser (colunas clicáveis; locale pt-BR).
 */
const LOCALE = "pt-BR";

/** @typedef {'asc' | 'desc'} SortDir */

/** @param {unknown} x */
function num(x) {
  if (x == null || x === "") return NaN;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

/** @param {string | undefined} s */
function firstFloat(s) {
  if (s == null || s === "") return NaN;
  const m = String(s).match(/^([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

/** @param {string | undefined} s */
function parseDelta(s) {
  if (s == null || s === "—" || String(s).trim() === "") return NaN;
  const n = parseInt(String(s).replace(/[^\d.-]/g, ""), 10);
  return Number.isNaN(n) ? NaN : n;
}

/** @param {string | undefined} a @param {string | undefined} b */
function cmpStrAZ(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), LOCALE, { sensitivity: "base" });
}

/**
 * @param {number} asc Compare assuming ascending order (a before b => negative)
 * @param {SortDir} dir
 */
function applyDir(asc, dir) {
  return dir === "desc" ? -asc : asc;
}

function cmpTopAsc(a, b, key) {
  switch (key) {
    case "nome":
      return cmpStrAZ(/** @type {string} */ (a.nome), /** @type {string} */ (b.nome));
    case "loja":
      return cmpStrAZ(/** @type {string} */ (a.loja), /** @type {string} */ (b.loja));
    case "preco": {
      const pa = num(a.preco);
      const pb = num(b.preco);
      if (Number.isNaN(pa) && Number.isNaN(pb)) return cmpStrAZ(/** @type {string} */ (a.nome), /** @type {string} */ (b.nome));
      if (Number.isNaN(pa)) return 1;
      if (Number.isNaN(pb)) return -1;
      return pa - pb;
    }
    case "vendas": {
      const va = num(a.vendas);
      const vb = num(b.vendas);
      if (Number.isNaN(va) && Number.isNaN(vb)) return cmpStrAZ(/** @type {string} */ (a.nome), /** @type {string} */ (b.nome));
      if (Number.isNaN(va)) return 1;
      if (Number.isNaN(vb)) return -1;
      return va - vb;
    }
    case "rating":
      return cmpStrAZ(/** @type {string} */ (a.avaliacao), /** @type {string} */ (b.avaliacao));
    default:
      return 0;
  }
}

export function sortTopItemsByColumn(items, key, dir) {
  return [...items].sort((a, b) =>
    applyDir(cmpTopAsc(/** @type {Record<string, unknown>} */ (a), /** @type {Record<string, unknown>} */ (b), key), dir)
  );
}

/** @param {Record<string, unknown>} a @param {Record<string, unknown>} b @param {string} key */
function cmpOppAsc(a, b, key) {
  switch (key) {
    case "nome":
      return cmpStrAZ(/** @type {string} */ (a.nome), /** @type {string} */ (b.nome));
    case "loja":
      return cmpStrAZ(/** @type {string} */ (a.loja), /** @type {string} */ (b.loja));
    case "preco": {
      const pa = num(a.preco);
      const pb = num(b.preco);
      if (Number.isNaN(pa) && Number.isNaN(pb)) return 0;
      if (Number.isNaN(pa)) return 1;
      if (Number.isNaN(pb)) return -1;
      return pa - pb;
    }
    case "vendas": {
      const va = num(a.vendas);
      const vb = num(b.vendas);
      if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
      if (Number.isNaN(va)) return 1;
      if (Number.isNaN(vb)) return -1;
      return va - vb;
    }
    case "avalMed": {
      const ra = num(a.avalMed);
      const rb = num(b.avalMed);
      if (Number.isNaN(ra) && Number.isNaN(rb)) return 0;
      if (Number.isNaN(ra)) return 1;
      if (Number.isNaN(rb)) return -1;
      return ra - rb;
    }
    case "motivo":
      return cmpStrAZ(/** @type {string} */ (a.motivo), /** @type {string} */ (b.motivo));
    default:
      return 0;
  }
}

/** @param {unknown[]} items @param {string} key @param {SortDir} dir */
export function sortOppItemsByColumn(items, key, dir) {
  return [...items].sort((a, b) =>
    applyDir(cmpOppAsc(/** @type {Record<string, unknown>} */ (a), /** @type {Record<string, unknown>} */ (b), key), dir)
  );
}

/** @param {Record<string, unknown>} a @param {Record<string, unknown>} b @param {string} key */
function cmpScoreAsc(a, b, key) {
  switch (key) {
    case "score": {
      const sa = num(a.score);
      const sb = num(b.score);
      if (Number.isNaN(sa) && Number.isNaN(sb)) return 0;
      if (Number.isNaN(sa)) return 1;
      if (Number.isNaN(sb)) return -1;
      return sa - sb;
    }
    case "classific":
      return cmpStrAZ(/** @type {string} */ (a.classific), /** @type {string} */ (b.classific));
    case "nome":
      return cmpStrAZ(/** @type {string} */ (a.nome), /** @type {string} */ (b.nome));
    case "loja":
      return cmpStrAZ(/** @type {string} */ (a.loja), /** @type {string} */ (b.loja));
    case "preco": {
      const pa = num(a.preco);
      const pb = num(b.preco);
      if (Number.isNaN(pa) && Number.isNaN(pb)) return 0;
      if (Number.isNaN(pa)) return 1;
      if (Number.isNaN(pb)) return -1;
      return pa - pb;
    }
    case "vendas": {
      const va = num(a.vendas);
      const vb = num(b.vendas);
      if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
      if (Number.isNaN(va)) return 1;
      if (Number.isNaN(vb)) return -1;
      return va - vb;
    }
    case "rating": {
      const ra = firstFloat(/** @type {string | undefined} */ (a.rating));
      const rb = firstFloat(/** @type {string | undefined} */ (b.rating));
      if (Number.isNaN(ra) && Number.isNaN(rb))
        return cmpStrAZ(/** @type {string} */ (a.rating), /** @type {string} */ (b.rating));
      if (Number.isNaN(ra)) return 1;
      if (Number.isNaN(rb)) return -1;
      return ra - rb;
    }
    case "delta": {
      const da = parseDelta(/** @type {string} */ (a.deltaVendas));
      const db = parseDelta(/** @type {string} */ (b.deltaVendas));
      if (Number.isNaN(da) && Number.isNaN(db)) return 0;
      if (Number.isNaN(da)) return 1;
      if (Number.isNaN(db)) return -1;
      return da - db;
    }
    default:
      return 0;
  }
}

/** @param {unknown[]} rows @param {string} key @param {SortDir} dir */
export function sortScoreRowsByColumn(rows, key, dir) {
  return [...rows].sort((a, b) =>
    applyDir(cmpScoreAsc(/** @type {Record<string, unknown>} */ (a), /** @type {Record<string, unknown>} */ (b), key), dir)
  );
}

/** @param {Record<string, unknown>} a @param {Record<string, unknown>} b @param {string} key */
function cmpScaleAsc(a, b, key) {
  switch (key) {
    case "nome":
      return cmpStrAZ(/** @type {string} */ (a.nome), /** @type {string} */ (b.nome));
    case "score": {
      const sa = num(a.score);
      const sb = num(b.score);
      if (Number.isNaN(sa) && Number.isNaN(sb)) return 0;
      if (Number.isNaN(sa)) return 1;
      if (Number.isNaN(sb)) return -1;
      return sa - sb;
    }
    case "vendas": {
      const va = num(a.vendas);
      const vb = num(b.vendas);
      if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
      if (Number.isNaN(va)) return 1;
      if (Number.isNaN(vb)) return -1;
      return va - vb;
    }
    case "rating": {
      const ra = firstFloat(/** @type {string | undefined} */ (a.rating));
      const rb = firstFloat(/** @type {string | undefined} */ (b.rating));
      if (Number.isNaN(ra) && Number.isNaN(rb))
        return cmpStrAZ(/** @type {string} */ (a.rating), /** @type {string} */ (b.rating));
      if (Number.isNaN(ra)) return 1;
      if (Number.isNaN(rb)) return -1;
      return ra - rb;
    }
    default:
      return 0;
  }
}

/** @param {unknown[]} rows @param {string} key @param {SortDir} dir */
export function sortScalableRowsByColumn(rows, key, dir) {
  return [...rows].sort((a, b) =>
    applyDir(cmpScaleAsc(/** @type {Record<string, unknown>} */ (a), /** @type {Record<string, unknown>} */ (b), key), dir)
  );
}
