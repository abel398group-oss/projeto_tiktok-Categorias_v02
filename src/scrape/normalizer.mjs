/**
 * normalizer.mjs — Normalização de produtos e lojas do feed TikTok Shop.
 * Depende de: ./image-utils.mjs, ./price-parser.mjs
 *
 * Exporta as funções usadas em testes (scrape-regression.test.mjs).
 */
import {
  extractImages,
  extractHttpImageUrlsDeep,
  dedupeImageUrlsByAssetId,
  dedupeImageUrlsByPathname,
  subtractFotosOverlappingPdp,
  normalizeAndDedupeLogoUrlList
} from "./image-utils.mjs";
import {
  pickString,
  pickNumber,
  parseSalesText,
  parseDiscountPercentFromPpi,
  pickPriceFromFormatStrings,
  priceFromDefaultSku,
  reconcileVitrineNoDiscount,
  alignPriceToStatedPercent,
  computePrecoEstimadoVitrineFields,
  extractProductRatings,
  coalesceProductRatings,
  applyPdpDomPrices,
  combinePdpHeroPriceParts
} from "./price-parser.mjs";

// ---------------------------------------------------------------------------
// Feed parsing: product detection & collection
// ---------------------------------------------------------------------------

export function mergeProductLayers(rawIn) {
  if (!rawIn || typeof rawIn !== "object") return rawIn;
  let o = { ...rawIn };
  if (o.product_info && typeof o.product_info === "object") o = { ...o, ...o.product_info };
  if (o.card && typeof o.card === "object") o = { ...o, ...o.card };
  if (o.product_meta && typeof o.product_meta === "object") o = { ...o, ...o.product_meta };
  if (o.product_marketing_info && typeof o.product_marketing_info === "object") {
    o = { ...o, ...o.product_marketing_info };
  }
  return o;
}

/** Blocos de review têm `review_id` e repetem o mesmo product_id sem preço — não são cartão de grelha. */
export function isReviewOnlyProductNode(raw) {
  if (!raw || typeof raw !== "object") return false;
  return raw.review_id != null;
}

export function getProductId(x) {
  if (!x || typeof x !== "object") return null;
  return (
    x.product_id ?? x.productId ?? x.item_id ?? x.id ?? x.productIdStr ??
    x.product_id_str ?? x.common?.id ?? x.common?.item_id ??
    x.product_info?.product_id ?? x.product_meta?.product_id ??
    x.card?.product_id ?? x.product_meta?.id ??
    (typeof x.legacy_product_id === "string" || typeof x.legacy_product_id === "number"
      ? x.legacy_product_id : null) ??
    x.item?.product_id ?? x.item_id_str ?? null
  );
}

export function isProductLike(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = mergeProductLayers(x);
  const id = getProductId(o);
  if (id == null) return false;
  const hasTitle = !!(o.title || o.name || o.product_name);
  const hasPriceHint =
    o.price != null || o.min_price != null || o.sale_price != null ||
    o.salePrice != null || o.format_price != null ||
    (o.sku && typeof o.sku === "object") ||
    (Array.isArray(o.sku_list) && o.sku_list.length) ||
    (o.price_info && typeof o.price_info === "object") ||
    (o.product_price_info && typeof o.product_price_info === "object");
  return hasTitle || hasPriceHint;
}

export function findProductArrays(node, depth = 0, out = []) {
  if (depth > 14 || node == null) return out;
  if (Array.isArray(node)) {
    if (node.length >= 1 && node.some(isProductLike)) {
      out.push(node.filter(isProductLike));
      return out;
    }
    for (const el of node) findProductArrays(el, depth + 1, out);
    return out;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node)) findProductArrays(v, depth + 1, out);
  }
  return out;
}

export function findNamedProductArrays(data) {
  const found = [];
  (function walk(node, depth) {
    if (depth > 24 || node == null) return;
    if (Array.isArray(node)) { for (const el of node) walk(el, depth + 1); return; }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (
        (kl === "products" || kl === "product_list" || kl === "item_list" ||
          kl === "items" || kl === "card_list" || kl === "productlist" || kl === "item_cards") &&
        Array.isArray(v) && v.length > 0 && v.some((el) => el && typeof el === "object" && isProductLike(el))
      ) {
        found.push(v);
      }
      walk(v, depth + 1);
    }
  })(data, 0);
  return found;
}

