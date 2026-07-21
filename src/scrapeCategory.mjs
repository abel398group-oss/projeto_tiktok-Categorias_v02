/**
 * Fase 1: coleta estável de UMA categoria — dados via page.on("response") + setRequestInterception(continue).
 * `PDP_GALLERY=1`: após a grelha, abre N PDPs (PDP_GALLERY_MAX) e recolhe `fotos_pdp` (DOM) e, no mesmo
 * passo, **preço de vitrine + "de" riscado** (hero 36px + cêntimos; `original_price` só se houver riscado).
 * Prioridade: respostas application/json cujo URL contém oec_bssdk ou list.
 * Número de itens no grid: variável (~20–25+); o merge deduplica por id de produto.
 * Rastreio p/ descoberta de origem: `output/extra/caca_dados.jsonl` + `caca_xhr_fetch_urls.txt` (HUNT_LOG / --hunt / --debug, exc. HUNT_LOG=0).
 * Dados de entrega: por defeito na raiz de `output/`: `dados_produtos.json` e `dados_lojas.json`; resto (debug, caça) em `output/extra/`.
 * Pasta alternativa sem alterar o parser: `OUTPUT_DIR=output/categorias/meu-slug` (caminho relativo ao repositório ou absoluto).
 * Teste do loader: `output/extra/modern_router_peek.json` (amostra `__MODERN_ROUTER_DATA__`); `ROUTER_PEEK_LEN=0` desliga a amostra.
 * **Sem produtos (0):** `status=no_products`, `process.exit(1)` na CLI, campo `diagnostic` + ficheiros em `extra/` (`final_page*.png`, `final_page.html`, `xhr_debug.json`, `browser_env.json`, …). `SCRAPE_DIAGNOSTIC=1`: captura intermédia após pós-goto (`post_goto_diagnostic.json`). `SCRAPE_POST_GOTO_RELOAD=0` desliga o reload `networkidle2` após o primeiro goto (headless).
 * **`HEADED=1`:** por defeito usa **Chrome instalado** (`Puppeteer channel=chrome`), não só o Chromium embebido — melhor para login TikTok (QR, Google). `PUPPETEER_USE_BUNDLED_CHROMIUM=1` força o Chromium do Puppeteer; `PUPPETEER_EXECUTABLE_PATH` / `PUPPETEER_CHANNEL` — ver `.env.example`.
 * Grelha: após scroll, até `VIEW_MORE_MAX_CLICKS` (1–10, default 8) cliques em **View more** / **Ver mais** (desligar: `VIEW_MORE_MAX_CLICKS=0` ou `VIEW_MORE=0`); só dispara UI — XHR/merge/router inalterados.
 * Regressão do normalizador: `npm test` (não regredir preço grelha, dedupe por id, filtro de review, loja).
 *
 * -- Modelo de dados (conceitual; contrato de ficheiros em `docs/ARCHITECTURE.md`) --
 * - Produto (product): identidade `product_id`, preço, imagens, vendas/ texto de vendas,
 *   `product_url` (PDP), avaliações de produto (`rate_info` / `review_avg`…). Vê `normalizeItem`.
 * - Loja (seller): chave lógica `seller_id` (+ `global_seller_id` quando existir), nome, métricas
 *   de loja, logos, etc. a partir de `seller_info` / `shop_info`. Vê `normalizeSellerInfo`,
 *   `mergeLojaFromNormalized`, `buildLojasMapBySeller`.
 *   Duplicação intencional: a mesma loja repete-se em cada `itens[]` de `dados_produtos.json`
 *   (conveniência) e existe consolidada em `output/dados_lojas.json` (fonte agregada).
 * - Snapshot (estado no tempo): ainda não implementado. Futuro: uma linha por coleta
 *   (preço, vendas, posição) ligada a `scrape_runs` — vê `docs/ARCHITECTURE.md` (Postgres alvo).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Stealth ativo por defeito. Desative com STEALTH=0 apenas quando precisar de login Google/OAuth
// (HEADED=1 + LOGIN_ONLY=1). Em coletas normais manter ativo reduz detecção de bot pelo TikTok.
if (process.env.STEALTH !== "0") {
  puppeteer.use(StealthPlugin());
}

// ─── Módulos utilitários extraídos de scrapeCategory ─────────────────────────
import {
  getIbyteImageAssetId,
  dedupeImageUrlsByAssetId,
  dedupeImageUrlsByPathname,
  subtractFotosOverlappingPdp,
  dedupePdpImageUrls,
  normalizeAndDedupeLogoUrlList,
  extractImages,
  extractHttpImageUrlsDeep
} from "./scrape/image-utils.mjs";
import {
  pickString,
  pickNumber,
  parseSalesText,
  parseDiscountPercentFromPpi,
  parseBrlishMoneyString,
  pickPriceFromFormatStrings,
  ppiHasDiscountSignal,
  priceFromDefaultSku,
  reconcileVitrineNoDiscount,
  alignPriceToStatedPercent,
  computePrecoEstimadoVitrineFields,
  extractProductRatings,
  coalesceProductRatings,
  parseRateInfoObject,
  combinePdpHeroPriceParts,
  applyPdpDomPrices
} from "./scrape/price-parser.mjs";
import {
  mergeProductLayers,
  isReviewOnlyProductNode,
  getProductId,
  isProductLike,
  findProductArrays,
  findNamedProductArrays,
  findLooseProductNodes,
  hasItemListOrProductInfo,
  collectOecItemListOrProductInfo,
  huntScoreJsonObject,
  extractAllImageUrlsFromRouterProductNode,
  normalizeSellerInfo,
  extractLojaFromNormalized,
  lojaToRowFields,
  mergeLojaFromNormalized,
  mergeProductById,
  pathRegionFromCategoryUrl,
  pickProductPdpUrl,
  normalizeItem,
  toDadosProdutoClean,
  buildLojasMapBySeller,
  productRowRichness,
  LOJA_FIELD_DEFAULTS,
  setSellerDebugMode,
  sellerDebugSamples
} from "./scrape/normalizer.mjs";
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

let OUT_DIR;
let OUT_AUX;
let DADOS_OUT;
let DADOS_LOJAS_OUT;
let DEBUG_SELLER_SOURCES;
let MODERN_ROUTER_PEEK;
let CACA_DADOS_JSONL;
let CACA_XHR_FILE;

/**
 * Resolução de pastas de escrita. Chamada no início de `main` (lê `OUTPUT_DIR` no processo do CLI).
 * @see process.env.OUTPUT_DIR
 */
function initOutputPaths() {
  const raw = process.env.OUTPUT_DIR != null && String(process.env.OUTPUT_DIR).trim() !== ""
    ? String(process.env.OUTPUT_DIR).trim()
    : "output";
  const base = path.isAbsolute(raw) ? path.normalize(raw) : path.join(ROOT, raw.replace(/\\/g, "/"));
  OUT_DIR = base;
  OUT_AUX = path.join(OUT_DIR, "extra");
  DADOS_OUT = path.join(OUT_DIR, "dados_produtos.json");
  DADOS_LOJAS_OUT = path.join(OUT_DIR, "dados_lojas.json");
  DEBUG_SELLER_SOURCES = path.join(OUT_AUX, "debug_seller_sources.json");
  MODERN_ROUTER_PEEK = path.join(OUT_AUX, "modern_router_peek.json");
  CACA_DADOS_JSONL = path.join(OUT_AUX, "caca_dados.jsonl");
  CACA_XHR_FILE = path.join(OUT_AUX, "caca_xhr_fetch_urls.txt");
}

/**
 * Recria `OUT_DIR` e `OUT_DIR/extra` antes de escrever em `extra/`
 * (caminho aninhado `output/categorias/...`; pasta pode desaparecer a meio da execução).
 */
async function ensureOutAuxDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(OUT_AUX, { recursive: true });
}

/** Só ativo durante `main` — `output/extra/debug_seller_sources.json` (máx. 20) */

const DEFAULT_URL =
  "https://shop.tiktok.com/br/c/womenswear-underwear/601152?source=ecommerce_sitemap&enter_method=category_directory&first_entrance=ecommerce_category&first_entrance_position=bread_crumbs&first_entrance_tt_scene=seo";

const debug = process.argv.includes("--debug");
/** true: imprime tráfego de rede (pedido + resposta) para achar a URL do JSON. Desligar: NET_LOG=0 */
const netLog =
  process.env.NET_LOG !== "0" &&
  (process.argv.includes("--net-log") || process.env.NET_LOG === "1" || process.argv.includes("--debug"));
const netLogVerbose = process.env.NET_LOG === "verbose" || process.env.NET_LOG === "2";
/**
 * Modo "caça": `output/extra/caca_dados.jsonl` + `output/extra/caca_xhr_fetch_urls.txt` (URLs únicas).
 * Ligar: `--hunt` ou HUNT_LOG=1 (padrão com `--debug`); desligar: HUNT_LOG=0
 */
const huntLog =
  process.env.HUNT_LOG !== "0" &&
  (process.argv.includes("--hunt") || process.env.HUNT_LOG === "1" || process.argv.includes("--debug"));
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


/**
 * Só a grelha de miniaturas do produto (overflow-x-scroll + células w-66/h-66 no PDP).
 * Não varre a página toda nem o JSON do router (isso trazia fotos de avaliações e outro ruído).
 * Executado no browser.
 */
