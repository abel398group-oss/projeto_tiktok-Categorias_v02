/**
 * price-parser.mjs — Funções puras de parsing de preço, vendas e avaliações.
 * Sem dependências de outros módulos do projecto.
 */

// ---------------------------------------------------------------------------
// Utilitários genéricos (scalar pickers)
// ---------------------------------------------------------------------------

export function pickString(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

export function pickNumber(...vals) {
  for (const v of vals) {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/** Média 0–5 a partir de número ou string "4,5". */
export function pickScore0to5(...vals) {
  for (const v of vals) {
    if (v == null || v === "") continue;
    if (typeof v === "number" && !Number.isNaN(v) && v >= 0 && v <= 5) {
      return Math.round(v * 10) / 10;
    }
    const f = parseFloat(String(v).replace(",", ".").trim());
    if (!Number.isNaN(f) && f >= 0 && f <= 5) {
      return Math.round(f * 10) / 10;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

const SALES_RE = /([\d.,]+)\s*([kKmM])?/i;

export function parseSalesText(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.replace(/\s/g, " ").match(SALES_RE);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(n)) {
    n = parseFloat(m[1].replace(",", "."));
  }
  if (Number.isNaN(n)) return null;
  const mult = m[2];
  if (mult) {
    const u = mult.toLowerCase();
    if (u === "k") n *= 1_000;
    if (u === "m") n *= 1_000_000;
  }
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// Avaliações (ratings)
// ---------------------------------------------------------------------------

/**
 * Bloco `rate_info` do cartão OEC (média, total, histograma por estrela). Estrutura varia entre feeds.
 * @param {object | undefined} ri
 * @returns {{ review_avg: number | null, review_count_total: number | null, review_star_votes: Record<number, number> | null }}
 */
export function parseRateInfoObject(ri) {
  const empty = { review_avg: null, review_count_total: null, review_star_votes: null };
  if (!ri || typeof ri !== "object" || Array.isArray(ri)) {
    return empty;
  }
  const review_avg = pickScore0to5(
    ri.score, ri.avg_score, ri.average_score, ri.product_score, ri.star, ri.rate
  );
  const review_count_total = pickNumber(
    ri.review_count, ri.review_num, ri.total_count, ri.total_review_count,
    ri.global_review_count, ri.rating_count, ri.count, ri.total
  );
  const starFromFields = () => {
    const out = {};
    const set = (star, ...keys) => {
      const v = pickNumber(...keys.map((k) => ri[k]));
      if (v != null && v >= 0) out[star] = Math.round(v);
    };
    set(5, "five_star_count", "five_star", "star5_count", "star_5_count", "n5_star", "s5", "5_star");
    set(4, "four_star_count", "four_star", "star4_count", "star_4_count", "n4_star", "s4", "4_star");
    set(3, "three_star_count", "three_star", "star3_count", "star_3_count", "n3_star", "s3", "3_star");
    set(2, "two_star_count", "two_star", "star2_count", "star_2_count", "n2_star", "s2", "2_star");
    set(1, "one_star_count", "one_star", "star1_count", "star_1_count", "n1_star", "s1", "1_star");
    return Object.keys(out).length ? out : null;
  };
  const starFromArrays = () => {
    const candidates = [
      ri.review_star_level, ri.review_start_level, ri.star_level_list,
      ri.star_reviews, ri.rate_level_list, ri.score_detail, ri.scores
    ].filter((a) => Array.isArray(a));
    for (const arr of candidates) {
      const out = {};
      for (const row of arr) {
        if (!row || typeof row !== "object") continue;
        const level = pickNumber(row.level, row.star, row.star_num, row.grade, row.star_level);
        const cnt = pickNumber(row.count, row.num, row.cnt, row.review_count);
        if (level != null && level >= 1 && level <= 5 && cnt != null && cnt >= 0) {
          out[level] = Math.round(cnt);
        }
      }
      if (Object.keys(out).length) return out;
    }
    return null;
  };
  const review_star_votes = starFromFields() || starFromArrays();
  if (review_avg == null && review_count_total == null && !review_star_votes) return empty;
  return { review_avg, review_count_total, review_star_votes };
}

/**
 * Junta histogramas por estrela (mesmo `product_id` vindo de respostas diferentes).
 */
export function mergeStarVotes(a, b) {
  if (!a && !b) return null;
  const out = {};
  for (const k of [1, 2, 3, 4, 5]) {
    const v = (a && (a[k] ?? a[String(k)])) ?? (b && (b[k] ?? b[String(k)]));
    if (v != null && !Number.isNaN(Number(v))) out[k] = Math.round(Number(v));
  }
  return Object.keys(out).length ? out : null;
}

export function coalesceProductRatings(a, b) {
  if (!a && !b) return { review_avg: null, review_count_total: null, review_star_votes: null };
  return {
    review_avg: (a && a.review_avg) ?? (b && b.review_avg) ?? null,
    review_count_total: (a && a.review_count_total) ?? (b && b.review_count_total) ?? null,
    review_star_votes: mergeStarVotes(a && a.review_star_votes, b && b.review_star_votes)
  };
}

/**
 * Lê o primeiro bloco útil entre `rate_info`, `review_rate_info`, etc.
 * @param {object} raw — tipicamente após `mergeProductLayers`
 */
export function extractProductRatings(raw) {
  const empty = { review_avg: null, review_count_total: null, review_star_votes: null };
  if (!raw || typeof raw !== "object") return empty;
  const blobs = [raw.rate_info, raw.review_rate_info, raw.product_rate_info, raw.review_info].filter(
    (x) => x && typeof x === "object" && !Array.isArray(x)
  );
  let merged = { ...empty };
  for (const ri of blobs) {
    const p = parseRateInfoObject(ri);
    merged = coalesceProductRatings(merged, p);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Preço
// ---------------------------------------------------------------------------

/**
 * Desconto em % a partir de `product_price_info` (Shop: discount_format "40%" e/ou discount_decimal "0.4").
 * @returns {number | null} percentual (ex. 40), não fração
 */
export function parseDiscountPercentFromPpi(ppi) {
  if (!ppi || typeof ppi !== "object") return null;
  const fmt = ppi.discount_format;
  if (fmt != null && String(fmt).trim() !== "") {
    const t = String(fmt).trim().replace(/\s/g, "").replace(/^[−-]/, "").replace(",", ".");
    const m = t.match(/^(\d+\.?\d*)\s*%$/) || t.match(/(\d+\.?\d*)\s*%/);
    if (m) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) return Math.round(n * 10) / 10;
    }
  }
  const dec = ppi.discount_decimal;
  if (dec == null || dec === "") return null;
  const d = parseFloat(String(dec).replace(",", "."));
  if (Number.isNaN(d) || d < 0) return null;
  if (d > 0 && d <= 1) return Math.round(d * 1000) / 10;
  if (d > 1 && d <= 100) return Math.round(d * 10) / 10;
  return null;
}

/** Tenta extrair valor numérico de strings "R$ 59,90" / "BRL 86.00" usadas no feed OEC. */
export function parseBrlishMoneyString(s) {
  if (s == null) return null;
  if (typeof s === "number" && !Number.isNaN(s)) return s;
  if (typeof s !== "string") return null;
  const t = s.replace(/\s/g, "").replace(/ /g, "");
  const m = t.match(/R\$?([0-9.]+,\d{1,2}|[0-9]+[.,]\d{1,2}|[0-9]+)(?!\d)/i);
  if (m) {
    const g = m[1];
    const n =
      g.includes(",") && !g.includes(".")
        ? parseFloat(g.replace(/\./g, "").replace(",", "."))
        : g.includes(".") && g.includes(",")
          ? parseFloat(g.replace(/\./g, "").replace(",", "."))
          : parseFloat(g.replace(",", "."));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  const bare = t.match(/^(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})$/);
  if (bare) {
    const n = parseFloat(bare[1].replace(/\./g, "").replace(",", "."));
    if (!Number.isNaN(n) && n > 0 && n < 1_000_000) return n;
  }
  return null;
}

/**
 * Preço a partir de campos "format" (product_price_info / price_info).
 */
export function pickPriceFromFormatStrings(p) {
  if (!p || typeof p !== "object") return null;
  const keys = [p.format_price, p.show_price, p.sale_format_price, p.sale_price_format, p.selling_price, p.list_format_price];
  for (const v of keys) {
    const n = parseBrlishMoneyString(v);
    if (n != null) return n;
  }
  return null;
}

export function ppiHasDiscountSignal(ppi) {
  if (!ppi || typeof ppi !== "object") return false;
  if (parseDiscountPercentFromPpi(ppi) != null) return true;
  const df = ppi.discount_format;
  if (df != null && String(df).trim() !== "" && /%/.test(String(df))) return true;
  if (typeof ppi.discount === "number" && ppi.discount > 0) return true;
  if (typeof ppi.discount_decimal === "number" && ppi.discount_decimal > 0) return true;
  return false;
}

/** Preço do `default_sku` na `sku_list`. */
export function priceFromDefaultSku(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.sku_list)) return null;
  const sid = pickString(raw.default_sku_id, raw.default_sku, raw.sku_id);
  if (sid == null) return null;
  for (const s of raw.sku_list) {
    if (!s || typeof s !== "object") continue;
    const id = s.sku_id ?? s.id ?? s.skuId;
    if (id != null && String(sid) === String(id)) {
      return pickNumber(s.sale_price, s.price, s.sale_price_decimal, s.sku_sale_price, s.purchase_price);
    }
  }
  return null;
}

export function reconcileVitrineNoDiscount(price, originalPrice, ppi, minPrice, fromFormatStrUsed) {
  if (fromFormatStrUsed) return price;
  if (price == null || originalPrice == null) return price;
  if (Number(originalPrice) <= Number(price) + 0.0001) return price;
  if (ppiHasDiscountSignal(ppi)) return price;
  const p = Number(price);
  const pMin = minPrice != null && !Number.isNaN(Number(minPrice)) ? Number(minPrice) : null;
  if (pMin != null && Math.abs(p - pMin) < 0.0001) return Number(originalPrice);
  return price;
}

export function alignPriceToStatedPercent(price, originalPrice, ppi, minPrice, fromFormatUsed) {
  if (fromFormatUsed) return price;
  if (price == null || originalPrice == null) return price;
  if (!ppi || typeof ppi !== "object") return price;
  if (!ppiHasDiscountSignal(ppi)) return price;
  const d = parseDiscountPercentFromPpi(ppi);
  if (d == null || d <= 0 || d >= 100) return price;
  const o = Number(originalPrice);
  const p = Number(price);
  if (o <= 0) return price;
  const exp = Math.round(o * (1 - d / 100) * 100) / 100;
  if (p < exp * 0.92) return exp;
  if (p > exp * 1.1) return exp;
  if (p >= exp - 0.0001) return price;
  const m = minPrice != null && !Number.isNaN(Number(minPrice)) ? Number(minPrice) : null;
  const onMin = m != null && Math.abs(p - m) < 0.01;
  if (onMin) return exp;
  if (m == null && p < o * 0.5 && p < exp - 1) return exp;
  return price;
}

/**
 * Estimativa experimental (vitrine): `original × (1 - d/100)`.
 */
export function computePrecoEstimadoVitrineFields(price, originalPrice, ppi) {
  const empty = { preco_estimado_vitrine: null, preco_gap_estimado: null, preco_gap_estimado_percent: null };
  if (originalPrice == null || typeof originalPrice !== "number" || Number.isNaN(originalPrice) || originalPrice <= 0) return empty;
  if (price == null || typeof price !== "number" || Number.isNaN(price)) return empty;
  if (originalPrice <= price) return empty;
  const d = parseDiscountPercentFromPpi(ppi);
  if (d == null || d < 1 || d > 94) return empty;
  const base = originalPrice * (1 - d / 100);
  const precoEstimadoVitrine = Math.round(base * 100) / 100;
  const precoGapEstimado = precoEstimadoVitrine - price;
  const rawPct = precoGapEstimado / originalPrice;
  return {
    preco_estimado_vitrine: precoEstimadoVitrine,
    preco_gap_estimado: precoGapEstimado,
    preco_gap_estimado_percent: Math.round(rawPct * 10000) / 10000
  };
}

// ---------------------------------------------------------------------------
// Preços do PDP (DOM hero)
// ---------------------------------------------------------------------------

export function combinePdpHeroPriceParts(intPart, decPart) {
  const a = String(intPart || "").replace(/[^\d]/g, "");
  if (!a) return null;
  const rawD = String(decPart || "").replace(/[^\d]/g, "");
  if (!rawD) {
    const n = parseFloat(a, 10);
    return Number.isNaN(n) || n < 0 ? null : n;
  }
  const d2 = rawD.length >= 2 ? rawD.slice(0, 2) : rawD.padEnd(2, "0");
  const n = parseFloat(`${a}.${d2}`, 10);
  return Number.isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100;
}

/**
 * Aplica o par { sale, listPrice } lido no DOM do PDP.
 * @param {Record<string, unknown>} n linha de `byProductId` (mutável)
 * @param {{ sale: number | null, listPrice: number | null } | null | undefined} pdp
 */
export function applyPdpDomPrices(n, pdp) {
  if (!n || !pdp || typeof pdp !== "object") return n;
  const { sale, listPrice } = pdp;
  if (typeof sale !== "number" || Number.isNaN(sale) || sale <= 0) return n;
  n.price = sale;
  if (listPrice != null && typeof listPrice === "number" && !Number.isNaN(listPrice) && listPrice > sale + 0.0001) {
    n.original_price = listPrice;
    n.tem_desconto = true;
  } else {
    n.original_price = null;
    n.tem_desconto = false;
    n.preco_estimado_vitrine = null;
    n.preco_gap_estimado = null;
    n.preco_gap_estimado_percent = null;
  }
  return n;
}
