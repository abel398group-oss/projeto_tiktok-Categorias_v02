/**
 * Fase 1: coleta estável de UMA categoria — dados via page.on("response") + setRequestInterception(continue), sem abrir PDP (evita puzzle).
 * Prioridade: respostas application/json cujo URL contém oec_bssdk ou list.
 * Número de itens no grid: variável (~20–25+); o merge deduplica por id de produto.
 * Rastreio p/ descoberta de origem: `output/caca_dados.jsonl` + `caca_xhr_fetch_urls.txt` (HUNT_LOG / --hunt / --debug, exc. HUNT_LOG=0).
 * Teste do loader no HTML: `output/modern_router_peek.json` (chaves + amostra de `__MODERN_ROUTER_DATA__`); `ROUTER_PEEK_LEN=0` desliga a amostra.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "output");
const DADOS_OUT = path.join(OUT_DIR, "dados_produtos.json");
const MODERN_ROUTER_PEEK = path.join(OUT_DIR, "modern_router_peek.json");

const DEFAULT_URL =
  "https://shop.tiktok.com/br/c/womenswear-underwear/601152?source=ecommerce_sitemap&enter_method=category_directory&first_entrance=ecommerce_category&first_entrance_position=bread_crumbs&first_entrance_tt_scene=seo";

const debug = process.argv.includes("--debug");
/** true: imprime tráfego de rede (pedido + resposta) para achar a URL do JSON. Desligar: NET_LOG=0 */
const netLog =
  process.env.NET_LOG !== "0" &&
  (process.argv.includes("--net-log") || process.env.NET_LOG === "1" || process.argv.includes("--debug"));
const netLogVerbose = process.env.NET_LOG === "verbose" || process.env.NET_LOG === "2";
/**
 * Modo "caça": `output/caca_dados.jsonl` (pistas JSON + sondagem do HTML do document) + `caca_xhr_fetch_urls.txt` (URLs únicas).
 * Ligar: `--hunt` ou HUNT_LOG=1 (padrão com `--debug`); desligar: HUNT_LOG=0
 */
const huntLog =
  process.env.HUNT_LOG !== "0" &&
  (process.argv.includes("--hunt") || process.env.HUNT_LOG === "1" || process.argv.includes("--debug"));
const CACA_DADOS_JSONL = path.join(OUT_DIR, "caca_dados.jsonl");
const CACA_XHR_FILE = path.join(OUT_DIR, "caca_xhr_fetch_urls.txt");
/** Se o corpo JSON tiver tamanho acima do limite, regista as primeiras chaves (ajuda a achar o feed) */
const HUNT_BIG_JSON = Math.max(2000, Number(process.env.HUNT_MIN_BYTES) || 3000);
/** No console, só pistas com score a partir do indicado (reduz barulho) */
const HUNT_SCORE_CONSOLE = Number.isFinite(Number(process.env.HUNT_SCORE_CONSOLE))
  ? Number(process.env.HUNT_SCORE_CONSOLE)
  : 12;

/**
 * F12: Fetch/XHR com biz_id=bytecom OU com "list" (domínios TikTok Shop / e-com).
 * @see matchesBytecomListUrl
 */
function matchesBytecomListUrl(url) {
  if (isTelemetryOrNoiseUrl(url) || isListMcsPingUrl(url)) return false;
  try {
    const raw = String(url);
    const d = safeDecodeUrl(raw);
    if (/biz_id=bytecom/i.test(raw) || /biz_id=bytecom/i.test(d)) return true;
    if (!raw.includes("list") && !d.includes("list")) return false;
    return /(tiktok|ttdns|ttwstatic|bytedance|oec|pigeon|mason|byte|ibyte|shop\.tiktok|mall|secsdk|slardar)/i.test(
      raw + d
    );
  } catch {
    return /biz_id=bytecom/i.test(url) || (String(url).includes("list") && /tiktok/i.test(url));
  }
}