export function findLooseProductNodes(node, depth = 0, out = []) {
  if (depth > 20 || node == null) return out;
  if (Array.isArray(node)) { for (const el of node) findLooseProductNodes(el, depth + 1, out); return out; }
  if (typeof node !== "object") return out;
  const o = mergeProductLayers(node);
  if (
    typeof o.title === "string" && o.title.length > 2 && getProductId(o) != null &&
    (o.min_price != null || o.sale_price != null || o.format_price != null ||
      (o.product_price_info && typeof o.product_price_info === "object") ||
      (o.product_meta && o.product_meta.sale_price != null) ||
      (o.sold_info && typeof o.sold_info === "object"))
  ) {
    out.push(node);
  }
  for (const v of Object.values(node)) findLooseProductNodes(v, depth + 1, out);
  return out;
}

export function hasItemListOrProductInfo(node, depth = 0) {
  if (depth > 30 || node == null) return false;
  if (Array.isArray(node)) {
    for (const el of node) { if (hasItemListOrProductInfo(el, depth + 1)) return true; }
    return false;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (kl === "item_list" && Array.isArray(v) && v.length > 0) return true;
      if (kl === "product_info" && v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0) return true;
    }
    for (const v of Object.values(node)) { if (hasItemListOrProductInfo(v, depth + 1)) return true; }
  }
  return false;
}