function collectPdpGalleryUrlsInBrowser() {
  const list = [];
  const seen = new Set();
  const add = (u) => {
    if (typeof u !== "string" || u.length < 20) {
      return;
    }
    const t = u.trim();
    if (!t.startsWith("http")) {
      return;
    }
    if (!/p16-|p19-|ibyteimg|tiktokcdn\.com/i.test(t)) {
      return;
    }
    if (/\/(avt|sign\/)/i.test(t) || /aweme-avt|user_?avator|user_avatar|common-sign|user_nick/i.test(t)) {
      return;
    }
    if (seen.has(t)) {
      return;
    }
    seen.add(t);
    list.push(t);
  };
  const inReviewLikeSection = (el) => {
    let a = el;
    for (let d = 0; d < 14 && a; d++) {
      const id = a.id != null ? String(a.id) : "";
      const cn = a.className != null ? String(a.className) : "";
      const e2e = a.getAttribute && a.getAttribute("data-e2e");
      const blob = `${id} ${cn} ${e2e || ""}`.toLowerCase();
      if (
        /review|avalia|comment|uploader|ugc|buyer|photo-?review|user-?media|image-?list-?review/.test(blob)
      ) {
        return true;
      }
      a = a.parentElement;
    }
    return false;
  };
  const isUnderProductThumbStrip = (img) => {
    if (!img || !img.parentElement) {
      return false;
    }
    if (inReviewLikeSection(img)) {
      return false;
    }
    const p = img.parentElement;
    const cnP = p.className != null ? String(p.className) : "";
    const parentIsThumbCell = cnP.includes("w-66") && cnP.includes("h-66");
    if (!parentIsThumbCell) {
      return false;
    }
    let a = p.parentElement;
    for (let d = 0; d < 8 && a; d++) {
      const cn = a.className != null ? String(a.className) : "";
      if (cn.includes("overflow-x-scroll") && cn.includes("flex")) {
        return !inReviewLikeSection(a);
      }
      a = a.parentElement;
    }
    return false;
  };
  for (const img of document.querySelectorAll("img[src]")) {
    if (!isUnderProductThumbStrip(img) || !img.src) {
      continue;
    }
    add(img.src);
  }
  if (list.length > 0) {
    return list;
  }
  for (const strip of document.querySelectorAll("div[class*='overflow-x-scroll']")) {
    const cn = strip.className != null ? String(strip.className) : "";
    if (!cn.includes("flex") || inReviewLikeSection(strip)) {
      continue;
    }
    for (const img of strip.querySelectorAll("img[src]")) {
      if (inReviewLikeSection(img) || !img.src) {
        continue;
      }
      add(img.src);
    }
  }
  return list;
}

/**
 * Junta a parte inteira (ex. "67") e os cêntimos (ex. ",28" ou ".28") no preço hero da PDP.
 * Usado após a coleta de texto no browser; `npm test` valida a combinação.
 * @param {string} intPart
 * @param {string} decPart
 * @returns {number | null}
 */