function safeDecodeUrl(u) {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

/** JSON do feed OEC: contém `item_list` (array) ou nó `product_info`. */
function hasItemListOrProductInfo(node, depth = 0) {
  if (depth > 30 || node == null) return false;
  if (Array.isArray(node)) {
    for (const el of node) {
      if (hasItemListOrProductInfo(el, depth + 1)) return true;
    }
    return false;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (kl === "item_list" && Array.isArray(v) && v.length > 0) return true;
      if (
        kl === "product_info" &&
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v).length > 0
      ) {
        return true;
      }
    }
    for (const v of Object.values(node)) {
      if (hasItemListOrProductInfo(v, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Coleta nós a partir de `item_list` e `product_info` (pode existir aninhado).
 * @param {object} data
 * @returns {object[]}
 */
function collectOecItemListOrProductInfo(data) {
  const items = [];
  const seen = new Set();
  (function walk(node, depth) {
    if (depth > 30 || node == null) return;
    if (Array.isArray(node)) {
      for (const el of node) walk(el, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (kl === "item_list" && Array.isArray(v)) {
        for (const it of v) {
          if (!it || typeof it !== "object") continue;
          const merged = mergeProductLayers(it);
          const id = getProductId(merged);
          const key = id != null ? `i:${id}` : `h:${[...items].length}:${JSON.stringify(it).slice(0, 120)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(it);
        }
      } else if (
        kl === "product_info" &&
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v).length
      ) {
        const merged = mergeProductLayers(v);
        const id = getProductId(merged);
        const key = id != null ? `p:${id}` : `ph:${[...items].length}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push(v);
        }
      }
      if (v != null && typeof v === "object") {
        walk(v, depth + 1);
      }
    }
  })(data, 0);
  return items;
}

function toDadosProdutoClean(n, categoriaUrl) {
  return {
    categoria_url: categoriaUrl,
    link_produto: n.product_url ?? null,
    product_id: n.product_id,
    nome: n.title,
    preco: n.price,
    moeda: n.currency,
    desconto_percent: n.discount_percent,
    desconto_texto: n.discount_format_text ?? null,
    preco_original: n.original_price,
    vendas: n.sales_count,
    vendas_texto: n.sales_display,
    fotos: n.images
  };
}

/**
 * Telemetria, SDK e análise — NÃO trazem catálogo; filtrar para focar o feed de produtos.
 */
function isTelemetryOrNoiseUrl(url) {
  const u = String(url).toLowerCase();
  if (/\.(woff2?|ttf|otf|eot|map)(\?|#|$)/.test(u)) return true;
  if (
    /(monitor_web|mon[.-].*byte|\/monitor\/|\/collect\/|\/report\?|slardar|browser-settings|\/ztca\/|\/abtest|mcs\.byte|secsdk|webmssdk|impression|\/settings\?|favicon|ttwid\/check|libraweb-sg|\/batch\?|livelog|pns_)/.test(
      u
    )
  ) {
    return true;
  }
  if (/(^|\.)[a-z0-9-]*mcs[.-]/.test(u) && u.includes("byte")) return true;
  if (/^https?:\/\/(mon-[^/]+\.byte|[^/]+mcs\.)/.test(u)) return true;
  return false;
}

/**
 * Larga margem: rotas reais de API do Shop (o TikTok muitas vezes esconde; os dados vêm de XHR).
 */
function isWidenShopOrOecUrl(url) {
  if (isTelemetryOrNoiseUrl(url)) return false;
  const u = url.toLowerCase();
  if (u.includes("shop.tiktok.com")) {
    if (/\/(api|bff|pdp|view|graphql|trpc|node)(\/|\?|#)/.test(u) || u.includes("api/") || u.includes("api?")) {
      return true;
    }
  }
  if (
    /(oec|pigeon|mall|commerce|feed|category|pdp|product_list|view\/product)/.test(u) &&
    /(tiktok|byted|oec|ttdns|pigeon|byte|ibyte|maliva)/.test(u)
  ) {
    return true;
  }
  return false;
}

/** Hosts úteis para o modo DISCOVER=1 (não tudo da internet). */
function isDiscoverRelevantHost(url) {
  if (isTelemetryOrNoiseUrl(url)) return false;
  const u = url.toLowerCase();
  return /(shop\.tiktok|tiktok|byted|oec|pigeon|mason|ibyte|ttdns|ttwstatic|byteoversea|maliva)/.test(
    u
  );
}

/**
 * Pings mínimos (ex.: mcs-sg.tiktokv.com/v1/list) — aparecem no DevTools como "list" mas NÃO trazem catálogo.
 * @see isPromisingXhrListUrl
 */
function isListMcsPingUrl(url) {
  const u = String(url).toLowerCase();
  if (/^https?:\/\/(mcs-|[^/]+mcs[.-]|sgali-mcs)/.test(u) && u.includes("list")) return true;
  if (/mcs-[^/]+\.tiktokv\.com\/.+list(\?|#|$)/.test(u) && u.length < 200) {
    // corpo quase sempre {"e",...} — não é grelha
    return true;
  }
  return /\/v1\/list(\?|#|$)/.test(u) && u.includes("tiktokv.com");
}

/**
 * Candidata forte: Fetch/XHR com "list" no caminho/último segmento (como na coluna Nome do DevTools).
 * Exclui pings; pedidos `batch?biz_id=bytecom` costumam ser 204 (sem corpo) — tratar fora.
 */
function isPromisingXhrListUrl(url) {
  if (isTelemetryOrNoiseUrl(url) || isListMcsPingUrl(url)) return false;
  const u = String(url).toLowerCase();
  if (/\/(batch|collect)([/?]|$)/.test(u) && (u.includes("bytecom") || u.includes("biz_id"))) {
    return false;
  }
  if (/([?&])([a-z_]*name|operation)=list([&#]|$)/.test(u)) return true;
  if (/\/list([/?#&]|$)/.test(u) || u.endsWith("/list")) {
    return true;
  }
  if (/[?&/]list([&#]|$)/.test(u)) {
    if (/mcs-|sgali-mcs|monitor|\/batch/i.test(u)) return false;
    return true;
  }
  return false;
}

/** Ignora estáticos no console para não encher; `NET_LOG=verbose` regista tudo. */
function netLogSkipUrl(url) {
  if (!url || url.startsWith("data:")) return true;
  if (netLogVerbose) return false;
  const u = String(url).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|eot|map|mp4|webm|mp3|avif)([?#]|$)/.test(u)) {
    return true;
  }
  if (u.includes("favicon")) return true;
  return false;
}

/**
 * Alvo: resposta `application/json` e URL com `oec_bssdk` ou `list` (grelha).
 * Exclui pings `mcs` com `list` no path.
 */
function isApplicationJsonOecBssdkOrList(url, contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return false;
  }
  const u = String(url).toLowerCase();
  if (u.includes("oec_bssdk")) {
    return true;
  }
  if (u.includes("list") && !isListMcsPingUrl(url)) {
    return true;
  }
  return false;
}

/** URLs cujo corpo provavelmente traz listagem; reforçamos com heurística no JSON. */
const LIST_URL_HINTS = [
  "product",
  "item",
  "list",
  "feed",
  "search",
  "category",
  "shop",
  "pdp", // às vezes listagem e detalhe compartilham host
  "api",
  "graphql",
  "bff",
  "oec", // e-commerce (comum no TikTok Shop)
  "mall",
  "recommend",
  "v1",
  "v2",
  "v3"
];

const SALES_RE = /([\d.,]+)\s*([kKmM])?/i;

function parseSalesText(raw) {
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

function getProductId(x) {
  if (!x || typeof x !== "object") return null;
  return (
    x.product_id ??
    x.productId ??
    x.item_id ??
    x.id ??
    x.productIdStr ??
    x.product_id_str ??
  x.common?.id ??
  x.common?.item_id ??
  x.product_info?.product_id ??
  x.product_meta?.product_id ??
  x.card?.product_id ??
  x.product_meta?.id ??
  (typeof x.legacy_product_id === "string" || typeof x.legacy_product_id === "number"
    ? x.legacy_product_id
    : null) ??
  x.item?.product_id ??
  x.item_id_str ??
  null
  );
}

/**
 * Estrutura varia: listagem OEC costuma trazer product_price_info, sold_info, image.url_list, etc.
 */
function isProductLike(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = mergeProductLayers(x);
  const id = getProductId(o);
  if (id == null) return false;
  const hasTitle = !!(o.title || o.name || o.product_name);
  const hasPriceHint =
    o.price != null ||
    o.min_price != null ||
    o.sale_price != null ||
    o.salePrice != null ||
    o.format_price != null ||
    (o.sku && typeof o.sku === "object") ||
    (Array.isArray(o.sku_list) && o.sku_list.length) ||
    (o.price_info && typeof o.price_info === "object") ||
    (o.product_price_info && typeof o.product_price_info === "object");
  if (hasTitle) return true;
  return hasPriceHint;
}

function findProductArrays(node, depth = 0, out = []) {
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

/** Procura chaves comuns de listagem OEC/Shop: `products`, `product_list`, `item_list`, … */
function findNamedProductArrays(data) {
  const found = [];
  (function walk(node, depth) {
    if (depth > 24 || node == null) return;
    if (Array.isArray(node)) {
      for (const el of node) walk(el, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (
        (kl === "products" ||
          kl === "product_list" ||
          kl === "item_list" ||
          kl === "items" ||
          kl === "card_list" ||
          kl === "productlist" ||
          kl === "item_cards") &&
        Array.isArray(v) &&
        v.length > 0 &&
        v.some((el) => el && typeof el === "object" && isProductLike(el))
      ) {
        found.push(v);
      }
      walk(v, depth + 1);
    }
  })(data, 0);
  return found;
}

/** Último recurso: varre o JSON e acha nós com título + preço + id (formatos de feed que não vêm em arrays limpos). */
function findLooseProductNodes(node, depth = 0, out = []) {
  if (depth > 20 || node == null) return out;
  if (Array.isArray(node)) {
    for (const el of node) findLooseProductNodes(el, depth + 1, out);
    return out;
  }
  if (typeof node !== "object") return out;
  const o = mergeProductLayers(node);
  if (
    typeof o.title === "string" &&
    o.title.length > 2 &&
    getProductId(o) != null &&
    (o.min_price != null ||
      o.sale_price != null ||
      o.format_price != null ||
      (o.product_price_info && typeof o.product_price_info === "object") ||
      (o.product_meta && o.product_meta.sale_price != null) ||
      (o.sold_info && typeof o.sold_info === "object"))
  ) {
    out.push(node);
  }
  for (const v of Object.values(node)) findLooseProductNodes(v, depth + 1, out);
  return out;
}

/**
 * Sondagem de HTML: dados embutidos (Next/NUXT, flight/RSC) ou strings típicas de grelha.
 * @param {string} t
 * @param {number} [max=900_000]
 */
function huntPeelHtml(t, max = 900_000) {
  const s = t.length > max ? t.slice(0, max) : t;
  return {
    slice_len: s.length,
    has_next_or_flight:
      s.includes("__NEXT_DATA__") ||
      s.includes("self.__next_f") ||
      s.includes("__next_f__") ||
      s.includes("react-server") ||
      /"children"\s*:\s*"\$/.test(s) ||
      /\$R@/.test(s) ||
      /next\/dist/.test(s),
    has_nuxt: s.includes("__NUXT__") || s.includes("window.__NUXT"),
    has_string_item_list: s.includes("item_list") && /item_list|\"item_list\"/.test(s),
    has_string_product_id: /\"product_id\"\s*:/.test(s) || s.includes("product_id"),
    has_p16_or_ibyte: /p16-oec-|p19-oec-|ibyteimg\.com/i.test(s),
    n_script_tags: (s.match(/<script/gi) || []).length
  };
}

/**
 * Score e metadado para o caça-dados (ficheiro JSONL). Quanto mais alto, mais provável ser o feed.
 * @param {object} data
 * @param {string} t corpo
 */
function huntScoreJsonObject(data, t) {
  const sample = t.slice(0, 20_000);
  let score = 0;
  if (hasItemListOrProductInfo(data)) score += 25;
  if (findNamedProductArrays(data).length) score += 15;
  if (findLooseProductNodes(data, 0, []).length) score += 10;
  if (/"item_list"\s*:|"product_info"\s*:|min_price|sale_price|format_price|product_price_info|sku_list|sold_/.test(sample)) {
    score += 12;
  }
  if (findProductArrays(data, 0, []).length) score += 10;
  if (/p16-oec-|p19-oec-|ibyteimg|cover_image|pigeon|oec\./i.test(sample)) score += 6;
  return Math.min(100, score);
}

function pickString(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

function pickNumber(...vals) {
  for (const v of vals) {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Desconto em % a partir de `product_price_info` (Shop: discount_format "40%" e/ou discount_decimal "0.4").
 * @param {object | undefined} ppi
 * @returns {number | null} percentual (ex. 40), não fração
 */
function parseDiscountPercentFromPpi(ppi) {
  if (!ppi || typeof ppi !== "object") {
    return null;
  }
  const fmt = ppi.discount_format;
  if (fmt != null && String(fmt).trim() !== "") {
    const t = String(fmt)
      .trim()
      .replace(/\s/g, "")
      .replace(/^[−-]/, "")
      .replace(",", ".");
    const m = t.match(/^(\d+\.?\d*)\s*%$/) || t.match(/(\d+\.?\d*)\s*%/);
    if (m) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
        return Math.round(n * 10) / 10;
      }
    }
  }
  const dec = ppi.discount_decimal;
  if (dec == null || dec === "") {
    return null;
  }
  const d = parseFloat(String(dec).replace(",", "."));
  if (Number.isNaN(d) || d < 0) {
    return null;
  }
  if (d > 0 && d <= 1) {
    return Math.round(d * 1000) / 10;
  }
  if (d > 1 && d <= 100) {
    return Math.round(d * 10) / 10;
  }
  return null;
}

/** Tenta extrair valor numérico de strings "R$ 59,90" / "BRL 86.00" usadas no feed OEC. */
function parseBrlishMoneyString(s) {
  if (s == null) {
    return null;
  }
  if (typeof s === "number" && !Number.isNaN(s)) {
    return s;
  }
  if (typeof s !== "string") {
    return null;
  }
  const t = s.replace(/\s/g, "").replace(/\u00A0/g, "");
  const m = t.match(/R\$?([0-9.]+,\d{1,2}|[0-9]+[.,]\d{1,2}|[0-9]+)(?!\d)/i);
  if (m) {
    const g = m[1];
    const n =
      g.includes(",") && !g.includes(".")
        ? parseFloat(g.replace(/\./g, "").replace(",", "."))
        : g.includes(".") && g.includes(",")
          ? parseFloat(g.replace(/\./g, "").replace(",", "."))
          : parseFloat(g.replace(",", "."));
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }
  return null;
}

/**
 * preço a partir de campos "format" (product_price_info / price_info) — muitas vezes batem com o card.
 * @param {object | undefined} p
 */
function pickPriceFromFormatStrings(p) {
  if (!p || typeof p !== "object") {
    return null;
  }
  const keys = [
    p.sale_format_price,
    p.sale_price_format,
    p.show_price,
    p.format_price,
    p.selling_price
  ];
  for (const v of keys) {
    const n = parseBrlishMoneyString(v);
    if (n != null) {
      return n;
    }
  }
  return null;
}

function extractImages(p) {
  const imgs = new Set();
  const pushUrl = (u) => {
    if (u && typeof u === "string" && u.startsWith("http")) imgs.add(u);
  };
  if (Array.isArray(p.images)) p.images.forEach((x) => pushUrl(x?.url ?? x));
  if (Array.isArray(p.image_list)) p.image_list.forEach(pushUrl);
  if (Array.isArray(p.image?.url_list)) p.image.url_list.forEach(pushUrl);
  if (p.image?.url) pushUrl(p.image.url);
  if (p.cover_image?.url) pushUrl(p.cover_image.url);
  if (p.cover) pushUrl(typeof p.cover === "string" ? p.cover : p.cover?.url);
  if (p.main_image?.url) pushUrl(p.main_image.url);
  return [...imgs];
}

function mergeProductLayers(rawIn) {
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

/** Blocos de review no `loaderData` têm `review_id` e repetem o mesmo product_id sem preço — não são cartão de grelha. */
function isReviewOnlyProductNode(raw) {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  return raw.review_id != null;
}

/**
 * Colisão no mesmo `product_id`: fica a linha com mais dados (grelha com product_price_info ganha a reviews).
 * @param {ReturnType<normalizeItem> | null | undefined} n
 */
function productRowRichness(n) {
  if (!n) {
    return 0;
  }
  let s = 0;
  if (n.price != null && !Number.isNaN(Number(n.price))) {
    s += 5_000;
  }
  if (n.images?.length) {
    s += n.images.length * 200;
  }
  if (n.original_price != null) {
    s += 400;
  }
  if (n.discount_percent != null) {
    s += 200;
  }
  if (n.currency) {
    s += 100;
  }
  if (n.sales_count != null) {
    s += 50;
  }
  if (n.title) {
    s += 1;
  }
  return s;
}

/**
 * @param {Map<string, object>} byProductId chave = product_id
 * @param {ReturnType<normalizeItem>} n
 */
function mergeProductById(byProductId, n) {
  const key = String(n.product_id);
  if (!byProductId.has(key) || productRowRichness(n) > productRowRichness(byProductId.get(key))) {
    byProductId.set(key, n);
  }
}

/** ex.: br, us, gb — a partir de `https://shop.tiktok.com/br/c/...` */
function pathRegionFromCategoryUrl(categoriaUrl) {
  if (!categoriaUrl) {
    return "br";
  }
  const m = String(categoriaUrl).match(/shop\.tiktok\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
  if (m) {
    return m[1].toLowerCase();
  }
  return "br";
}

/**
 * URL pública do PDP. Prefere `seo_url.canonical_url` (loader Shop); senão
 * `https://www.tiktok.com/shop/{região}/pdp/{product_id}` alinhada à categoria.
 */
function pickProductPdpUrl(productId, raw, categoriaUrl) {
  const su = raw?.seo_url;
  const canon =
    su && typeof su === "object" && su.canonical_url != null
      ? String(su.canonical_url).trim()
      : typeof su === "string"
        ? su.trim()
        : null;
  if (canon && /^https?:\/\//i.test(canon)) {
    return canon.split(/[?#]/)[0];
  }
  const other = pickString(
    raw?.product_detail_url,
    raw?.pdp_url,
    raw?.product_meta?.pdp_url,
    raw?.link
  );
  if (other && /^https?:\/\//i.test(String(other)) && /tiktok\.com\/shop\//i.test(String(other))) {
    return String(other).split(/[?#]/)[0];
  }
  if (!productId) {
    return null;
  }
  const region = pathRegionFromCategoryUrl(categoriaUrl);
  return `https://www.tiktok.com/shop/${region}/pdp/${productId}`;
}

function normalizeItem(rawIn, categoriaUrl = "") {
  const raw = mergeProductLayers(rawIn);
  const ppi = raw.product_price_info;
  const pm = raw.product_meta;
  const id = pickString(
    getProductId(raw),
    raw.productIdStr
  );
  if (!id) return null;

  if (isReviewOnlyProductNode(raw)) {
    return null;
  }

  const title = pickString(raw.title, raw.name, raw.product_name);
  const si = raw.sold_info;
  const salesRaw = pickString(
    si?.sold_text,
    si?.sold_count_str,
    raw.sale_count,
    raw.sold_count,
    raw.sold,
    raw.sale_count_str,
    raw.sales
  );
  const soldCountNum =
    typeof si?.sold_count === "number" && !Number.isNaN(si.sold_count) ? si.sold_count : null;
  const salesParsed =
    soldCountNum ??
    parseSalesText(salesRaw) ??
    pickNumber(
      raw.sale_count_num,
      raw.sold_count_num,
      raw.sale_count_value
    );

  const sku0 =
    Array.isArray(raw.sku_list) && raw.sku_list[0] && typeof raw.sku_list[0] === "object"
      ? raw.sku_list[0]
      : null;
  const fromFormatStr =
    pickPriceFromFormatStrings(ppi) ??
    pickPriceFromFormatStrings(raw) ??
    (raw.price_info && typeof raw.price_info === "object" ? pickPriceFromFormatStrings(raw.price_info) : null);
  const price =
    fromFormatStr ??
    pickNumber(
      sku0?.sale_price,
      sku0?.price,
      pm?.sale_price,
      ppi?.sale_price,
      ppi?.price,
      ppi?.sale_price_decimal,
      pm?.min_price,
      ppi?.min_price,
      raw.price,
      raw.min_price,
      raw.sale_price,
      raw.salePrice,
      raw.price_info?.price,
      raw.price_info?.sale_price
    ) ??
    null;

  const originalPrice = pickNumber(
    ppi?.origin_price,
    ppi?.original_price,
    ppi?.origin_price_decimal,
    raw.origin_price,
    raw.original_price,
    raw.strike_price,
    raw.price_info?.origin_price
  );

  // discount_format = badge do card; evitar ppi.discount "agregado" a sobrepor a percentagem de UI.
  let discountFromApi = parseDiscountPercentFromPpi(ppi) ?? parseDiscountPercentFromPpi(raw);
  if (discountFromApi == null) {
    discountFromApi = pickNumber(
      raw.discount,
      raw.discount_rate,
      ppi?.discount,
      ppi?.rate_discount
    );
  }
  let discountPercent = discountFromApi;
  if (
    discountPercent == null &&
    originalPrice != null &&
    price != null &&
    originalPrice > 0 &&
    originalPrice > price
  ) {
    discountPercent = Math.round(((originalPrice - price) / originalPrice) * 1000) / 10;
  }

  const currency = pickString(
    ppi?.currency,
    ppi?.currency_code,
    ppi?.currency_name,
    raw.currency,
    raw.currency_code,
    raw.price_info?.currency
  );

  const sku =
    pickString(
      raw.sku_id,
      raw.skuId,
      raw.default_sku_id,
      Array.isArray(raw.sku_list) && raw.sku_list[0]
        ? raw.sku_list[0].sku_id ?? raw.sku_list[0].id
        : null
    ) ?? id;

  const discountFormatText = pickString(ppi?.discount_format, raw?.discount_format);

  const product_url = pickProductPdpUrl(id, raw, categoriaUrl);

  return {
    sku,
    product_id: id,
    product_url,
    title,
    price,
    original_price: originalPrice,
    discount_percent: discountPercent,
    discount_format_text: discountFormatText || null,
    currency,
    sales_count: salesParsed,
    sales_display: salesRaw,
    images: extractImages(raw),
    source_keys: Object.keys(raw).slice(0, 25)
  };
}

function shouldInspectUrl(url) {
  try {
    const u = url.toLowerCase();
    if (/(tiktok|byteoversea|ttdns|ibyteimg)/i.test(u) === false) return false;
    return LIST_URL_HINTS.some((h) => u.includes(h));
  } catch {
    return false;
  }
}

async function humanPause(page, min = 400, max = 1200) {
  const ms = min + Math.random() * (max - min);
  await new Promise((r) => setTimeout(r, ms));
}

async function gentleMouseJiggle(page) {
  const vp = page.viewport() || { width: 1280, height: 800 };
  for (let i = 0; i < 3; i++) {
    const x = 80 + Math.random() * (vp.width - 160);
    const y = 120 + Math.random() * (vp.height - 200);
    await page.mouse.move(x, y, { steps: 12 + Math.floor(Math.random() * 8) });
    await humanPause(page, 200, 500);
  }
}

/**
 * Com HEADED=1, se ainda não estiver no domínio do Shop, aguarda login sem fechar o browser.
 * Ajuste o tempo: LOGIN_WAIT_MAX_MS (milissegundos, padrão 15 min).
 */
async function waitForShopOrTimeout(page, { maxMs }) {
  // eslint-disable-next-line no-console
  console.log(
    `[TikTok] Tela de login ou redirecionamento. Faça o login; o script fica aberto por até ${Math.round(maxMs / 60_000)} min (env LOGIN_WAIT_MAX_MS).`
  );
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 2000));
    const u = page.url();
    if (/shop\.tiktok\.com/i.test(u)) {
      // eslint-disable-next-line no-console
      console.log(`[TikTok] Shop detectado: ${u.slice(0, 120)}...`);
      return { ok: true, url: u };
    }
  }
  return { ok: false, url: page.url() };
}

/**
 * Lê o JSON do script #__MODERN_ROUTER_DATA__ (React Router / shop desktop).
 * @param {import("puppeteer").Page} page
 * @returns {Promise<object | null>}
 */
async function getModernRouterDataFromPage(page) {
  return page.evaluate(() => {
    const el = document.getElementById("__MODERN_ROUTER_DATA__");
    if (!el || !el.textContent) {
      return null;
    }
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  });
}

/**
 * Resumo leve p/ ficheiro de teste (chaves, não o JSON inteiro de ~400k).
 * @param {object | null} rootData
 * @param {{ routeKey: string | null, loaderDataKeys: string[] }} info
 * @param {string} [sampleSlice] prévia opcional
 */
function buildModernRouterPeekFile(rootData, info, sampleSlice) {
  const out = {
    nota: "Dados iniciais embebidos no HTML. merge_* reflete o que entrou no mapa de produtos.",
    coletado_em: new Date().toISOString(),
    root_keys: rootData && typeof rootData === "object" ? Object.keys(rootData) : [],
    loaderData_keys: info.loaderDataKeys,
    rota_categoria: info.routeKey,
    merge: info.merge
  };
  if (info.errors != null) {
    out.errors = info.errors;
  }
  if (info.loaderData_summary) {
    out.loaderData_summary = info.loaderData_summary;
  }
  if (sampleSlice) {
    out["amostra_json_rota_ou_loader(bytes)"] = sampleSlice.length;
    out.amostra = sampleSlice;
  }
  return out;
}

/**
 * Sonda loaderData: uma entrada por chave (apenas chaves, para ver o que vem).
 * @param {object} ld
 * @returns {object[]}
 */
function summarizerLoaderDataKeys(ld) {
  if (!ld || typeof ld !== "object") {
    return [];
  }
  return Object.keys(ld).map((k) => {
    const v = ld[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return { chave: k, tipo: "object", subkeys: Object.keys(v).slice(0, 50) };
    }
    if (Array.isArray(v)) {
      return { chave: k, tipo: "array", length: v.length };
    }
    return { chave: k, tipo: typeof v };
  });
}

/**
 * Tenta o mesmo extract que os XHR: item_list, arrays nomeados, nós soltos, sobre loaderData.
 * @param {object} rootData
 * @param {Map<string, object>} byProductId chave = product_id
 * @param {string} categoriaUrl URL da categoria (região do PDP)
 * @returns {{ newCount: number, routeKey: string | null, loaderDataKeys: string[], errors?: unknown, merge: object }}
 */
function mergeProductsFromModernRouter(rootData, byProductId, categoriaUrl) {
  if (!rootData || typeof rootData !== "object") {
    return {
      newCount: 0,
      routeKey: null,
      loaderDataKeys: [],
      errors: (rootData && rootData.errors) ?? undefined,
      merge: { novos: 0, antes: byProductId.size, depois: byProductId.size }
    };
  }
  const err = rootData.errors;
  const ld = rootData.loaderData;
  if (!ld || typeof ld !== "object") {
    return {
      newCount: 0,
      routeKey: null,
      loaderDataKeys: [],
      errors: err,
      merge: { novos: 0, antes: byProductId.size, depois: byProductId.size, motivo: "sem_loaderData" }
    };
  }
  const keys = Object.keys(ld);
  const routeKey =
    keys.find((k) => k.includes("(category_id)")) ||
    keys.find((k) => k.includes("/c/") && k.includes("page")) ||
    null;
  const before = byProductId.size;
  const root = ld;
  const oec = collectOecItemListOrProductInfo(root);
  for (const it of oec) {
    const n = normalizeItem(it, categoriaUrl);
    if (!n) continue;
    mergeProductById(byProductId, n);
  }
  for (const arr of [...findProductArrays(root, 0, []), ...findNamedProductArrays(root)]) {
    for (const item of arr) {
      const n = normalizeItem(item, categoriaUrl);
      if (!n) continue;
      mergeProductById(byProductId, n);
    }
  }
  for (const item of findLooseProductNodes(root, 0, [])) {
    const n = normalizeItem(item, categoriaUrl);
    if (!n) continue;
    mergeProductById(byProductId, n);
  }
  return {
    newCount: byProductId.size - before,
    routeKey,
    loaderDataKeys: keys,
    errors: err,
    merge: { novos: byProductId.size - before, antes: before, depois: byProductId.size, routeKey }
  };
}

async function scrollToLoadGrid(page) {
  let lastHeight = 0;
  let stable = 0;
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollBy(0, 700));
    await humanPause(page, 500, 1100);
    const h = await page.evaluate(() => document.body?.scrollHeight ?? 0);
    if (h === lastHeight) stable += 1;
    else stable = 0;
    lastHeight = h;
    if (stable >= 2) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await humanPause(page, 300, 600);
}

const DEFAULT_CHROME_PROFILE = path.join(ROOT, ".chrome-tiktok-profile");

async function main() {
  const startUrl = process.env.CATEGORY_URL || DEFAULT_URL;
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "teste_categoria.json");
  const debugFile = path.join(OUT_DIR, "debug_responses.log");
  const fresh = process.env.FRESH_SESSION === "1";
  let userDataDir = process.env.CHROME_USER_DATA?.trim() || null;
  if (!userDataDir && !fresh) {
    userDataDir = DEFAULT_CHROME_PROFILE;
    await fs.mkdir(userDataDir, { recursive: true });
  }
  if (userDataDir) {
    // eslint-disable-next-line no-console
    console.log(`[Perfil] ${path.resolve(userDataDir)} (login fica salvo. Sessão limpa: FRESH_SESSION=1)`);
  }
  const isHeaded = process.env.HEADED === "1";
  const loginWaitMaxMs = Math.max(60_000, Number(process.env.LOGIN_WAIT_MAX_MS) || 15 * 60_000);
  /** Navegador visível: em muitos casos evita redirecionamento forçado à página de login (headless). */
  const headless = isHeaded ? false : "new";

  /** chave = product_id; dedupe: mantém a linha mais "rica" (preço, imagens) */
  const byProductId = new Map();
  const debugLines = [];

  const launchOpts = {
    headless,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--lang=pt-BR",
      "--window-size=1366,800"
    ],
    defaultViewport: headless ? { width: 1366, height: 800 } : null
  };
  if (userDataDir) {
    launchOpts.userDataDir = userDataDir;
  }

  const browser = await puppeteer.launch(launchOpts);

  const page = await browser.newPage();
  // Perfil (userDataDir) restaura abas anteriores; a loja abre alvos com _blank. Ficar só com esta aba
  // para a coleta; não mexe na lógica de rede nem no goto.
  for (const p of await browser.pages()) {
    if (p !== page) {
      await p.close().catch(() => {});
    }
  }
  page.on("popup", (popup) => {
    void popup.close().catch(() => {});
  });
  browser.on("targetcreated", (target) => {
    if (target.type() !== "page") {
      return;
    }
    void (async () => {
      const p = await target.page();
      if (p && p !== page) {
        await p.close().catch(() => {});
      }
    })();
  });

  const netLogFile = path.join(OUT_DIR, "rede_ultima_execucao.log");
  if (netLog) {
    await fs.writeFile(netLogFile, `inicio ${new Date().toISOString()}\n${"=".repeat(80)}\n`, "utf8");
    // eslint-disable-next-line no-console
    console.log(
      `[net] Tráfego na consola e em: ${netLogFile} | Desligar: NET_LOG=0 | Só tudo (incl. imagens): NET_LOG=verbose`
    );
  }

  const huntXhrSeen = new Set();
  if (huntLog) {
    const head =
      JSON.stringify({
        t: new Date().toISOString(),
        kind: "meta",
        note: "Uma linha JSON por pista. kind=json (score alto = mais provável ser feed) | html_doc (dados no HTML/Next/RSC)"
      }) + "\n";
    await fs.writeFile(CACA_DADOS_JSONL, head, "utf8");
    await fs.writeFile(
      CACA_XHR_FILE,
      `# urls unicas xhr/fetch (hosts relevantes) ${new Date().toISOString()}\n`,
      "utf8"
    );
    // eslint-disable-next-line no-console
    console.log(
      `[caca] Pistas: ${CACA_DADOS_JSONL} + ${CACA_XHR_FILE} | Desligar: HUNT_LOG=0 (com --debug desliga a caça e mantem debug)`
    );
  }

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (huntLog) {
      const u = req.url();
      const br = req.resourceType() || "";
      if (
        (br === "xhr" || br === "fetch") &&
        isDiscoverRelevantHost(u) &&
        !isTelemetryOrNoiseUrl(u) &&
        !isListMcsPingUrl(u)
      ) {
        if (!huntXhrSeen.has(u)) {
          huntXhrSeen.add(u);
          fs.appendFile(CACA_XHR_FILE, u + "\n", "utf8").catch(() => {});
        }
      }
    }
    if (netLog) {
      const u = req.url();
      if (netLogVerbose || !netLogSkipUrl(u)) {
        const br = (req.resourceType() || "?").padEnd(9);
        const uShow = u.length > 200 ? u.slice(0, 200) + "…" : u;
        const line = `[net→] ${(req.method() || "?").padEnd(4)} ${br} ${uShow}`;
        // eslint-disable-next-line no-console
        console.log(line);
        fs.appendFile(netLogFile, line + "\n", "utf8").catch(() => {});
      }
    }
    req.continue();
  });

  if (netLog) {
    page.on("response", (response) => {
      const u = response.url();
      if (!netLogVerbose && netLogSkipUrl(u)) {
        return;
      }
      const status = response.status();
      const ct = (response.headers()["content-type"] || "-").split(";").shift() || "-";
      let rt = "?";
      try {
        const rq = response.request();
        if (rq) {
          rt = rq.resourceType() || "?";
        }
      } catch {
        // ignora
      }
      const uShow = u.length > 200 ? u.slice(0, 200) + "…" : u;
      const line = `[net←] ${String(status).padStart(3)} ${rt.padEnd(9)} ${ct.slice(0, 40).padEnd(40)} ${uShow}`;
      // eslint-disable-next-line no-console
      console.log(line);
      fs.appendFile(netLogFile, line + "\n", "utf8").catch(() => {});
    });
  }

  await page.setExtraHTTPHeaders({
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  });

  let jsonPeeksTried = 0;
  let jsonSnapshotN = 0;
  const doJsonSnapshot = process.env.JSON_SNAPSHOT === "1";
  const isDiscover = process.env.DISCOVER === "1";
  const discoverPath = path.join(OUT_DIR, "descoberta_redes.jsonl");
  const discoverMax = 400;
  let discoverCount = 0;

  if (isDiscover) {
    await fs.writeFile(discoverPath, "", "utf8");
    // eslint-disable-next-line no-console
    console.log(
      `[Descoberta] A gravar candidatos em ${discoverPath} (máx. ${discoverMax}). Desligar: não use DISCOVER=1`
    );
  }

  page.on("response", async (response) => {
    const url = response.url();
    const status = response.status();
    if (isTelemetryOrNoiseUrl(url)) {
      return;
    }
    if (status === 204 || status === 205) {
      return;
    }

    const type = (response.headers()["content-type"] || "").toLowerCase();
    const isTargetJsonOecList = isApplicationJsonOecBssdkOrList(url, type);

    const isBytecomList = matchesBytecomListUrl(url);
    const isWiden = isWidenShopOrOecUrl(url);
    const isPromisingList = isPromisingXhrListUrl(url);

    let resourceType = "";
    try {
      const rq = response.request();
      if (rq) {
        resourceType = rq.resourceType() || "";
      }
    } catch {
      // ignora
    }

    const ctIsJson =
      type.includes("application/json") || /\+json|text\/json/.test(type);

    const needHuntJson =
      huntLog &&
      ctIsJson &&
      (isDiscoverRelevantHost(url) || isWiden || isPromisingList || shouldInspectUrl(url)) &&
      !isListMcsPingUrl(url);
    const needHuntHtml =
      huntLog && type.includes("text/html") && resourceType === "document" && /shop\.tiktok\.com/i.test(url);

    const needBodyForDiscover =
      isDiscover &&
      discoverCount < discoverMax &&
      (isDiscoverRelevantHost(url) || isPromisingList || isTargetJsonOecList);
    const needBodyForExtract =
      isTargetJsonOecList ||
      isBytecomList ||
      shouldInspectUrl(url) ||
      isWiden ||
      isPromisingList;
    const needRead = needHuntJson || needHuntHtml || needBodyForDiscover || needBodyForExtract;
    if (!needRead) {
      return;
    }
    if (!needHuntHtml && (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("font/"))) {
      return;
    }
    if (type.includes("text/html") && !needHuntHtml) {
      return;
    }

    let text;
    try {
      text = await response.text();
    } catch {
      return;
    }
    if (!text || text.length < 2) return;
    if (text.length > 1_500_000) {
      if (huntLog && needHuntHtml) {
        const peel = huntPeelHtml(text);
        const line = {
          t: new Date().toISOString(),
          kind: "html_doc_huge",
          status,
          total_len: text.length,
          content_type: type.slice(0, 100),
          url: url.length > 500 ? url.slice(0, 500) : url,
          ...peel
        };
        try {
          await fs.appendFile(CACA_DADOS_JSONL, JSON.stringify(line) + "\n", "utf8");
        } catch {
          // ignora
        }
        // eslint-disable-next-line no-console
        if (peel.has_string_item_list || peel.has_p16_or_ibyte) {
          console.log(
            `[caca] html_doc_huge: item_list_str=${peel.has_string_item_list} p16=${peel.has_p16_or_ibyte} ${url.slice(0, 100)}...`
          );
        }
      }
      return;
    }
    const t = text.trim();

    if (needHuntHtml) {
      const peel = huntPeelHtml(text);
      const line = {
        t: new Date().toISOString(),
        kind: "html_doc",
        status,
        url: url.length > 500 ? url.slice(0, 500) : url,
        content_type: type.slice(0, 100),
        ...peel
      };
      try {
        await fs.appendFile(CACA_DADOS_JSONL, JSON.stringify(line) + "\n", "utf8");
        if (peel.has_string_item_list || peel.has_p16_or_ibyte) {
          // eslint-disable-next-line no-console
          console.log(
            `[caca] html: next|flight=${peel.has_next_or_flight} nuxt=${peel.has_nuxt} str_item_list=${peel.has_string_item_list} p16=${peel.has_p16_or_ibyte} scripts≈${peel.n_script_tags} | ${url.slice(0, 100)}...`
          );
        }
      } catch {
        // ignora
      }
      return;
    }

    if (t[0] !== "{" && t[0] !== "[") {
      if (huntLog && needHuntJson) {
        const line = {
          t: new Date().toISOString(),
          kind: "not_json_body",
          status,
          size: t.length,
          head: t.slice(0, 300),
          url: url.length > 500 ? url.slice(0, 500) : url
        };
        try {
          await fs.appendFile(CACA_DADOS_JSONL, JSON.stringify(line) + "\n", "utf8");
        } catch {
          // ignora
        }
      }
      return;
    }
    if (jsonPeeksTried < 200) jsonPeeksTried += 1;

    let data;
    try {
      data = JSON.parse(t);
    } catch {
      if (huntLog && needHuntJson) {
        const line = {
          t: new Date().toISOString(),
          kind: "json_parse_fail",
          status,
          size: t.length,
          url: url.length > 500 ? url.slice(0, 500) : url
        };
        try {
          await fs.appendFile(CACA_DADOS_JSONL, JSON.stringify(line) + "\n", "utf8");
        } catch {
          // ignora
        }
      }
      return;
    }

    if (huntLog && needHuntJson) {
      const score = huntScoreJsonObject(data, t);
      const root = Array.isArray(data)
        ? `array[${data.length}]`
        : data && typeof data === "object"
          ? Object.keys(data).slice(0, 50)
          : [];
      const line = {
        t: new Date().toISOString(),
        kind: "json",
        status,
        score,
        size: t.length,
        content_type: type.slice(0, 100),
        url: url.length > 800 ? url.slice(0, 800) : url,
        root_keys: root,
        has_item_list_tree: hasItemListOrProductInfo(data),
        big_json: t.length >= HUNT_BIG_JSON
      };
      if (line.big_json && !Array.isArray(data) && data && typeof data === "object") {
        const keyShapes = {};
        for (const key of Object.keys(data).slice(0, 18)) {
          const v = data[key];
          if (v && typeof v === "object" && v !== null && !Array.isArray(v)) {
            keyShapes[key] = Object.keys(v).slice(0, 24);
          } else if (Array.isArray(v) && v.length) {
            keyShapes[key] = { _array_len: v.length };
          }
        }
        line.key_shapes = keyShapes;
      }
      try {
        await fs.appendFile(CACA_DADOS_JSONL, JSON.stringify(line) + "\n", "utf8");
        if (score >= HUNT_SCORE_CONSOLE) {
          // eslint-disable-next-line no-console
          console.log(
            `[caca] score=${score} size=${t.length} item_list=${line.has_item_list_tree} ${
              url.length > 160 ? url.slice(0, 160) + "…" : url
            }`
          );
        }
      } catch {
        // ignora
      }
    }

    if (needBodyForDiscover) {
      const sample = t.slice(0, 6_000);
      const heur = {
        has_item_list: hasItemListOrProductInfo(data),
        looks_like_product_json: /product_id|item_list|product_price|min_price|sold_count|\"title\"|product_info/.test(
            sample
          )
      };
      const line = {
        t: new Date().toISOString(),
        status: response.status(),
        content_type: type.slice(0, 80),
        size: t.length,
        url,
        raiz: Array.isArray(data)
          ? `array[${data.length}]`
          : data && typeof data === "object"
            ? Object.keys(data).slice(0, 30)
            : [],
        ...heur
      };
      try {
        await fs.appendFile(discoverPath, JSON.stringify(line) + "\n", "utf8");
        discoverCount += 1;
      } catch {
        // ignora
      }
    }

    if (!needBodyForExtract) {
      return;
    }

    if (isBytecomList && hasItemListOrProductInfo(data)) {
      const oec = collectOecItemListOrProductInfo(data);
      for (const it of oec) {
        const n = normalizeItem(it, startUrl);
        if (!n) continue;
        mergeProductById(byProductId, n);
      }
      if (debug) {
        debugLines.push(
          `[bytecom/list+item_list|product_info] ${url.slice(0, 220)} itens~${oec.length}`
        );
      }
    }

    if (!shouldInspectUrl(url) && !isWiden && !isPromisingList && !isTargetJsonOecList) {
      return;
    }

    const fromTree = findProductArrays(data, 0, []);
    const fromNames = findNamedProductArrays(data);
    const loose = findLooseProductNodes(data, 0, []);
    const arrays = [
      ...fromTree,
      ...fromNames,
      ...(loose.length > 0 ? [loose] : [])
    ];
    if (arrays.length === 0) {
      if (debug) {
        const u = url.toLowerCase();
        if (
          u.includes("shop.tiktok.com") ||
          u.includes("oec") ||
          u.includes("pigeon") ||
          u.includes("mason") ||
          u.includes("ec-api")
        ) {
          const keyStr = Array.isArray(data)
            ? `array[${data.length}]`
            : data && typeof data === "object"
              ? Object.keys(data).slice(0, 12).join(",")
              : String(typeof data);
          debugLines.push(`json_sem_produto: ${url.slice(0, 220)} keys=${keyStr}`);
        }
      }
      if (doJsonSnapshot && jsonSnapshotN < 3) {
        const u = url.toLowerCase();
        if (
          !isTelemetryOrNoiseUrl(url) &&
          /(oec|pigeon|mason|product|category|list|feed)/.test(u) &&
          /tiktok|byte|oec|ibyteimg|shop\.tiktok/i.test(u)
        ) {
          const dir = path.join(OUT_DIR, "debug_snapshots");
          try {
            await fs.mkdir(dir, { recursive: true });
            const file = path.join(dir, `snap_${jsonSnapshotN++}.json`);
            const s = JSON.stringify({ url, body: data }, null, 2);
            const max = 900_000;
            await fs.writeFile(
              file,
              s.length > max ? s.slice(0, max) + "\n" : s,
              "utf8"
            );
          } catch {
            // ignora
          }
        }
      }
      return;
    }
    for (const arr of arrays) {
      for (const item of arr) {
        const n = normalizeItem(item, startUrl);
        if (!n) continue;
        mergeProductById(byProductId, n);
      }
    }
    if (debug) {
      debugLines.push(`HIT: ${url.slice(0, 200)} products_in_payload~${arrays.flat().length}`);
    }
  });

  let finalUrl = startUrl;
  let status = "ok";
  let note = null;

  let reloadedCategoryAfterLogin = false;

  try {
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await humanPause(page, 2500, 4500);
    finalUrl = page.url();

    if (!/shop\.tiktok\.com/i.test(finalUrl) && isHeaded) {
      const w = await waitForShopOrTimeout(page, { maxMs: loginWaitMaxMs });
      finalUrl = w.url;
      if (w.ok) {
        reloadedCategoryAfterLogin = true;
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await humanPause(page, 2000, 4000);
        finalUrl = page.url();
      }
    }

    if (!/shop\.tiktok\.com/i.test(finalUrl)) {
      status = "not_shop";
      note = isHeaded
        ? `Ainda fora de shop.tiktok.com após ${Math.round(loginWaitMaxMs / 60_000)} min. Aumente LOGIN_WAIT_MAX_MS ou conclua o login a tempo. Perfil: CHROME_USER_DATA=...`
        : "A sessão caiu fora de shop.tiktok.com. Use HEADED=1, faça o login; na próxima execução o login deve persistir no perfil .chrome-tiktok-profile. Outro local: CHROME_USER_DATA=caminho.";
      await fs.writeFile(
        MODERN_ROUTER_PEEK,
        JSON.stringify(
          { coletado_em: new Date().toISOString(), final_url: finalUrl, status: "not_shop", erro: "não lido — sessão fora de shop.tiktok.com" },
          null,
          2
        ),
        "utf8"
      );
    } else {
      if (reloadedCategoryAfterLogin) {
        // já recarregou a categoria acima; só ajusta ritmo
        await humanPause(page, 1000, 2000);
      } else {
        await humanPause(page, 1500, 3000);
      }
      await gentleMouseJiggle(page);
      await scrollToLoadGrid(page);
      await humanPause(page, 2000, 4000);
      // Handlers de `response` são assíncronos; aguarda XHR/JSON atrasados antes de fechar o browser
      await new Promise((r) => setTimeout(r, 5000));

      let modernRouter = null;
      try {
        modernRouter = await getModernRouterDataFromPage(page);
      } catch (e) {
        if (debug) {
          debugLines.push(`modern_router: evaluate falhou — ${e?.message || e}`);
        }
      }
      const routerPeekLen = Math.min(120_000, Math.max(0, Number(process.env.ROUTER_PEEK_LEN) || 8_000));
      if (!modernRouter) {
        await fs.writeFile(
          MODERN_ROUTER_PEEK,
          JSON.stringify(
            {
              coletado_em: new Date().toISOString(),
              final_url: page.url(),
              erro: "sem #__MODERN_ROUTER_DATA__ no DOM ou JSON inválido"
            },
            null,
            2
          ),
          "utf8"
        );
      } else {
        const mergedInfo = mergeProductsFromModernRouter(modernRouter, byProductId, startUrl);
        const ld = modernRouter.loaderData;
        const sample =
          routerPeekLen > 0 && ld
            ? JSON.stringify(
                mergedInfo.routeKey && ld[mergedInfo.routeKey] != null ? ld[mergedInfo.routeKey] : ld
              ).slice(0, routerPeekLen)
            : "";
        const peekBody = buildModernRouterPeekFile(modernRouter, {
          ...mergedInfo,
          loaderData_summary: ld ? summarizerLoaderDataKeys(ld) : []
        }, sample || undefined);
        peekBody.categoria_url = startUrl;
        peekBody.final_url = finalUrl;
        await fs.writeFile(MODERN_ROUTER_PEEK, JSON.stringify(peekBody, null, 2), "utf8");
        // eslint-disable-next-line no-console
        console.log(
          `[modern_router] ${MODERN_ROUTER_PEEK} | subkeys na rota + amostra ROUTER_PEEK_LEN=${routerPeekLen} (0=sem amostra)`
        );
        if (debug && mergedInfo.newCount > 0) {
          debugLines.push(
            `modern_router: +${mergedInfo.newCount} item(ns) no mapa a partir do loader embebido`
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (byProductId.size === 0 && status === "ok") {
    status = "no_products";
    note =
      "Nenhum produto mapeado (XHR + loader). Abra output/modern_router_peek.json (chaves e amostra) e debug_responses.log com --debug; ajuste o parser se o feed vier só em loaderData aninhado.";
  }

  const products = Object.fromEntries(
    [...byProductId.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, n]) => [k, { ...n, categoria_url: startUrl }])
  );

  const payload = {
    category_url: startUrl,
    final_url: finalUrl,
    status,
    note,
    collected_at: new Date().toISOString(),
    count: byProductId.size,
    products
  };

  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  const itensDados = [...byProductId.values()]
    .map((n) => toDadosProdutoClean(n, startUrl))
    .sort((a, b) => String(a.product_id ?? "").localeCompare(String(b.product_id ?? "")));
  const dadosPayload = {
    coletado_em: new Date().toISOString(),
    categoria_url: startUrl,
    final_url: finalUrl,
    status,
    total: itensDados.length,
    filtro:
      "XHR/JSON (item_list, etc.) + JSON embebido #__MODERN_ROUTER_DATA__ (loaderData da categoria)",
    itens: itensDados
  };
  await fs.writeFile(DADOS_OUT, JSON.stringify(dadosPayload, null, 2), "utf8");

  if (debug) {
    const head = `final_url=${finalUrl}\njson_peeks≈${jsonPeeksTried}\n`;
    const body = debugLines.length
      ? debugLines.join("\n")
      : "(nenhum HIT com produtos; confira se final_url é shop.tiktok.com e cookies/login)";
    await fs.writeFile(debugFile, head + body, "utf8");
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        out: outFile,
        dados_produtos: DADOS_OUT,
        count: byProductId.size,
        debug: debug ? debugFile : null,
        caca_dados: huntLog ? CACA_DADOS_JSONL : null,
        caca_xhr_fetch: huntLog ? CACA_XHR_FILE : null,
        modern_router_peek: MODERN_ROUTER_PEEK
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