export function collectOecItemListOrProductInfo(data) {
  const items = [];
  const seen = new Set();
  (function walk(node, depth) {
    if (depth > 30 || node == null) return;
    if (Array.isArray(node)) { for (const el of node) walk(el, depth + 1); return; }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (kl === "item_list" && Array.isArray(v)) {
        for (const it of v) {
          if (!it || typeof it !== "object") continue;
          const merged = mergeProductLayers(it);
          const id = getProductId(merged);
          const key = id != null ? `i:${id}` : `h:${items.length}:${JSON.stringify(it).slice(0, 120)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(it);
        }
      } else if (kl === "product_info" && v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length) {
        const merged = mergeProductLayers(v);
        const id = getProductId(merged);
        const key = id != null ? `p:${id}` : `ph:${items.length}`;
        if (!seen.has(key)) { seen.add(key); items.push(v); }
      }
      if (v != null && typeof v === "object") walk(v, depth + 1);
    }
  })(data, 0);
  return items;
}

/** Score e metadado para o caça-dados (JSONL). */
export function huntScoreJsonObject(data, t) {
  const sample = t.slice(0, 20_000);
  let score = 0;
  if (hasItemListOrProductInfo(data)) score += 25;
  if (findNamedProductArrays(data).length) score += 15;
  if (findLooseProductNodes(data, 0, []).length) score += 10;
  if (/"item_list"\s*:|"product_info"\s*:|min_price|sale_price|format_price|product_price_info|sku_list|sold_/.test(sample)) score += 12;
  if (findProductArrays(data, 0, []).length) score += 10;
  if (/p16-oec-|p19-oec-|ibyteimg|cover_image|pigeon|oec\./i.test(sample)) score += 6;
  return Math.min(100, score);
}

/**
 * Imagens combinadas dum nó de produto vindo do `__MODERN_ROUTER_DATA__` na PDP.
 */
export function extractAllImageUrlsFromRouterProductNode(raw) {
  if (!raw || typeof raw !== "object") return [];
  const m = mergeProductLayers(raw);
  const shallow = extractImages(m);
  const deep = extractHttpImageUrlsDeep(m, 14, 90);
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname([...shallow, ...deep]));
}

// ---------------------------------------------------------------------------
// Loja (seller)
// ---------------------------------------------------------------------------

export const LOJA_FIELD_DEFAULTS = {
  seller_id: null, global_seller_id: null, nome_loja: null,
  loja_vendas_total: null, loja_produtos_ativos: null, loja_reviews_total: null,
  loja_seguidores: null, loja_videos: null, loja_enable_follow: null,
  loja_logo_uri: null, loja_logo_urls: null
};

function readShopLogo(logo) {
  if (!logo || typeof logo !== "object") return { uri: null, urls: [] };
  const uri = logo.uri != null && String(logo.uri).trim() !== "" ? String(logo.uri).trim() : null;
  const raw = Array.isArray(logo.url_list)
    ? logo.url_list.filter((u) => typeof u === "string" && (u.startsWith("http") || u.startsWith("//")))
    : [];
  return { uri, urls: normalizeAndDedupeLogoUrlList(raw) };
}

export function normalizeSellerInfo(node) {
  if (!node || typeof node !== "object") return null;
  if (isReviewOnlyProductNode(node)) return null;
  const hasSe = node.seller_info && typeof node.seller_info === "object";
  const hasSh = node.shop_info && typeof node.shop_info === "object";
  if (!hasSe && !hasSh) return null;
  const se = hasSe ? node.seller_info : null;
  const sh = hasSh ? node.shop_info : null;
  const logSe = se ? readShopLogo(se.shop_logo) : { uri: null, urls: [] };
  const logSh = sh ? readShopLogo(sh.shop_logo) : { uri: null, urls: [] };
  const urlsMerged = normalizeAndDedupeLogoUrlList([...logSe.urls, ...logSh.urls]);
  return {
    seller_id: pickString(sh?.seller_id, se?.seller_id) || null,
    global_seller_id: sh?.global_seller_id != null ? String(sh.global_seller_id) : null,
    nome_loja: pickString(sh?.shop_name, se?.shop_name) || null,
    loja_vendas_total: pickNumber(sh?.sold_count, sh?.global_sold_count) ?? null,
    loja_produtos_ativos: pickNumber(sh?.on_sell_product_count) ?? null,
    loja_reviews_total: pickNumber(sh?.review_count) ?? null,
    loja_seguidores: pickNumber(sh?.followers_count) ?? null,
    loja_videos: pickNumber(sh?.video_count) ?? null,
    loja_enable_follow:
      sh && typeof sh.enable_follow === "boolean" ? sh.enable_follow
        : sh && sh.enable_follow != null ? Boolean(sh.enable_follow) : null,
    loja_logo_uri: logSh.uri || logSe.uri || null,
    loja_logo_urls: urlsMerged.length > 0 ? urlsMerged : null
  };
}

function coalesceLojaString(a, b) {
  if (b != null && String(b).trim() !== "") return String(b).trim();
  if (a != null && String(a).trim() !== "") return String(a).trim();
  return null;
}

function coalesceLojaNumber(a, b) {
  if (b != null && !Number.isNaN(Number(b))) return Number(b);
  if (a != null && !Number.isNaN(Number(a))) return Number(a);
  return null;
}

function coalesceLojaBool(a, b) {
  if (typeof b === "boolean") return b;
  if (typeof a === "boolean") return a;
  return null;
}

export function extractLojaFromNormalized(row) {
  if (!row || typeof row !== "object") return { ...LOJA_FIELD_DEFAULTS };
  const urls = row.loja_logo_urls;
  const logoList = Array.isArray(urls) ? normalizeAndDedupeLogoUrlList(urls) : [];
  return {
    seller_id: row.seller_id ?? null,
    global_seller_id: row.global_seller_id ?? null,
    nome_loja: row.nome_loja ?? null,
    loja_vendas_total: row.loja_vendas_total ?? null,
    loja_produtos_ativos: row.loja_produtos_ativos ?? null,
    loja_reviews_total: row.loja_reviews_total ?? null,
    loja_seguidores: row.loja_seguidores ?? null,
    loja_videos: row.loja_videos ?? null,
    loja_enable_follow: row.loja_enable_follow ?? null,
    loja_logo_uri: row.loja_logo_uri ?? null,
    loja_logo_urls: logoList.length > 0 ? logoList : null
  };
}

export function lojaToRowFields(merged) {
  return { ...LOJA_FIELD_DEFAULTS, ...merged };
}

export function mergeLojaFromNormalized(prevRow, nextRow) {
  const p = extractLojaFromNormalized(prevRow);
  const n = extractLojaFromNormalized(nextRow);
  const mergedUrls = normalizeAndDedupeLogoUrlList([...(p.loja_logo_urls || []), ...(n.loja_logo_urls || [])]);
  return {
    seller_id: coalesceLojaString(p.seller_id, n.seller_id),
    global_seller_id: coalesceLojaString(p.global_seller_id, n.global_seller_id),
    nome_loja: coalesceLojaString(p.nome_loja, n.nome_loja),
    loja_vendas_total: coalesceLojaNumber(p.loja_vendas_total, n.loja_vendas_total),
    loja_produtos_ativos: coalesceLojaNumber(p.loja_produtos_ativos, n.loja_produtos_ativos),
    loja_reviews_total: coalesceLojaNumber(p.loja_reviews_total, n.loja_reviews_total),
    loja_seguidores: coalesceLojaNumber(p.loja_seguidores, n.loja_seguidores),
    loja_videos: coalesceLojaNumber(p.loja_videos, n.loja_videos),
    loja_enable_follow: coalesceLojaBool(p.loja_enable_follow, n.loja_enable_follow),
    loja_logo_uri: coalesceLojaString(p.loja_logo_uri, n.loja_logo_uri),
    loja_logo_urls:
      mergedUrls.length > 0 ? mergedUrls
        : p.loja_logo_urls != null || n.loja_logo_urls != null ? mergedUrls : null
  };
}

export function buildLojasMapBySeller(byProductId) {
  const m = new Map();
  for (const p of byProductId.values()) {
    const sid = p.seller_id;
    if (sid == null || String(sid).trim() === "") continue;
    const k = String(sid);
    if (!m.has(k)) {
      m.set(k, extractLojaFromNormalized(p));
    } else {
      m.set(k, mergeLojaFromNormalized(m.get(k), p));
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Produto: merge, richness, normalização
// ---------------------------------------------------------------------------

export function productRowRichness(n) {
  if (!n) return 0;
  let s = 0;
  if (n.price != null && !Number.isNaN(Number(n.price))) s += 5_000;
  if (n.images?.length) s += n.images.length * 200;
  if (n.original_price != null) s += 400;
  if (n.original_price != null && n.price != null && n.original_price > n.price) s += 200;
  if (n.currency) s += 100;
  if (n.sales_count != null) s += 50;
  if (n.title) s += 1;
  return s;
}

function coalesceMaxSalesCount(a, b) {
  const valid = (x) => typeof x === "number" && !Number.isNaN(x);
  const va = valid(a); const vb = valid(b);
  if (!va && !vb) return null;
  if (!va) return b;
  if (!vb) return a;
  return Math.max(a, b);
}

function coalesceSalesDisplayFromMerge(winner, other) {
  const trimmed = (v) => v != null && String(v).trim() !== "" ? String(v) : null;
  const w = trimmed(winner?.sales_display);
  if (w) return winner.sales_display;
  const o = trimmed(other?.sales_display);
  if (o) return other.sales_display;
  return winner?.sales_display ?? other?.sales_display ?? null;
}

export function mergeProductById(byProductId, n) {
  const key = String(n.product_id);
  const prev = byProductId.get(key);
  const mergedLoja = prev ? mergeLojaFromNormalized(prev, n) : extractLojaFromNormalized(n);
  const lojaBlock = lojaToRowFields(mergedLoja);
  const rateBlock = prev ? coalesceProductRatings(n, prev) : null;
  if (!prev) { byProductId.set(key, { ...n, ...lojaBlock }); return; }
  const salesMax = coalesceMaxSalesCount(prev.sales_count, n.sales_count);
  if (productRowRichness(n) > productRowRichness(prev)) {
    const base = { ...n, ...lojaBlock, ...rateBlock };
    byProductId.set(key, { ...base, sales_count: salesMax, sales_display: coalesceSalesDisplayFromMerge(n, prev) });
  } else {
    const base = { ...prev, ...lojaBlock, ...rateBlock };
    byProductId.set(key, { ...base, sales_count: salesMax, sales_display: coalesceSalesDisplayFromMerge(prev, n) });
  }
}

// ---------------------------------------------------------------------------
// URL de produto
// ---------------------------------------------------------------------------

export function pathRegionFromCategoryUrl(categoriaUrl) {
  if (!categoriaUrl) return "br";
  const m = String(categoriaUrl).match(/shop\.tiktok\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
  return m ? m[1].toLowerCase() : "br";
}

export function pickProductPdpUrl(productId, raw, categoriaUrl) {
  const su = raw?.seo_url;
  const canon =
    su && typeof su === "object" && su.canonical_url != null ? String(su.canonical_url).trim()
      : typeof su === "string" ? su.trim() : null;
  if (canon && /^https?:\/\//i.test(canon)) return canon.split(/[?#]/)[0];
  const other = pickString(raw?.product_detail_url, raw?.pdp_url, raw?.product_meta?.pdp_url, raw?.link);
  if (other && /^https?:\/\//i.test(String(other)) && /tiktok\.com\/shop\//i.test(String(other))) {
    return String(other).split(/[?#]/)[0];
  }
  if (!productId) return null;
  return `https://www.tiktok.com/shop/${pathRegionFromCategoryUrl(categoriaUrl)}/pdp/${productId}`;
}

// ---------------------------------------------------------------------------
// Seller debug (usado pelo main para escrever debug_seller_sources.json)
// ---------------------------------------------------------------------------

export let recordSellerDebug = false;
export const sellerDebugSamples = [];

export function setSellerDebugMode(enabled) {
  recordSellerDebug = enabled;
}

export function tryRecordSellerDebugSource(raw) {
  if (!recordSellerDebug || sellerDebugSamples.length >= 20) return;
  const hasS = raw?.seller_info && typeof raw.seller_info === "object";
  const hasSh = raw?.shop_info && typeof raw.shop_info === "object";
  if (!hasS && !hasSh) return;
  sellerDebugSamples.push({
    product_id: raw?.product_id != null ? String(raw.product_id) : null,
    has_seller_info: hasS, has_shop_info: hasSh,
    seller_info_keys: hasS ? Object.keys(raw.seller_info).slice(0, 30) : [],
    shop_info_keys: hasSh ? Object.keys(raw.shop_info).slice(0, 35) : []
  });
}

// ---------------------------------------------------------------------------
// normalizeItem + toDadosProdutoClean
// ---------------------------------------------------------------------------

export function normalizeItem(rawIn, categoriaUrl = "") {
  const raw = mergeProductLayers(rawIn);
  const ppi = raw.product_price_info;
  const pm = raw.product_meta;
  const id = pickString(getProductId(raw), raw.productIdStr);
  if (!id) return null;
  if (isReviewOnlyProductNode(raw)) return null;

  const title = pickString(raw.title, raw.name, raw.product_name);
  const si = raw.sold_info;
  const salesRaw = pickString(
    si?.sold_text, si?.sold_count_str, raw.sale_count, raw.sold_count,
    raw.sold, raw.sale_count_str, raw.sales
  );
  const soldCountNum = typeof si?.sold_count === "number" && !Number.isNaN(si.sold_count) ? si.sold_count : null;
  const salesParsed = soldCountNum ?? parseSalesText(salesRaw) ?? pickNumber(raw.sale_count_num, raw.sold_count_num, raw.sale_count_value);

  const sku0 = Array.isArray(raw.sku_list) && raw.sku_list[0] && typeof raw.sku_list[0] === "object" ? raw.sku_list[0] : null;
  const originalPrice = pickNumber(
    ppi?.origin_price, ppi?.original_price, ppi?.origin_price_decimal,
    raw.origin_price, raw.original_price, raw.strike_price, raw.price_info?.origin_price
  );

  const fromFormatStr =
    pickPriceFromFormatStrings(ppi) ??
    pickPriceFromFormatStrings(raw) ??
    (raw.price_info && typeof raw.price_info === "object" ? pickPriceFromFormatStrings(raw.price_info) : null);
  const fromFormatUsed = fromFormatStr != null;
  const minPrice = pickNumber(ppi?.min_price, pm?.min_price, raw.min_price);
  const defaultSkuPrice = priceFromDefaultSku(raw);
  const priceBase =
    fromFormatStr ??
    defaultSkuPrice ??
    pickNumber(
      ppi?.sale_price, ppi?.price, ppi?.sale_price_decimal, pm?.sale_price, pm?.price,
      sku0?.sale_price, sku0?.price, ppi?.min_price, pm?.min_price,
      raw.price, raw.min_price, raw.sale_price, raw.salePrice,
      raw.price_info?.price, raw.price_info?.sale_price
    ) ?? null;
  const priceReconciled = reconcileVitrineNoDiscount(priceBase, originalPrice, ppi, minPrice, fromFormatUsed);
  const price = alignPriceToStatedPercent(priceReconciled, originalPrice, ppi, minPrice, fromFormatUsed);

  const currency = pickString(
    ppi?.currency, ppi?.currency_code, ppi?.currency_name,
    raw.currency, raw.currency_code, raw.price_info?.currency
  );
  const sku = pickString(
    raw.sku_id, raw.skuId, raw.default_sku_id,
    Array.isArray(raw.sku_list) && raw.sku_list[0] ? raw.sku_list[0].sku_id ?? raw.sku_list[0].id : null
  ) ?? id;

  const product_url = pickProductPdpUrl(id, raw, categoriaUrl);
  const lojaBlob = normalizeSellerInfo(raw) || { ...LOJA_FIELD_DEFAULTS };
  tryRecordSellerDebugSource(raw);

  const dDisc = parseDiscountPercentFromPpi(ppi);
  const temDesconto =
    dDisc != null && dDisc >= 1 && dDisc <= 94 &&
    originalPrice != null && typeof originalPrice === "number" &&
    !Number.isNaN(originalPrice) && originalPrice > price;

  const { preco_estimado_vitrine, preco_gap_estimado, preco_gap_estimado_percent } = temDesconto
    ? computePrecoEstimadoVitrineFields(price, originalPrice, ppi)
    : { preco_estimado_vitrine: null, preco_gap_estimado: null, preco_gap_estimado_percent: null };

  return {
    sku, product_id: id, product_url, title, price,
    original_price: temDesconto ? originalPrice : null,
    tem_desconto: temDesconto, currency,
    preco_estimado_vitrine, preco_gap_estimado, preco_gap_estimado_percent,
    sales_count: salesParsed, sales_display: salesRaw,
    images: extractImages(raw),
    source_keys: Object.keys(raw).slice(0, 25),
    ...extractProductRatings(raw),
    ...lojaToRowFields(lojaBlob)
  };
}

export function toDadosProdutoClean(n, categoriaUrl) {
  const pdp = Array.isArray(n.images_pdp) && n.images_pdp.length ? n.images_pdp : null;
  let fotos = null;
  if (Array.isArray(n.images) && n.images.length) {
    if (pdp) {
      fotos = subtractFotosOverlappingPdp(n.images, pdp);
      if (!fotos || !fotos.length) {
        fotos = dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(n.images));
      }
    } else {
      fotos = dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(n.images));
    }
  }
  return {
    categoria_url: categoriaUrl,
    link_produto: n.product_url ?? null,
    product_id: n.product_id,
    nome: n.title,
    preco: n.price,
    moeda: n.currency,
    avaliacao_media: n.review_avg ?? null,
    avaliacoes_total: n.review_count_total ?? null,
    votos_por_estrela: n.review_star_votes ?? null,
    preco_original: n.original_price,
    tem_desconto: Boolean(n.tem_desconto),
    preco_estimado_vitrine: n.preco_estimado_vitrine ?? null,
    preco_gap_estimado: n.preco_gap_estimado ?? null,
    preco_gap_estimado_percent: n.preco_gap_estimado_percent ?? null,
    vendas: n.sales_count,
    vendas_texto: n.vendas_texto ?? n.sales_display ?? null,
    fotos: fotos && fotos.length ? fotos : null,
    fotos_pdp: pdp,
    seller_id: n.seller_id ?? null,
    global_seller_id: n.global_seller_id ?? null,
    nome_loja: n.nome_loja ?? null,
    loja_vendas_total: n.loja_vendas_total ?? null,
    loja_produtos_ativos: n.loja_produtos_ativos ?? null,
    loja_reviews_total: n.loja_reviews_total ?? null,
    loja_seguidores: n.loja_seguidores ?? null,
    loja_videos: n.loja_videos ?? null,
    loja_enable_follow: n.loja_enable_follow ?? null,
    loja_logo_uri: n.loja_logo_uri ?? null,
    loja_logo_urls: n.loja_logo_urls ?? null
  };
}