function findProductNodeByIdInModernRouter(rootData, productId) {
  if (!rootData || typeof rootData !== "object" || !productId) {
    return null;
  }
  const roots = [rootData, rootData.loaderData].filter((x) => x && typeof x === "object");
  for (const r of roots) {
    const found = findProductNodeByIdInTree(r, String(productId), 0);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * @param {unknown} node
 * @param {string} productId
 * @param {number} depth
 * @returns {object | null}
 */
function findProductNodeByIdInTree(node, productId, depth) {
  if (depth > 45 || node == null) {
    return null;
  }
  if (Array.isArray(node)) {
    for (const el of node) {
      const r = findProductNodeByIdInTree(el, productId, depth + 1);
      if (r) {
        return r;
      }
    }
    return null;
  }
  if (typeof node !== "object") {
    return null;
  }
  const id = getProductId(node);
  if (id != null && String(id) === productId && node.product_price_info && typeof node.product_price_info === "object") {
    return node;
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") {
      const r = findProductNodeByIdInTree(v, productId, depth + 1);
      if (r) {
        return r;
      }
    }
  }
  return null;
}

/**
 * Fallback quando o nó estrito (`product_price_info`) não aparece: mesmo `product_id` com imagens de produto.
 * @param {object} rootData
 * @param {string} productId
 * @returns {object | null}
 */
function findProductNodeByIdInModernRouterLoose(rootData, productId) {
  if (!rootData || typeof rootData !== "object" || !productId) {
    return null;
  }
  const roots = [rootData, rootData.loaderData].filter((x) => x && typeof x === "object");
  for (const r of roots) {
    const found = findProductNodeByIdInTreeLooseImages(r, String(productId), 0);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * @param {unknown} node
 * @param {string} productId
 * @param {number} depth
 * @returns {object | null}
 */
function findProductNodeByIdInTreeLooseImages(node, productId, depth) {
  if (depth > 45 || node == null) {
    return null;
  }
  if (Array.isArray(node)) {
    for (const el of node) {
      const r = findProductNodeByIdInTreeLooseImages(el, productId, depth + 1);
      if (r) {
        return r;
      }
    }
    return null;
  }
  if (typeof node !== "object") {
    return null;
  }
  const id = getProductId(node);
  if (
    id != null &&
    String(id) === productId &&
    !isReviewOnlyProductNode(node) &&
    extractImages(mergeProductLayers(node)).length > 0
  ) {
    return node;
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") {
      const r = findProductNodeByIdInTreeLooseImages(v, productId, depth + 1);
      if (r) {
        return r;
      }
    }
  }
  return null;
}

/**
 * DFS: todas as refs de produto com o mesmo id no `__MODERN_ROUTER_DATA__` (vários blobs por produto).
 * @param {unknown} node
 * @param {string} productId
 * @param {number} depth
 * @param {object[]} acc
 * @param {WeakSet<object>} seen
 */
function collectNodesByProductIdDFS(node, productId, depth, acc, seen) {
  if (depth > 45 || node == null) {
    return;
  }
  if (Array.isArray(node)) {
    for (const el of node) {
      collectNodesByProductIdDFS(el, productId, depth + 1, acc, seen);
    }
    return;
  }
  if (typeof node !== "object") {
    return;
  }
  const id = getProductId(node);
  if (id != null && String(id) === productId && !isReviewOnlyProductNode(node)) {
    if (!seen.has(node)) {
      seen.add(node);
      acc.push(node);
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") {
      collectNodesByProductIdDFS(v, productId, depth + 1, acc, seen);
    }
  }
}

/**
 * Todas os nós de produto com este `product_id` em `root` + `loaderData`.
 * @param {object} rootData
 * @param {string} productId
 * @returns {object[]}
 */
function collectAllProductNodesByIdUnderRouter(rootData, productId) {
  if (!rootData || typeof rootData !== "object" || !productId) {
    return [];
  }
  const roots = [rootData, rootData.loaderData].filter((x) => x && typeof x === "object");
  /** @type {WeakSet<object>} */
  const seen = new WeakSet();
  /** @type {object[]} */
  const acc = [];
  for (const r of roots) {
    collectNodesByProductIdDFS(r, String(productId), 0, acc, seen);
  }
  return acc;
}

/**
 * `normalizeItem` sobre o nó vindo de `#__MODERN_ROUTER_DATA__` (PDP) — o loader costuma ter
 * `format_price` / `show_price` mais alinhados ao card do que o XHR mínimo da grelha.
 * @param {object | null} root
 * @param {string} productId
 * @param {string} categoriaUrl
 * @returns {{ sale: number, listPrice: number | null } | null}
 */
function pdpPriceFromLoaderRoot(root, productId, categoriaUrl) {
  if (!root || !productId) {
    return null;
  }
  const raw = findProductNodeByIdInModernRouter(root, String(productId));
  if (!raw) {
    return null;
  }
  const n = normalizeItem(mergeProductLayers(raw), categoriaUrl || "");
  if (!n || n.price == null || Number.isNaN(Number(n.price))) {
    return null;
  }
  return { sale: n.price, listPrice: n.original_price };
}

/**
 * Lista de URLs de imagem a partir do `__MODERN_ROUTER_DATA__` na PDP (complemento ao DOM de miniaturas).
 * Referência de restauro acordada: **the best** → ver tag git `the-best`.
 *
 * @param {object | null} root — {@link getModernRouterDataFromPage}
 * @param {string} productId
 * @returns {string[]}
 */
function extractPdpImageUrlsFromModernRouterRoot(root, productId) {
  if (!root || !productId) {
    return [];
  }
  const pid = String(productId);
  const nodes = collectAllProductNodesByIdUnderRouter(root, pid);
  let best = [];
  for (const node of nodes) {
    const urls = extractAllImageUrlsFromRouterProductNode(node);
    if (urls.length > best.length) {
      best = urls;
    }
  }
  return best;
}

/**
 * @param {import("puppeteer").Page} page
 * @returns {Promise<string[]>}
 */
async function collectPdpGalleryUrlsFromPage(page) {
  return page.evaluate(collectPdpGalleryUrlsInBrowser);
}

/**
 * No PDP: lê o preço de vitrine no DOM. Aceita 28px–48px, classe Headline* (não só 36px) e
 * desempata pelo **maior font-size** (evita apanhar cifra pequena de variante / cupom). Não escolhe span riscado.
 * + "de" riscado no mesmo bloco. Se o DOM não devolver, usa **uma vez** o loader `__MODERN_ROUTER_DATA__`.
 * @param {import("puppeteer").Page} page
 * @param {string} productId
 * @param {string} categoriaUrl
 * @param {object | null | undefined} [preloadRoot] — se definido (`null` incluído), não volta a ler o script `#__MODERN_ROUTER_DATA__`
 * @returns {Promise<{ sale: number | null, listPrice: number | null }>}
 */
async function collectPdpProductPricesFromPage(page, productId, categoriaUrl, preloadRoot) {
  const evalDom = () =>
    page.evaluate(() => {
    const combine = (a, b) => {
      const a0 = String(a || "").replace(/[^\d]/g, "");
      if (!a0) {
        return null;
      }
      const rawD = String(b || "").replace(/[^\d]/g, "");
      if (!rawD) {
        const n0 = parseFloat(a0, 10);
        return Number.isNaN(n0) || n0 < 0 ? null : n0;
      }
      const d2 = rawD.length >= 2 ? rawD.slice(0, 2) : rawD.padEnd(2, "0");
      const n0 = parseFloat(`${a0}.${d2}`, 10);
      if (Number.isNaN(n0) || n0 < 0) {
        return null;
      }
      return Math.round(n0 * 100) / 100;
    };
    const fontSizePx = (el) => {
      try {
        const s = getComputedStyle(el).fontSize || "";
        const m = s.match(/([\d.]+)px/);
        return m ? parseFloat(m[1]) : 0;
      } catch {
        return 0;
      }
    };
    const isHeadline = (el) => {
      const c = el.className != null ? String(el.className) : "";
      return c.includes("Headline");
    };
    const parseBr = (text) => {
      if (text == null) {
        return null;
      }
      const t = String(text)
        .replace(/\s/g, "")
        .replace(/\u00A0/g, "");
      if (/frete|shipp|\/kg|unid\./i.test(t)) {
        return null;
      }
      const m = t.match(/R\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{1,2}|[0-9]+[.,]\d{1,2}|[0-9]{1,4})/i);
      if (m) {
        const g = m[1];
        const n0 =
          g.includes(",") && !g.includes(".")
            ? parseFloat(g.replace(/\./g, "").replace(",", "."), 10)
            : g.includes(".") && g.includes(",")
              ? parseFloat(g.replace(/\./g, "").replace(",", "."), 10)
              : parseFloat(g.replace(",", "."), 10);
        if (!Number.isNaN(n0) && n0 > 0.3 && n0 < 1e7) {
          return Math.round(n0 * 100) / 100;
        }
      }
      return null;
    };
    const isStrikethrough = (el) => {
      if (!el) {
        return false;
      }
      const cl = el.className != null ? String(el.className) : "";
      if (/line-through|lineThrough/i.test(cl)) {
        return true;
      }
      try {
        const td = String(getComputedStyle(el).textDecorationLine || "");
        if (td === "line-through") {
          return true;
        }
        return td.split(/\s+/).indexOf("line-through") >= 0;
      } catch {
        return false;
      }
    };
    const findStrikethroughListPrice = (heroEl, sale) => {
      if (!heroEl) {
        return null;
      }
      let c = heroEl;
      let best = null;
      for (let depth = 0; depth < 9 && c; depth++) {
        c = c.parentElement;
        if (!c) {
          break;
        }
        const all = c.querySelectorAll("span, div, s, del, p, ins, strong");
        for (const el of all) {
          if (el === heroEl || heroEl.contains(el)) {
            continue;
          }
          if (!isStrikethrough(el)) {
            continue;
          }
          const p = parseBr(el.textContent || "");
          if (p == null) {
            continue;
          }
          if (sale != null && p <= sale + 0.01) {
            continue;
          }
          if (best == null || p > best) {
            best = p;
          }
        }
      }
      return best;
    };

    let bestSale = null;
    let bestFs = 0;
    let heroEl = null;

    for (const intSpan of document.querySelectorAll("span")) {
      if (!isHeadline(intSpan)) {
        continue;
      }
      if (isStrikethrough(intSpan)) {
        continue;
      }
      const fsv = fontSizePx(intSpan);
      if (fsv < 28 || fsv > 48) {
        continue;
      }
      const tInt = (intSpan.textContent || "").trim().replace(/[^\d]/g, "");
      if (!/^\d{1,4}$/.test(tInt)) {
        continue;
      }
      const next = intSpan.nextElementSibling;
      let n0 = null;
      if (next && next.tagName === "SPAN") {
        const tDec0 = (next.textContent || "").replace(/\s/g, "").replace(/\u00A0/g, "");
        const m = tDec0.match(/^[.,](\d{1,2})/);
        if (m) {
          n0 = combine(tInt, m[0]);
        }
      }
      if (n0 == null) {
        const t = (intSpan.textContent || "").replace(/\s/g, "");
        const m1 = t.match(/^(\d{1,4})[.,](\d{2})$/);
        if (m1) {
          n0 = parseFloat(`${m1[1]}.${m1[2]}`, 10);
          if (!Number.isNaN(n0)) {
            n0 = Math.round(n0 * 100) / 100;
          }
        }
      }
      if (n0 == null || n0 < 0.3 || n0 >= 1e7) {
        continue;
      }
      if (fsv > bestFs || (fsv === bestFs && bestSale != null && n0 > bestSale)) {
        bestFs = fsv;
        bestSale = n0;
        heroEl = intSpan;
      }
    }

    const listPrice = findStrikethroughListPrice(heroEl, bestSale);
    return { sale: bestSale, listPrice };
  });

  /** @type {object | null} */
  let root;
  /** @type {{ sale: number | null; listPrice: number | null }} */
  let fromDom;
  if (preloadRoot !== undefined) {
    root = preloadRoot ?? null;
    fromDom = await evalDom();
  } else {
    [root, fromDom] = await Promise.all([getModernRouterDataFromPage(page), evalDom()]);
  }
  const fromNorm = pdpPriceFromLoaderRoot(root, productId, categoriaUrl);
  const hasDom = fromDom.sale != null && !Number.isNaN(fromDom.sale) && fromDom.sale > 0;
  if (hasDom && fromNorm && fromNorm.sale > fromDom.sale * 1.05) {
    // DOM apanhou cifra baixa (variante / linha acessória); o loader do PDP costuma ter o mesmo format da vitrine
    return { sale: fromNorm.sale, listPrice: fromNorm.listPrice };
  }
  if (hasDom) {
    return fromDom;
  }
  if (fromNorm) {
    return { sale: fromNorm.sale, listPrice: fromNorm.listPrice };
  }
  return { sale: null, listPrice: null };
}

/**
 * Abre `product_url` (PDP), preenche `images_pdp` e, quando possível, **preço de vitrine + "de"** no DOM
 * (`price` = hero 28px–48px + cêntimos, ou `__MODERN_ROUTER_DATA__`; `original` = riscado se existir).
 * Opcional: env `PDP_GALLERY=1`. Até 2 PDP em paralelo (`PDP_GALLERY_CONCURRENCY`, default 2).
 * @param {import("puppeteer").Browser} browser
 * @param {import("puppeteer").Page} page — primeira tab (worker 0); segunda tab é criada só se concorrência > 1
 * @param {Map<string, object>} byProductId
 * @param {{ max: number, debugLines?: string[], categoriaUrl?: string }} opts
 * @returns {Promise<object>}
 */
export async function enrichByProductIdWithPdpGallery(browser, page, byProductId, opts) {
  const max = Math.max(0, Math.min(500, opts.max));
  const categoriaUrl = opts.categoriaUrl != null ? String(opts.categoriaUrl) : "";
  const debugLines = opts.debugLines;
  const withPdp = [...byProductId.values()].filter(
    (n) => n?.product_url && String(n.product_url).includes("/pdp/")
  );
  const conc = Math.min(
    2,
    Math.max(1, Number.parseInt(String(process.env.PDP_GALLERY_CONCURRENCY || "2"), 10) || 1)
  );

  /** @type {import("puppeteer").Page | null} */
  let secondary = null;
  try {
    const workers = [page];
    if (conc > 1) {
      secondary = await browser.newPage();
      await applyBrazilBrowsingContext(secondary);
      workers.push(secondary);
    }

    /**
     * @param {import("puppeteer").Page} workerPage
     * @param {object} n
     * @returns {Promise<boolean>}
     */
    const visitOnePdp = async (workerPage, n) => {
      try {
        await workerPage.goto(String(n.product_url), { waitUntil: "domcontentloaded", timeout: 90_000 });
        await syncBrazilEnvToLivePage(workerPage);
        await humanPause(workerPage, 900, 1800);
        await workerPage
          .waitForSelector("span[class*='Headline']", { timeout: 15_000 })
          .catch(() => undefined);
        await workerPage.waitForSelector("#__MODERN_ROUTER_DATA__", { timeout: 22_000 }).catch(() => undefined);
        await workerPage
          .waitForFunction(
            () => {
              const el = document.getElementById("__MODERN_ROUTER_DATA__");
              const t = el?.textContent != null ? String(el.textContent).trim() : "";
              return t.length > 80 && t.includes("{") && t.includes("}");
            },
            { timeout: 14_000 }
          )
          .catch(() => undefined);
        await humanPause(workerPage, 175, 400);
        const rawDom = await collectPdpGalleryUrlsFromPage(workerPage);
        let routerRoot = await getModernRouterDataFromPage(workerPage);
        if (
          routerRoot == null ||
          (typeof routerRoot === "object" && Object.keys(routerRoot).length === 0)
        ) {
          await humanPause(workerPage, 375, 750);
          routerRoot = await getModernRouterDataFromPage(workerPage);
        }
        const fromRouter = extractPdpImageUrlsFromModernRouterRoot(routerRoot, String(n.product_id));
        const merged = dedupePdpImageUrls([...fromRouter, ...rawDom]);
        const pdpDom = await collectPdpProductPricesFromPage(
          workerPage,
          String(n.product_id),
          categoriaUrl,
          routerRoot
        );
        n.images_pdp = merged.length > 0 ? merged : null;
        applyPdpDomPrices(n, pdpDom);
        if (debugLines && merged.length) {
          const rN = fromRouter.length;
          const dN = rawDom.length;
          debugLines.push(
            `[pdp_gallery] ${n.product_id} → ${merged.length} url(s) (router:${rN} dom:${dN})`
          );
        }
        if (debugLines && pdpDom && typeof pdpDom.sale === "number" && !Number.isNaN(pdpDom.sale)) {
          const o = pdpDom.listPrice != null ? `, "de" DOM: ${pdpDom.listPrice}` : ", sem riscado";
          debugLines.push(`[pdp_gallery] ${n.product_id} preço: ${pdpDom.sale}${o}`);
        }
        return true;
      } catch (e) {
        n.images_pdp = null;
        if (debugLines) {
          debugLines.push(`[pdp_gallery] ${n.product_id} falhou: ${(e && e.message) || String(e)}`);
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[pdp_gallery] ${n.product_id}: ${(e && e.message) || e}`);
        }
        return false;
      }
    };

    let visited = 0;
    let i = 0;
    while (i < withPdp.length && visited < max) {
      const room = max - visited;
      const batchSize = Math.min(conc, withPdp.length - i, room);
      if (batchSize <= 0) {
        break;
      }
      const batch = withPdp.slice(i, i + batchSize);
      i += batchSize;
      const outcomes = await Promise.all(
        batch.map((n, bi) => visitOnePdp(workers[bi % workers.length], n))
      );
      visited += outcomes.filter(Boolean).length;
      await humanPause(page, 250, 700);
    }
    return { visited, max, eligible: withPdp.length };
  } finally {
    if (secondary) {
      await secondary.close().catch(() => {});
    }
  }
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

async function humanPause(page, min = 200, max = 600) {
  // Simula uma pausa humana ocasionalmente mais longa (ex: parou para ler algo)
  const extraChance = Math.random();
  let actualMax = max;
  let actualMin = min;

  if (extraChance > 0.95) {
    actualMin = 2000;
    actualMax = 5000;
  } else if (extraChance > 0.8) {
    actualMin = 800;
    actualMax = 1500;
  }

  const ms = actualMin + Math.random() * (actualMax - actualMin);
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Após scroll da grelha: substitui espera fixa longa quando o número de produtos deixa de crescer
 * durante `stableNeedMs` (xhr assíncronos), com teto compatível com a antiga espera fixa.
 * Env: FEED_DRAIN_POLL_MS (default 200), FEED_STABLE_MS (default 1200), FEED_DRAIN_MAX_MS (default 5000).
 *
 * @param {() => number} getProductCount tipicamente () => map.size
 */
async function waitForStableProductFeed(getProductCount) {
  const pollMs = Math.max(50, Number(process.env.FEED_DRAIN_POLL_MS) || 200);
  const stableNeedMs = Math.max(200, Number(process.env.FEED_STABLE_MS) || 1200);
  const maxMs = Math.max(500, Number(process.env.FEED_DRAIN_MAX_MS) || 5000);
  const start = Date.now();
  let lastCount = getProductCount();
  let lastChangeAt = Date.now();

  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const n = getProductCount();
    if (n !== lastCount) {
      lastCount = n;
      lastChangeAt = Date.now();
      continue;
    }
    if (Date.now() - lastChangeAt >= stableNeedMs) {
      break;
    }
  }
}

async function gentleMouseJiggle(page) {
  const vp = page.viewport() || { width: 1600, height: 900 };
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const x = 100 + Math.random() * (vp.width - 200);
    const y = 150 + Math.random() * (vp.height - 300);
    // Movimento com velocidade variável
    await page.mouse.move(x, y, { steps: 20 + Math.floor(Math.random() * 25) });
    
    await humanPause(page, 200, 500);
  }
}

function isTiktokMainHostname(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const h = new URL(urlStr).hostname.toLowerCase();
    return h === "www.tiktok.com" || h === "tiktok.com";
  } catch {
    return false;
  }
}

/**
 * Host real da página tem de ser `shop.tiktok.com`.
 * `www.tiktok.com/login?redirect_url=...shop.tiktok.com...` contém o texto no query — não é Shop.
 * @param {string} urlStr
 */
function isShopTiktokHostname(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    return new URL(urlStr).hostname.toLowerCase() === "shop.tiktok.com";
  } catch {
    return false;
  }
}

/**
 * Com HEADED=1, se ainda não estiver no domínio do Shop, aguarda login sem fechar o browser.
 * O QR / OAuth pode abrir o Shop noutra aba — esta função vê **todas** as abas e, se o Shop
 * estiver só na outra, faz `goto(startUrl)` na aba instrumentada (mesmo contexto = mesmos cookies).
 * Ajuste o tempo: LOGIN_WAIT_MAX_MS (milissegundos, padrão 15 min).
 *
 * @param {import("puppeteer").Browser} browser
 * @param {import("puppeteer").Page} page aba com handlers XHR (não trocar de aba no Puppeteer)
 * @param {{ maxMs: number, startUrl: string }} opts
 * @returns {Promise<{ ok: boolean, url: string, navigatedInsideWait: boolean }>}
 */
async function waitForShopOrTimeout(browser, page, { maxMs, startUrl }) {
  // eslint-disable-next-line no-console
  console.log(
    `[TikTok] MODO PACIENTE ATIVADO: Aguardando login manual. A janela NÃO vai fechar sozinha.`
  );
  const t0 = Date.now();
  let lastBeat = Date.now();
  
  // Aumentamos o tempo para quase infinito (1 hora) se estiver em modo headed
  const actualMaxMs = process.env.HEADED === "1" ? 3600000 : maxMs;

  while (Date.now() - t0 < actualMaxMs) {
    await new Promise((r) => setTimeout(r, 2000));

    if (Date.now() - lastBeat > 15_000) {
      lastBeat = Date.now();
      // eslint-disable-next-line no-console
      console.log(`[TikTok] Ainda aguardando login... (Pode levar o tempo que precisar)`);
      
      // Tira foto para o assistente ver o progresso
      try {
        const loginSnapPath = path.join(OUT_AUX, "login_atual.png");
        await page.screenshot({ path: loginSnapPath }).catch(() => {});
      } catch { /* noop */ }
    }

    let u = "";
    try {
      u = page.url();
    } catch {
      return { ok: false, url: "", navigatedInsideWait: false };
    }

    if (isShopTiktokHostname(u)) {
      console.log(`[TikTok] SUCESSO! Login detectado no Shop. Iniciando coleta...`);
      return { ok: true, url: u, navigatedInsideWait: false };
    }
    
    // Se logou e caiu no For You, a gente redireciona
    if (isTiktokMainHostname(u) && !u.includes("/login") && !u.includes("/passport")) {
       console.log(`[TikTok] Login feito! Redirecionando para o Shop em 3 segundos...`);
       await new Promise(r => setTimeout(r, 3000));
       await page.goto(startUrl, { waitUntil: "networkidle2" });
       return { ok: true, url: page.url(), navigatedInsideWait: true };
    }
  }
  return { ok: false, url: "", navigatedInsideWait: false };
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
  const startUrl = page.url();
  // eslint-disable-next-line no-console
  console.log("[scrape] Iniciando scroll progressivo e aleatório...");

  for (let i = 0; i < 15; i++) {
    // Aborta se a página navegou para fora da categoria (ex: PDP)
    if (page.url() !== startUrl) {
      // eslint-disable-next-line no-console
      console.warn(`[scrape] scrollToLoadGrid: navegação inesperada detectada (${page.url().slice(0, 80)}…) — abortando scroll`);
      return;
    }

    // Scroll com valor aleatório para não ser sempre o mesmo salto
    const scrollAmount = 400 + Math.floor(Math.random() * 500);
    try {
      await page.evaluate((amt) => window.scrollBy(0, amt), scrollAmount);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[scrape] scrollToLoadGrid: evaluate falhou (navegação em curso?) —", e?.message ?? e);
      return;
    }

    // Pausa humana após cada scroll
    await humanPause(page, 400, 900);

    // Movimento aleatório do mouse ocasional durante o scroll
    if (Math.random() > 0.7) {
      await gentleMouseJiggle(page);
    }

    let h = 0;
    try {
      h = await page.evaluate(() => document.body?.scrollHeight ?? 0);
    } catch {
      return;
    }
    if (h === lastHeight) stable += 1;
    else stable = 0;
    lastHeight = h;

    if (stable >= 3) break;
  }
  // Volta ao topo de forma suave
  try {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  } catch { /* navegação ocorreu, ignorar */ }
  await humanPause(page, 1000, 2000);
}

/**
 * Após o scroll da grelha: clica em "View more" / "Ver mais" (e equivalentes) para a UI carregar mais blocos.
 * Os novos produtos entram só via fluxo existente (`response` + merge); não altera normalização nem router.
 *
 * Desligar: `VIEW_MORE=0` ou `VIEW_MORE_MAX_CLICKS=0`.
 *
 * @param {import("puppeteer").Page} page
 * @param {() => number} getProductCount
 */
async function clickViewMoreWhileNeeded(page, getProductCount) {
  const off = process.env.VIEW_MORE === "0";
  const rawMax = Number(process.env.VIEW_MORE_MAX_CLICKS);
  const maxClicksConfigured = Number.isFinite(rawMax) ? rawMax : 8;
  const maxClicks = off ? 0 : Math.max(0, maxClicksConfigured);
  const drainMs = Math.max(800, Number(process.env.VIEW_MORE_DRAIN_MS) || 4500);

  if (maxClicks === 0) {
    // eslint-disable-next-line no-console
    console.log("[view-more] encerrando (motivo: VIEW_MORE_MAX_CLICKS=0 ou VIEW_MORE=0)");
    return;
  }

  let noGrowthStreak = 0;

  for (let i = 0; i < maxClicks; i++) {
    let found;
    try {
      found = await page.evaluate(() => {
        const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
        const matches = (t) => {
          const s = norm(t).toLowerCase();
          if (!s) return false;
          if (s === "view more" || s === "ver mais" || s === "see more" || s === "mostrar mais") return true;
          return /^(view more|ver mais|see more|mostrar mais)\b/i.test(s) && s.length <= 52;
        };
        const visible = (el) => {
          if (!el || !(el instanceof HTMLElement)) return false;
          const st = window.getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 2;
        };

        const nodes = Array.from(
          document.querySelectorAll(
            'button,[role="button"],a[class*="cursor-pointer"],div[role="button"],span[role="button"]'
          )
        );
        /** @type {HTMLElement | null} */
        let best = null;
        for (const el of nodes) {
          const t = norm(el.textContent);
          if (!matches(t)) continue;
          if (!visible(el)) continue;
          /** @type {HTMLElement | null} */
          let hx = el;
          if (hx != null && (hx.tagName === "SPAN" || hx.tagName === "I")) {
            hx = hx.closest('button,[role="button"],a,[role="link"]');
          }
          const target = hx && visible(hx) ? hx : el;
          best = /** @type {HTMLElement} */ (target);
          break;
        }
        if (!best) {
          return { ok: false, label: "" };
        }
        const lbl = norm(best.textContent).slice(0, 72);
        try {
          try {
            best.scrollIntoView({ block: "center", behavior: "instant" });
          } catch {
            /* noop */
          }
          best.click();
          return { ok: true, label: lbl };
        } catch (e) {
          return { ok: false, label: lbl || "", err: String(e?.message ?? e) };
        }
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[view-more] erro de execução (possível reload da página): ${e.message}`);
      break;
    }

    if (!found || !found.ok) {
      // eslint-disable-next-line no-console
      console.log(
        found.err
          ? `[view-more] encerrando (motivo: clique falhou — ${found.err})`
          : "[view-more] encerrando (motivo: botão não encontrado)"
      );
      break;
    }

    // eslint-disable-next-line no-console
    console.log("[view-more] botão encontrado");
    const before = getProductCount();
    // eslint-disable-next-line no-console
    console.log(`[view-more] clique ${i + 1}`);
    await humanPause(page, 1000, 2000);

    const t0 = Date.now();
    while (Date.now() - t0 < drainMs) {
      if (getProductCount() > before) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    const after = getProductCount();
    const delta = after - before;
    // eslint-disable-next-line no-console
    console.log(`[view-more] novos produtos detectados: ${delta}`);

    if (delta === 0) {
      noGrowthStreak += 1;
      if (noGrowthStreak >= 2) {
        // eslint-disable-next-line no-console
        console.log("[view-more] encerrando (motivo: contagem não aumentou após cliques consecutivos)");
        break;
      }
    } else {
      noGrowthStreak = 0;
    }
  }
}

/** Perfil persistente (Docker: `/app/.puppeteer-profile/tiktok-shop` quando `ROOT=/app`). Sobrescrever: `CHROME_USER_DATA` ou `PUPPETEER_TIKTOK_PROFILE`. */
const DEFAULT_CHROME_PROFILE = path.join(ROOT, ".puppeteer-profile", "tiktok-shop");

const TIKTOK_ACCEPT_LANGUAGE = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7";

/** UA estável (Chrome recente em Windows). Override: `CHROME_STABLE_UA`. */
const CHROME_STABLE_USER_AGENT =
  process.env.CHROME_STABLE_UA?.trim() ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const BRAZIL_TIMEZONE_ID = "America/Sao_Paulo";

/** Evita `evaluateOnNewDocument` duplicado na mesma `Page`. */
const brazilBrowsingContextApplied = new WeakSet();

/** Evita registar várias vezes o listener `domcontentloaded` na mesma `Page`. */
const brazilDomContentSyncAttached = new WeakSet();

/** Uma sessão CDP por `Page` (timezone + locale); evita acumular sessões em cada `sync`. */
const brazilCdpSessionByPage = new WeakMap();

/**
 * @param {import("puppeteer").Page} page
 * @returns {Promise<import("puppeteer").CDPSession>}
 */
async function getOrCreateBrazilCdpSession(page) {
  let s = brazilCdpSessionByPage.get(page);
  if (!s) {
    s = await page.createCDPSession();
    brazilCdpSessionByPage.set(page, s);
  }
  return s;
}

/**
 * Reforça fingerprint Brasil no documento **actual** (útil pós-`goto`): `Accept-Language`,
 * `emulateTimezone` + CDP `Emulation.setTimezoneOverride` / `setLocaleOverride`, e overrides no
 * main world a `navigator.language` / `navigator.languages` (o stealth pode deixar `en-US` só com
 * `evaluateOnNewDocument`).
 * @param {import("puppeteer").Page} page
 */
async function syncBrazilEnvToLivePage(page) {
  await page.setExtraHTTPHeaders({
    "Accept-Language": TIKTOK_ACCEPT_LANGUAGE
  });
  try {
    await page.emulateTimezone(BRAZIL_TIMEZONE_ID);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[locale] emulateTimezone:", e?.message || e);
  }
  try {
    const cdp = await getOrCreateBrazilCdpSession(page);
    await cdp.send("Emulation.setTimezoneOverride", { timezoneId: BRAZIL_TIMEZONE_ID });
    await cdp.send("Emulation.setLocaleOverride", { locale: "pt-BR" });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[locale] CDP timezone/locale:", e?.message || e);
  }
  try {
    await page.evaluate(() => {
      const langs = Object.freeze(["pt-BR", "pt", "en-US", "en"]);
      const nav = navigator;
      for (const key of ["language", "languages"]) {
        try {
          const d = Object.getOwnPropertyDescriptor(nav, key);
          if (d && d.configurable) {
            Reflect.deleteProperty(nav, key);
          }
        } catch {
          /* noop */
        }
      }
      try {
        Object.defineProperty(nav, "language", {
          get: () => "pt-BR",
          configurable: true,
          enumerable: true
        });
      } catch {
        /* noop */
      }
      try {
        Object.defineProperty(nav, "languages", {
          get: () => langs,
          configurable: true,
          enumerable: true
        });
      } catch {
        /* noop */
      }
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[locale] navigator override (main world):", e?.message || e);
  }
}

/**
 * Deduplica lojas por `seller_id` a partir do mapa de produtos.
 * Alimenta `output/dados_lojas.json` (agregado oficial por vendedor; ver `docs/ARCHITECTURE.md`).
 * @param {Map<string, object>} byProductId
 * @returns {Map<string, object>} valores = campos de loja (sem campos de produto)
 */

/**
 * TikTok "Security Check" / puzzle (anti-bot). Não resolve captcha — só detecta.
 * @param {import("puppeteer").Page} page
 */
async function detectTiktokSecurityChallenge(page) {
  let title = "";
  try {
    title = String(await page.title()).toLowerCase();
  } catch {
    return false;
  }
  if (title.includes("security check")) return true;
  if (title.includes("verificação de segurança") || title.includes("verificacao de seguranca")) return true;
  let body = "";
  try {
    body = await page.evaluate(() =>
      String(document.body?.innerText || "")
        .slice(0, 8000)
        .toLowerCase()
    );
  } catch {
    return false;
  }
  if (body.includes("security check")) return true;
  if (body.includes("verificação de segurança") || body.includes("verificacao de seguranca")) return true;
  if (body.includes("verify to continue") && (body.includes("puzzle") || body.includes("drag"))) return true;
  return false;
}

/**
 * Com janela visível: espera o utilizador concluir o puzzle / Security Check (polling).
 * Usa o mesmo teto que o login: `LOGIN_WAIT_MAX_MS`.
 * @param {import("puppeteer").Page} page
 * @param {{ maxMs: number }} opts
 * @returns {Promise<boolean>} true se deixou de detetar challenge
 */
async function waitForSecurityChallengeResolved(page, { maxMs }) {
  // eslint-disable-next-line no-console
  console.log(
    `[TikTok] Security Check / puzzle detetado. Conclua a verificação na janela do browser; o script espera até ${Math.round(maxMs / 60_000)} min (LOGIN_WAIT_MAX_MS).`
  );
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 2000));
    if (!(await detectTiktokSecurityChallenge(page))) {
      // eslint-disable-next-line no-console
      console.log("[TikTok] Security Check aparentemente concluído; a continuar a coleta.");
      return true;
    }
  }
  // eslint-disable-next-line no-console
  console.warn("[TikTok] Tempo esgotado: Security Check ainda visível (aumente LOGIN_WAIT_MAX_MS se precisar).");
  return false;
}

/**
 * Locale Brasil + timezone + UA (reduz inconsistência headless vs TikTok BR).
 * Chamar **uma vez** por `Page` antes do primeiro `goto`.
 * @param {import("puppeteer").Page} page
 */
async function applyBrazilBrowsingContext(page) {
  if (!brazilBrowsingContextApplied.has(page)) {
    await page.evaluateOnNewDocument(() => {
      try {
        const langs = Object.freeze(["pt-BR", "pt", "en-US", "en"]);
        Object.defineProperty(navigator, "language", {
          get: () => "pt-BR",
          configurable: true,
          enumerable: true
        });
        Object.defineProperty(navigator, "languages", {
          get: () => langs,
          configurable: true,
          enumerable: true
        });
      } catch {
        /* noop — stealth ou CSP */
      }
    });
    brazilBrowsingContextApplied.add(page);
  }
  if (!brazilDomContentSyncAttached.has(page)) {
    page.on("domcontentloaded", () => {
      void syncBrazilEnvToLivePage(page).catch(() => {});
    });
    brazilDomContentSyncAttached.add(page);
  }
  await page.setUserAgent(CHROME_STABLE_USER_AGENT);
  await syncBrazilEnvToLivePage(page);
}

async function launchTikTokBrowser() {
  const fresh = process.env.FRESH_SESSION === "1";
  let userDataDir = process.env.CHROME_USER_DATA?.trim() || null;
  if (!userDataDir && !fresh) {
    userDataDir =
      process.env.PUPPETEER_TIKTOK_PROFILE?.trim() || DEFAULT_CHROME_PROFILE;
    await fs.mkdir(userDataDir, { recursive: true });
  }
  if (userDataDir) {
    // eslint-disable-next-line no-console
    console.log(
      `[Perfil] ${path.resolve(userDataDir)} (cookies nesta pasta. FRESH_SESSION=${fresh ? "1 — não reutiliza o perfil predefinido nesta execução" : "0 — reutiliza o perfil"})`
    );
  }
  const isHeaded = process.env.HEADED === "1";
  /** Navegador visível: em muitos casos evita redirecionamento forçado à página de login (headless). */
  const headless = isHeaded ? false : "new";
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined;
  /** Forçar Chromium embebido (ex.: Docker só com `chromium` Debian). */
  const useBundledChromium = /^1|true|yes$/i.test(String(process.env.PUPPETEER_USE_BUNDLED_CHROMIUM || ""));
  /** `chrome` | `chrome-beta` | `msedge` | … — ver Puppeteer LaunchOptions. */
  const channelEnv = process.env.PUPPETEER_CHANNEL?.trim() || "";
  const launchOpts = {
    headless,
    env: { ...process.env, TZ: BRAZIL_TIMEZONE_ID },
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--lang=pt-BR",
      "--window-size=1600,900",
      "--disable-blink-features=AutomationControlled",
      "--use-fake-ui-for-media-stream",
      "--disable-infobars"
    ],
    defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 }
  };
  if (execPath) {
    launchOpts.executablePath = execPath;
  } else if (!useBundledChromium) {
    // Se for modo login, vamos tentar o Edge para ver se o Google aceita melhor
    const isLoginOnly = process.env.LOGIN_ONLY === "1";
    const channel = isLoginOnly ? "msedge" : (channelEnv || (isHeaded ? "chrome" : ""));
    if (channel) {
      launchOpts.channel = channel;
      // eslint-disable-next-line no-console
      console.log(
        `[scrape] Navegador: channel=${channel} (Chrome/Edge instalado). Headless sem channel usa Chromium embebido. Forçar embebido: PUPPETEER_USE_BUNDLED_CHROMIUM=1. Caminho fixo: PUPPETEER_EXECUTABLE_PATH=...`
      );
    }
  }
  if (userDataDir) {
    launchOpts.userDataDir = userDataDir;
  }
  return puppeteer.launch(launchOpts);
}

/**
 * Fecha abas extra do perfil ao arranque. Em headless, fecha popups (anúncios / ruído).
 * Com `HEADED=1` **não** fecha popups: login TikTok (Google / Apple / Facebook) abre janela OAuth —
 * fechá-la destrói o login e gera `Target closed` no stealth.
 *
 * Opcional: `SCRAPE_ALLOW_LOGIN_POPUPS=1` permite popups também em headless (raro).
 * @param {import("puppeteer").Browser} browser
 * @param {import("puppeteer").Page} page
 */
async function installAntiPopupGuards(browser, page) {
  for (const p of await browser.pages()) {
    if (p !== page) {
      await p.close().catch(() => {});
    }
  }
  const allowLoginPopups =
    process.env.HEADED === "1" || /^true$/i.test(String(process.env.SCRAPE_ALLOW_LOGIN_POPUPS || ""));
  if (allowLoginPopups) {
    // eslint-disable-next-line no-console
    console.log(
      "[scrape] Popups de login OAuth permitidos (HEADED=1 ou SCRAPE_ALLOW_LOGIN_POPUPS=1). Não feche a janela do Google/Facebook à mão até concluir."
    );
    return;
  }
  page.on("popup", (popup) => {
    void popup.close().catch(() => {});
  });
}

/** Palavras-chave anti-bot / bloqueio no HTML (minúsculas). */
const SCRAPE_DIAG_HTML_KEYWORDS = [
  "captcha",
  "verify",
  "verify to continue",
  "unusual traffic",
  "login",
  "challenge",
  "access denied",
  "robot",
  "blocked",
  "security check",
  "drag the puzzle"
];

/** @param {string} html */
function scanHtmlForAntiBotSignals(html) {
  const lc = html.toLowerCase();
  /** @type {string[]} */
  const hits = [];
  for (const w of SCRAPE_DIAG_HTML_KEYWORDS) {
    if (lc.includes(w)) hits.push(w);
  }
  return hits;
}

/**
 * Scroll longo por passos (lazy-load). Não substitui `scrollToLoadGrid`; complementa pós-goto.
 * @param {import("puppeteer").Page} page
 */
async function progressiveScrollPageToBottom(page) {
  const vp = (await page.viewport()) || { width: 1366, height: 800 };
  const step = Math.max(280, Math.floor(vp.height * 0.85));
  let prevY = -1;
  for (let i = 0; i < 90; i++) {
    const metrics = await page.evaluate(() => {
      const el = document.documentElement || document.body;
      return {
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        scrollHeight: el?.scrollHeight ?? 0
      };
    });
    const atBottom = metrics.scrollY + metrics.innerHeight >= metrics.scrollHeight - 6;
    if (atBottom) break;
    await page.evaluate((dy) => window.scrollBy(0, dy), step);
    await new Promise((r) => setTimeout(r, 380 + Math.floor(Math.random() * 320)));
    if (Math.abs(metrics.scrollY - prevY) < 2 && i > 4) break;
    prevY = metrics.scrollY;
  }
}

/**
 * Recarrega com `networkidle2` (headless) + espera extra + scroll longo.
 * Desligar reload: `SCRAPE_POST_GOTO_RELOAD=0`. Forçar também em headed: `SCRAPE_POST_GOTO_RELOAD=1`.
 * @param {import("puppeteer").Page} page
 * @param {boolean} isHeaded
 */
async function postGotoShopStabilize(page, isHeaded) {
  await humanPause(page, 800, 2400);
  const force = process.env.SCRAPE_POST_GOTO_RELOAD === "1";
  const skip = process.env.SCRAPE_POST_GOTO_RELOAD === "0";
  const doReload = force || (!isHeaded && !skip);
  if (doReload) {
    try {
      await page.reload({ waitUntil: "networkidle2", timeout: 120_000 });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[scrape] post-goto reload networkidle2:", e?.message || e);
    }
    await humanPause(page, 900, 2200);
  }
  await new Promise((r) => setTimeout(r, 10_000));
  await progressiveScrollPageToBottom(page);
  await humanPause(page, 500, 1400);
}

/**
 * @param {import("puppeteer").Page} page
 * @param {{ xhrLog: object[], consoleLog: string[], failed: object[] }} b
 */
function attachScrapeDiagnosticConsoleAndFailed(page, b) {
  const consoleCap = 250;
  const failCap = 200;

  page.on("console", (msg) => {
    if (b.consoleLog.length >= consoleCap) return;
    try {
      const t = msg.text();
      b.consoleLog.push(`[${msg.type()}] ${String(t).slice(0, 1800)}`);
    } catch {
      /* noop */
    }
  });

  page.on("requestfailed", (req) => {
    if (b.failed.length >= failCap) return;
    try {
      b.failed.push({
        url: req.url().slice(0, 900),
        error: req.failure()?.errorText ?? null
      });
    } catch {
      /* noop */
    }
  });
}

/**
 * Registar **depois** do `page.on("response")` principal para reduzir corrida em `response.text()`.
 * @param {import("puppeteer").Page} page
 * @param {{ xhrLog: object[], consoleLog: string[], failed: object[] }} b
 */
function attachScrapeDiagnosticXhrResponse(page, b) {
  const xhrCap = 1200;

  page.on("response", (response) => {
    void (async () => {
      let rt = "";
      try {
        rt = response.request()?.resourceType() || "";
      } catch {
        return;
      }
      if (rt !== "xhr" && rt !== "fetch") return;
      if (b.xhrLog.length >= xhrCap) return;
      const url = response.url();
      let status = 0;
      let ct = "";
      try {
        status = response.status();
        ct = (response.headers()["content-type"] || "-").split(";")[0].trim();
      } catch {
        return;
      }
      const clRaw = response.headers()["content-length"];
      const cl = clRaw ? Number(clRaw) : NaN;
      /** @type {string[] | null} */
      let jsonTopKeys = null;
      let bodyBytes = Number.isFinite(cl) ? cl : null;
      const maybeJson =
        /json|javascript/.test(ct.toLowerCase()) || /\.json(\?|$)/i.test(url.split("?")[0] || "");
      const safePeek = Number.isFinite(cl) && cl > 0 && cl <= 280_000;
      if (maybeJson && safePeek) {
        try {
          const txt = await response.text();
          bodyBytes = txt.length;
          const j = JSON.parse(txt);
          jsonTopKeys = Array.isArray(j)
            ? [`[array length ${j.length}]`]
            : Object.keys(j).slice(0, 24);
        } catch {
          jsonTopKeys = ["_body_unreadable_or_consumed"];
        }
      } else if (maybeJson && !Number.isFinite(cl)) {
        try {
          const txt = await response.text();
          bodyBytes = txt.length;
          const slice = txt.slice(0, 1_200_000);
          const j = JSON.parse(slice);
          jsonTopKeys = Array.isArray(j)
            ? [`[array length ${j.length}]`]
            : Object.keys(j).slice(0, 24);
        } catch {
          jsonTopKeys = null;
        }
      }
      b.xhrLog.push({
        t: new Date().toISOString(),
        url: url.slice(0, 900),
        status,
        contentType: ct,
        bodyBytes,
        jsonTopKeys
      });
    })();
  });
}

/**
 * Escreve ficheiros de diagnóstico em `OUT_AUX` (ex.: `output/categorias/.../extra/`).
 * @param {import("puppeteer").Page} page
 * @param {string} outAux
 * @param {{ xhrLog: object[], consoleLog: string[], failed: object[] }} buckets
 * @param {{ finalUrl: string, startUrl: string, status: string }} meta
 * @returns {Promise<object>}
 */
async function writeScrapeDiagnosticsToExtra(page, outAux, buckets, meta) {
  await ensureOutAuxDir();
  const png1 = path.join(outAux, "final_page.png");
  const png2 = path.join(outAux, "final_page_after_scroll.png");
  const htmlPath = path.join(outAux, "final_page.html");
  const bodyTxtPath = path.join(outAux, "body_text.txt");
  const titlePath = path.join(outAux, "page_title.txt");
  const xhrPath = path.join(outAux, "xhr_debug.json");
  const envPath = path.join(outAux, "browser_env.json");

  const assisted = isAssistedModeEnabled();
  if (!assisted) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: png1, fullPage: true }).catch(() => {});
    await progressiveScrollPageToBottom(page);
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: png2, fullPage: true }).catch(() => {});
  } else {
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: png1, fullPage: true }).catch(() => {});
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: png2, fullPage: true }).catch(() => {});
  }

  const html = await page.content();
  await fs.writeFile(htmlPath, html, "utf8");
  const bodyText = await page.evaluate(() => {
    try {
      return document.body?.innerText ?? "";
    } catch {
      return "";
    }
  });
  await fs.writeFile(bodyTxtPath, bodyText.slice(0, 1_200_000), "utf8");
  const title = await page.title();
  await fs.writeFile(titlePath, `${title}\n`, "utf8");

  await syncBrazilEnvToLivePage(page);

  const browserEnv = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    webdriver: navigator.webdriver,
    language: navigator.language,
    languages: navigator.languages ? [...navigator.languages] : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    platform: navigator.platform
  }));
  const browserEnvOut = {
    ...browserEnv,
    accept_language_header: TIKTOK_ACCEPT_LANGUAGE,
    timezone_id: BRAZIL_TIMEZONE_ID
  };
  await fs.writeFile(envPath, JSON.stringify(browserEnvOut, null, 2), "utf8");

  const keywordHits = scanHtmlForAntiBotSignals(html);
  const selectors = [
    "script#__MODERN_ROUTER_DATA__",
    "#__MODERN_ROUTER_DATA__",
    "a[href*=\"/product/\"]",
    "[data-e2e]",
    "div[data-index]"
  ];
  /** @type {object[]} */
  const selectorWait = [];
  for (const sel of selectors) {
    try {
      const h = await page.waitForSelector(sel, { timeout: 4500 });
      selectorWait.push({ selector: sel, found: !!h, error: null });
    } catch (e) {
      selectorWait.push({
        selector: sel,
        found: false,
        error: e?.message ? String(e.message) : String(e)
      });
    }
  }

  await fs.writeFile(xhrPath, JSON.stringify(buckets.xhrLog, null, 2), "utf8");
  await fs.writeFile(
    path.join(outAux, "console_debug.txt"),
    buckets.consoleLog.join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(outAux, "request_failed.json"),
    JSON.stringify(buckets.failed, null, 2),
    "utf8"
  );

  return {
    coletado_em: new Date().toISOString(),
    final_url: meta.finalUrl,
    start_url: meta.startUrl,
    status: meta.status,
    keyword_hits: keywordHits,
    selector_wait: selectorWait,
    browser_env: browserEnvOut,
    xhr_entries: buckets.xhrLog.length,
    console_lines: buckets.consoleLog.length,
    request_failed: buckets.failed.length,
    files: {
      final_page_png: png1,
      final_page_after_scroll_png: png2,
      final_page_html: htmlPath,
      body_text: bodyTxtPath,
      page_title: titlePath,
      xhr_debug: xhrPath,
      browser_env: envPath,
      console_debug: path.join(outAux, "console_debug.txt"),
      request_failed: path.join(outAux, "request_failed.json")
    }
  };
}

/**
 * Uma categoria: rede + scroll + escrita em `OUTPUT_DIR` (definir `initOutputPaths` antes).
 * @param {import("puppeteer").Browser} browser
 * @param {import("puppeteer").Page} page
 * @param {string} startUrl
 * @returns {Promise<number>} 0 ok · 1 sem produtos (`no_products`) · 2 `TIKTOK_SECURITY_CHECK`
 */
async function runCategoryHarvest(browser, page, startUrl, opts = {}) {
  const pdpGalleryEnv =
    process.env.PDP_GALLERY === "1" || /^true$/i.test(String(process.env.PDP_GALLERY || ""));
  await ensureOutAuxDir();
  const outFile = path.join(OUT_AUX, "teste_categoria.json");
  const debugFile = path.join(OUT_AUX, "debug_responses.log");
  const skipGoto = opts && opts.skipGoto === true;
  const passive = opts && opts.passive === true;
  const isHeaded = process.env.HEADED === "1";
  const loginWaitMaxMs = Math.max(60_000, Number(process.env.LOGIN_WAIT_MAX_MS) || 15 * 60_000);

  /** chave = product_id; dedupe: mantém a linha mais "rica" (preço, imagens) */
  const byProductId = new Map();
  setSellerDebugMode(true);
  sellerDebugSamples.length = 0;
  const debugLines = [];
  const diagBuckets = { xhrLog: [], consoleLog: [], failed: [] };
  attachScrapeDiagnosticConsoleAndFailed(page, diagBuckets);

  const netLogFile = path.join(OUT_AUX, "rede_ultima_execucao.log");
  if (netLog) {
    await ensureOutAuxDir();
    await fs.writeFile(netLogFile, `inicio ${new Date().toISOString()}\n${"=".repeat(80)}\n`, "utf8");
    // eslint-disable-next-line no-console
    console.log(
      `[net] Tráfego na consola e em: ${netLogFile} | Desligar: NET_LOG=0 | Só tudo (incl. imagens): NET_LOG=verbose`
    );
  }

  const huntXhrSeen = new Set();
  if (huntLog) {
    await ensureOutAuxDir();
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
    "Accept-Language": TIKTOK_ACCEPT_LANGUAGE
  });
  await applyBrazilBrowsingContext(page);

  let jsonPeeksTried = 0;
  let jsonSnapshotN = 0;
  const doJsonSnapshot = process.env.JSON_SNAPSHOT === "1";
  const isDiscover = process.env.DISCOVER === "1";
  const discoverPath = path.join(OUT_AUX, "descoberta_redes.jsonl");
  const discoverMax = 400;
  let discoverCount = 0;

  if (isDiscover) {
    await ensureOutAuxDir();
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
          const dir = path.join(OUT_AUX, "debug_snapshots");
          try {
            await ensureOutAuxDir();
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

  attachScrapeDiagnosticXhrResponse(page, diagBuckets);

  let finalUrl = startUrl;
  let status = "ok";
  let note = null;
  /** @type {string | null} */
  let failureCode = null;

  let reloadedCategoryAfterLogin = false;

  if (!skipGoto) {
    console.log(`[scrape] Abrindo diretamente no TikTok Shop: ${startUrl}`);
    await page.goto(startUrl, { waitUntil: "networkidle2", timeout: 120_000 });
    await humanPause(page, 2000, 4000);
    await syncBrazilEnvToLivePage(page);
    finalUrl = page.url();
  } else {
    console.log(`[scrape] ASSISTED_MODE: usando página atual (sem page.goto). startUrl=${startUrl}`);
    await syncBrazilEnvToLivePage(page);
    finalUrl = page.url();
  }

  if (!skipGoto && !isShopTiktokHostname(finalUrl) && isHeaded) {
    console.log("[TikTok] Não estamos no Shop. Aguardando login manual ou redirecionamento...");
    const w = await waitForShopOrTimeout(browser, page, { maxMs: loginWaitMaxMs, startUrl });
    finalUrl = w.url;
    if (w.ok) {
      reloadedCategoryAfterLogin = true;
      if (!w.navigatedInsideWait) {
        await page.goto(startUrl, { waitUntil: "networkidle2", timeout: 120_000 });
      }
      await humanPause(page, 2000, 4000);
      await syncBrazilEnvToLivePage(page);
      finalUrl = page.url();
    } else {
      // TRAVA DE SEGURANÇA: Se não logou, não tenta coletar e não fecha sozinho rápido.
      console.error("[TikTok] Erro: Login não detectado a tempo. Mantendo janela aberta por 1 minuto para inspeção...");
      await new Promise(r => setTimeout(r, 60000));
      return { status: "not_logged_in" };
    }
  }

    if (!isShopTiktokHostname(finalUrl)) {
      status = "not_shop";
      note = isHeaded
        ? `Ainda fora de shop.tiktok.com após ${Math.round(loginWaitMaxMs / 60_000)} min. Aumente LOGIN_WAIT_MAX_MS ou conclua o login a tempo. Perfil: CHROME_USER_DATA=...`
        : "A sessão caiu fora de shop.tiktok.com. Use HEADED=1, faça o login; na próxima execução o login deve persistir no perfil `.puppeteer-profile/tiktok-shop` (ou `CHROME_USER_DATA`).";
      await ensureOutAuxDir();
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
      let securityChallenge = await detectTiktokSecurityChallenge(page);
      if (!securityChallenge) {
        if (!passive) {
          await postGotoShopStabilize(page, isHeaded);
        } else {
          await humanPause(page, 800, 1600);
        }
        securityChallenge = await detectTiktokSecurityChallenge(page);
      }
      if (securityChallenge && isHeaded) {
        await waitForSecurityChallengeResolved(page, { maxMs: loginWaitMaxMs });
        securityChallenge = await detectTiktokSecurityChallenge(page);
        if (!securityChallenge) {
          if (!passive) {
            await postGotoShopStabilize(page, isHeaded);
          } else {
            await humanPause(page, 800, 1600);
          }
          securityChallenge = await detectTiktokSecurityChallenge(page);
        }
      }
      if (securityChallenge) {
        status = "tiktok_security_check";
        failureCode = "TIKTOK_SECURITY_CHECK";
        note =
          "TIKTOK_SECURITY_CHECK: TikTok exibiu Security Check / puzzle (anti-bot). Com HEADED=1 o script esperou LOGIN_WAIT_MAX_MS; ainda visível ou IP bloqueado. Tente resolver na janela antes do timeout, outra rede, ou aguardar.";
        // eslint-disable-next-line no-console
        console.warn(`[scrape] ${note}`);
      } else {
      const diagEarly =
        process.env.SCRAPE_DIAGNOSTIC === "1" || /^true$/i.test(String(process.env.SCRAPE_DIAGNOSTIC || ""));
      if (diagEarly) {
        try {
          const snap = await writeScrapeDiagnosticsToExtra(page, OUT_AUX, diagBuckets, {
            finalUrl: page.url(),
            startUrl,
            status: "post_goto_diagnostic"
          });
          await fs.writeFile(
            path.join(OUT_AUX, "post_goto_diagnostic.json"),
            JSON.stringify(snap, null, 2),
            "utf8"
          );
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[scrape] SCRAPE_DIAGNOSTIC escrita intermédia:", e?.message || e);
        }
      }

      if (!passive) {
        if (reloadedCategoryAfterLogin) {
          await humanPause(page, 500, 1000);
        } else {
          await humanPause(page, 750, 1500);
        }
        await gentleMouseJiggle(page);
        await scrollToLoadGrid(page);
        await humanPause(page, 1000, 2000);
        await clickViewMoreWhileNeeded(page, () => byProductId.size);
      } else {
        await humanPause(page, 1000, 1800);
      }
      // Handlers `response` são assíncronos: drena até o mapa estabilizar (teto ~5s como antes)
      await waitForStableProductFeed(() => byProductId.size);

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
        await ensureOutAuxDir();
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
        await ensureOutAuxDir();
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

      if (pdpGalleryEnv && byProductId.size > 0) {
        const pdpMax = Math.min(500, Math.max(0, Number(process.env.PDP_GALLERY_MAX) || 25));
        // eslint-disable-next-line no-console
        console.log(
          `[pdp_gallery] A abrir PDPs (máx ${pdpMax} produtos) para fotos + preço hero (DOM) — desligar: omitir PDP_GALLERY`
        );
        const pr = await enrichByProductIdWithPdpGallery(browser, page, byProductId, {
          max: pdpMax,
          categoriaUrl: startUrl,
          debugLines: debug ? debugLines : undefined
        });
        // eslint-disable-next-line no-console
        console.log(
          `[pdp_gallery] Concluído: ${pr.visited} visita(s) (elegíveis com /pdp/: ${pr.eligible}, teto ${pr.max}).`
        );
      }
      }
    }

  let exitCode = 0;
  /** @type {object | null} */
  let diagnostic = null;

  try {
    const nowUrl = page.url();
    if (nowUrl && nowUrl !== finalUrl) {
      finalUrl = nowUrl;
    }
  } catch {
    /* noop */
  }

  if (!isShopTiktokHostname(finalUrl)) {
    status = "not_shop";
    note =
      "A sessão saiu de shop.tiktok.com durante a coleta (possível redirecionamento para login). Reabra o Shop, conclua login/puzzle e tente novamente.";
    exitCode = 1;
    try {
      diagnostic = await writeScrapeDiagnosticsToExtra(page, OUT_AUX, diagBuckets, {
        finalUrl,
        startUrl,
        status: "not_shop"
      });
    } catch (e) {
      diagnostic = { erro_escrita_diagnostico: String(e?.message || e) };
    }
  }

  if (exitCode === 0 && failureCode === "TIKTOK_SECURITY_CHECK") {
    exitCode = 2;
    try {
      diagnostic = await writeScrapeDiagnosticsToExtra(page, OUT_AUX, diagBuckets, {
        finalUrl,
        startUrl,
        status: "tiktok_security_check"
      });
      let mr = null;
      try {
        mr = await getModernRouterDataFromPage(page);
      } catch {
        mr = null;
      }
      await fs.writeFile(
        path.join(OUT_AUX, "empty_harvest_diagnostic.json"),
        JSON.stringify(
          {
            ...diagnostic,
            failure_code: "TIKTOK_SECURITY_CHECK",
            has_modern_router_json: mr != null,
            modern_router_peek_file: MODERN_ROUTER_PEEK
          },
          null,
          2
        ),
        "utf8"
      );
    } catch (e) {
      diagnostic = { erro_escrita_diagnostico: String(e?.message || e), failure_code: "TIKTOK_SECURITY_CHECK" };
    }
  } else if (exitCode === 0 && byProductId.size === 0 && status === "ok") {
    status = "no_products";
    note =
      "Nenhum produto (XHR + loader). Campo `diagnostic` + ficheiros em extra/ (final_page*.png, final_page.html, xhr_debug.json, browser_env.json, empty_harvest_diagnostic.json). Processo termina com código 1.";
    try {
      diagnostic = await writeScrapeDiagnosticsToExtra(page, OUT_AUX, diagBuckets, {
        finalUrl,
        startUrl,
        status: "no_products"
      });
      let mr = null;
      try {
        mr = await getModernRouterDataFromPage(page);
      } catch {
        mr = null;
      }
      await fs.writeFile(
        path.join(OUT_AUX, "empty_harvest_diagnostic.json"),
        JSON.stringify(
          {
            ...diagnostic,
            has_modern_router_json: mr != null,
            modern_router_peek_file: MODERN_ROUTER_PEEK
          },
          null,
          2
        ),
        "utf8"
      );
    } catch (e) {
      diagnostic = { erro_escrita_diagnostico: String(e?.message || e) };
    }
    exitCode = 1;
  }

  const productLimitRaw = process.env.PRODUCT_LIMIT;
  const productLimit =
    productLimitRaw != null && String(productLimitRaw).trim() !== "" ? Math.floor(Number(productLimitRaw)) : 0;
  if (productLimit > 0 && byProductId.size > productLimit) {
    const limited = [...byProductId.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, productLimit);
    byProductId.clear();
    for (const [k, v] of limited) {
      byProductId.set(k, v);
    }
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
    failure_code: failureCode,
    collected_at: new Date().toISOString(),
    count: byProductId.size,
    products,
    diagnostic
  };

  await ensureOutAuxDir();
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  const itensDados = [...byProductId.values()]
    .map((n) => toDadosProdutoClean(n, startUrl))
    .sort((a, b) => String(a.product_id ?? "").localeCompare(String(b.product_id ?? "")));
  const dadosPayload = {
    coletado_em: new Date().toISOString(),
    categoria_url: startUrl,
    final_url: finalUrl,
    status,
    failure_code: failureCode,
    total: itensDados.length,
    filtro: pdpGalleryEnv
      ? "XHR/JSON (categoria) + #__MODERN_ROUTER_DATA__ + PDP_GALLERY (fotos + preço hero no DOM em .../pdp/...)"
      : "XHR/JSON (item_list, etc.) + JSON embebido #__MODERN_ROUTER_DATA__ (loaderData da categoria)",
    itens: itensDados,
    diagnostic
  };
  await fs.writeFile(DADOS_OUT, JSON.stringify(dadosPayload, null, 2), "utf8");

  const lojasMap = buildLojasMapBySeller(byProductId);
  const lojasArr = [...lojasMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => lojaToRowFields(v));
  await fs.writeFile(
    DADOS_LOJAS_OUT,
    JSON.stringify(
      {
        coletado_em: new Date().toISOString(),
        total: lojasArr.length,
        lojas: lojasArr
      },
      null,
      2
    ),
    "utf8"
  );
  await ensureOutAuxDir();
  await fs.writeFile(
    DEBUG_SELLER_SOURCES,
    JSON.stringify(
      {
        coletado_em: new Date().toISOString(),
        max_samples: 20,
        amostras_coletadas: sellerDebugSamples.length,
        amostras: sellerDebugSamples
      },
      null,
      2
    ),
    "utf8"
  );
  setSellerDebugMode(false);

  if (debug) {
    await ensureOutAuxDir();
    const head = `final_url=${finalUrl}\njson_peeks≈${jsonPeeksTried}\n`;
    const body = debugLines.length
      ? debugLines.join("\n")
      : "(nenhum HIT com produtos; confira se final_url é shop.tiktok.com e cookies/login)";
    await fs.writeFile(debugFile, head + body, "utf8");
  }

  // eslint-disable-next-line no-console
  console.log(
    `[categoria] Produtos recolhidos nesta categoria: ${byProductId.size} (únicos por product_id, status=${status})`
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        out: outFile,
        dados_produtos: DADOS_OUT,
        dados_lojas: DADOS_LOJAS_OUT,
        debug_seller_sources: DEBUG_SELLER_SOURCES,
        count: byProductId.size,
        debug: debug ? debugFile : null,
        caca_dados: huntLog ? CACA_DADOS_JSONL : null,
        caca_xhr_fetch: huntLog ? CACA_XHR_FILE : null,
        modern_router_peek: MODERN_ROUTER_PEEK,
        exit_code: exitCode
      },
      null,
      2
    )
  );

  return exitCode;
}

/**
 * Duas+ categorias no mesmo processo Chrome (sem fechar o browser entre elas). Nova `Page` por categoria
 * para evitar listeners duplicados. `runs[]`: `{ OUTPUT_DIR, CATEGORY_URL, label? }`.
 * @param {Array<{ OUTPUT_DIR: string, CATEGORY_URL: string, label?: string }>} runs
 * @param {{ pauseMs?: number, onCategoryComplete?: (url: string, code: number, index: number, total: number) => Promise<void> }} [opts]
 */
export async function scrapeCategoriesSequentialSharedBrowser(runs, opts = {}) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("scrapeCategoriesSequentialSharedBrowser: runs[] vazio");
  }
  const { pauseMs, onCategoryComplete } = opts;
  const defaultPause = Number(process.env.PAUSE_BETWEEN_CATEGORIES_MS);
  const browser = await launchTikTokBrowser();
  let exitCode = 0;
  try {
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const label = r.label || r.CATEGORY_URL;
      process.env.OUTPUT_DIR = r.OUTPUT_DIR;
      initOutputPaths();
      // eslint-disable-next-line no-console
      console.log(`\n--- [${i + 1}/${runs.length}] ${label} ---\nOUTPUT_DIR=${r.OUTPUT_DIR}\nCATEGORY_URL=${r.CATEGORY_URL}\n`);
      const page = await browser.newPage();
      await installAntiPopupGuards(browser, page);
      const code = await runCategoryHarvest(browser, page, r.CATEGORY_URL);
      exitCode = Math.max(exitCode, code);
      await page.close().catch(() => {});
      if (onCategoryComplete) {
        await onCategoryComplete(r.CATEGORY_URL, code, i + 1, runs.length).catch(() => {});
      }
      if (i < runs.length - 1) {
        const delay =
          pauseMs != null ? pauseMs :
          Number.isFinite(defaultPause) && defaultPause >= 0 ? defaultPause :
          10_000 + Math.random() * 5_000;
        // eslint-disable-next-line no-console
        console.log(`[scrape] aguardando ${Math.round(delay / 1000)}s antes da próxima categoria...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  } finally {
    await browser.close();
  }
  return exitCode;
}

function isAssistedModeEnabled() {
  const v = String(process.env.ASSISTED_MODE || "").trim();
  return v === "1" || /^true$/i.test(v);
}

function isBrazilCategoryUrl(urlStr) {
  try {
    const u = new URL(String(urlStr));
    if (u.hostname.toLowerCase() !== "shop.tiktok.com") return false;
    return /\/br\/c\/[^/]+/i.test(u.pathname);
  } catch {
    return false;
  }
}

async function waitForEnter(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error("stdin não é TTY (sem ENTER). Rode este modo num terminal.");
  }
  process.stdout.write(prompt);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  await new Promise((resolve) => {
    const onData = (chunk) => {
      if (String(chunk).includes("\n")) {
        process.stdin.off("data", onData);
        resolve();
      }
    };
    process.stdin.on("data", onData);
  });
}

async function assistedWaitForCategoryUrl(page) {
  while (true) {
    console.log(
      '[ASSISTED_MODE] Resolva login/security check manualmente e navegue até uma categoria /br/c/... Depois pressione ENTER aqui para começar a coleta.'
    );
    await waitForEnter("> ");
    const currentUrl = page.url();
    console.log(`[ASSISTED_MODE] URL após navegação manual: ${currentUrl}`);

    const isShop = isShopTiktokHostname(currentUrl);
    const isCategory = isBrazilCategoryUrl(currentUrl);
    const hasSecurity = isShop ? await detectTiktokSecurityChallenge(page) : false;

    const status = hasSecurity ? "security_check" : isCategory ? "category_page" : isShop ? "logged_in" : "not_shop";
    console.log(`[ASSISTED_MODE] status=${status}`);

    if (hasSecurity) {
      console.error(
        "[ASSISTED_MODE] Security Check ainda ativo. Conclua no browser e pressione ENTER novamente."
      );
      continue;
    }
    if (!isCategory) {
      console.error(
        "[ASSISTED_MODE] A URL atual não parece ser uma categoria TikTok Shop. Navegue até uma URL /br/c/... e pressione ENTER novamente."
      );
      continue;
    }
    return currentUrl;
  }
}

async function main() {
  initOutputPaths();
  const startUrl = process.env.CATEGORY_URL || DEFAULT_URL;
  const assistedMode = isAssistedModeEnabled();
  const keepBrowserOpen = String(process.env.KEEP_BROWSER_OPEN || "").trim() === "1";
  const assistedStartUrl = "https://shop.tiktok.com/br/c";
  if (assistedMode && process.env.HEADED !== "1") {
    console.error("[ASSISTED_MODE] Requer HEADED=1 (janela visível).");
    return 1;
  }
  const browser = await launchTikTokBrowser();
  const page = await browser.newPage();
  
  if (!assistedMode) {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
  }

  if (!assistedMode) {
    console.log("[scrape] Aquecendo navegador no Google...");
    await page.goto("https://www.google.com", { waitUntil: "networkidle2" });
  }
  
  if (process.env.LOGIN_ONLY === "1") {
    console.log("\n[LOGIN MODE] Navegador aberto no Google.");
    console.log("1. Faça login no Google e no TikTok Shop nesta janela.");
    console.log("2. Verifique se o login foi concluído com sucesso.");
    console.log("3. FECHE o navegador manualmente quando terminar para salvar a sessão.\n");
    
    // Aguarda o navegador ser fechado manualmente
    await new Promise((resolve) => {
      browser.on("disconnected", resolve);
    });
    return 0;
  }

  await new Promise(r => setTimeout(r, 2000));

  await installAntiPopupGuards(browser, page);
  try {
    if (assistedMode) {
      console.log(`[ASSISTED_MODE] URL inicial: ${assistedStartUrl}`);
      await page.goto(assistedStartUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
      const catUrl = await assistedWaitForCategoryUrl(page);
      return await runCategoryHarvest(browser, page, catUrl, { skipGoto: true, passive: true });
    }
    return await runCategoryHarvest(browser, page, startUrl);
  } finally {
    if (keepBrowserOpen) {
      await new Promise((resolve) => {
        browser.on("disconnected", resolve);
      });
    } else {
      await browser.close();
    }
  }
}

function isRunAsCli() {
  try {
    if (!process.argv[1]) {
      return false;
    }
    return path.resolve(process.argv[1]) === path.resolve(__filename);
  } catch {
    return false;
  }
}

if (isRunAsCli()) {
  main()
    .then((code) => {
      process.exit(typeof code === "number" ? code : 0);
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    });
}


/* Regressão: `npm test` importa estas funções de scrapeCategory.mjs — não renomear. */
export {
  coalesceProductRatings,
  extractProductRatings,
  parseRateInfoObject,
  parseBrlishMoneyString,
  parseDiscountPercentFromPpi,
  pickPriceFromFormatStrings,
  combinePdpHeroPriceParts,
  applyPdpDomPrices
} from "./scrape/price-parser.mjs";
export {
  dedupeImageUrlsByAssetId,
  dedupeImageUrlsByPathname,
  dedupePdpImageUrls
} from "./scrape/image-utils.mjs";
export {
  mergeLojaFromNormalized,
  mergeProductById,
  mergeProductLayers,
  normalizeItem,
  normalizeSellerInfo,
  isReviewOnlyProductNode,
  productRowRichness,
  toDadosProdutoClean
} from "./scrape/normalizer.mjs";
export { launchTikTokBrowser, installAntiPopupGuards };
