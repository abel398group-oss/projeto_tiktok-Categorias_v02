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

puppeteer.use(StealthPlugin());

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
let recordSellerDebug = false;
const sellerDebugSamples = [];

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

/**
 * Export p/ `dados_produtos.json` (`itens[]`).
 * - Campos de produto: categoria, link, product_id, nome, preco/moeda, preco_original (só com desconto
 *   confiável), `tem_desconto`, preco_estimado_vitrine, preco_gap_estimado, preco_gap_estimado_percent
 *   (opcionais; estimados preenchidos com desconto confiável), vendas, fotos, fotos_pdp, bloco de avaliação.
 * - Campos de loja (cópia no item; desnormalizados; chave = `seller_id`):
 *   `seller_id`, `global_seller_id`, `nome_loja`, `loja_*`, `loja_logo_*`.
 * Não remove campos; contrato de ficheiro estável — ver `docs/ARCHITECTURE.md`.
 * @param {object} n linha normalizada (saída de `normalizeItem` + merge de loja)
 */
function toDadosProdutoClean(n, categoriaUrl) {
  const pdp = Array.isArray(n.images_pdp) && n.images_pdp.length ? n.images_pdp : null;
  let fotos = null;
  if (Array.isArray(n.images) && n.images.length) {
    if (pdp) {
      fotos = subtractFotosOverlappingPdp(n.images, pdp);
      /* Regressão: se toda a grelha coincide com assets já em fotos_pdp, subtract devolve null.
       * `import-output-to-db` mapeia `fotos` → coluna `images`; manter sempre as URLs da grelha
       * deduplicadas para não ficar BD/UI sem thumbnails. */
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
    vendas_texto: n.sales_display,
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

/** Média 0–5 a partir de número ou string "4,5". */
function pickScore0to5(...vals) {
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

/**
 * Bloco `rate_info` do cartão OEC (média, total, histograma por estrela). Estrutura varia entre feeds.
 * @param {object | undefined} ri
 * @returns {{ review_avg: number | null, review_count_total: number | null, review_star_votes: Record<number, number> | null }}
 */
function parseRateInfoObject(ri) {
  const empty = { review_avg: null, review_count_total: null, review_star_votes: null };
  if (!ri || typeof ri !== "object" || Array.isArray(ri)) {
    return empty;
  }
  const review_avg = pickScore0to5(
    ri.score,
    ri.avg_score,
    ri.average_score,
    ri.product_score,
    ri.star,
    ri.rate
  );
  const review_count_total = pickNumber(
    ri.review_count,
    ri.review_num,
    ri.total_count,
    ri.total_review_count,
    ri.global_review_count,
    ri.rating_count,
    ri.count,
    ri.total
  );
  const starFromFields = () => {
    const out = {};
    const set = (star, ...keys) => {
      const v = pickNumber(...keys.map((k) => ri[k]));
      if (v != null && v >= 0) {
        out[star] = Math.round(v);
      }
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
      ri.review_star_level,
      ri.review_start_level,
      ri.star_level_list,
      ri.star_reviews,
      ri.rate_level_list,
      ri.score_detail,
      ri.scores
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
      if (Object.keys(out).length) {
        return out;
      }
    }
    return null;
  };
  const review_star_votes = starFromFields() || starFromArrays();
  if (review_avg == null && review_count_total == null && !review_star_votes) {
    return empty;
  }
  return { review_avg, review_count_total, review_star_votes };
}

/**
 * Junta histogramas por estrela (mesmo `product_id` vindo de respostas diferentes).
 * @param {Record<number, number> | null | undefined} a
 * @param {Record<number, number> | null | undefined} b
 */
function mergeStarVotes(a, b) {
  if (!a && !b) {
    return null;
  }
  const out = {};
  for (const k of [1, 2, 3, 4, 5]) {
    const v = (a && (a[k] ?? a[String(k)])) ?? (b && (b[k] ?? b[String(k)]));
    if (v != null && !Number.isNaN(Number(v))) {
      out[k] = Math.round(Number(v));
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {object | null | undefined} a
 * @param {object | null | undefined} b
 */
function coalesceProductRatings(a, b) {
  if (!a && !b) {
    return { review_avg: null, review_count_total: null, review_star_votes: null };
  }
  return {
    review_avg: (a && a.review_avg) ?? (b && b.review_avg) ?? null,
    review_count_total: (a && a.review_count_total) ?? (b && b.review_count_total) ?? null,
    review_star_votes: mergeStarVotes(
      a && a.review_star_votes,
      b && b.review_star_votes
    )
  };
}

/**
 * Lê o primeiro bloco útil entre `rate_info`, `review_rate_info`, etc.
 * @param {object} raw — tipicamente após `mergeProductLayers`
 */
function extractProductRatings(raw) {
  const empty = { review_avg: null, review_count_total: null, review_star_votes: null };
  if (!raw || typeof raw !== "object") {
    return empty;
  }
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
  // BR sem "R$": "59,90" vindo só do API (evita cair em ppi.price errado)
  const bare = t.match(/^(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})$/);
  if (bare) {
    const g = bare[1];
    const n = parseFloat(g.replace(/\./g, "").replace(",", "."));
    if (!Number.isNaN(n) && n > 0 && n < 1_000_000) {
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
  // Ordem: vitrine (`format_price` / `show_price`) antes de `sale_format_price`. `selling_price` fica
  // depois (por vezes espelha variante, não a linha principal do card).
  const keys = [
    p.format_price,
    p.show_price,
    p.sale_format_price,
    p.sale_price_format,
    p.selling_price,
    p.list_format_price
  ];
  for (const v of keys) {
    const n = parseBrlishMoneyString(v);
    if (n != null) {
      return n;
    }
  }
  return null;
}

/**
 * Sinal de desconto no feed: badge %, `discount` numérico, `discount_decimal` — o reconcile não
 * força o riscado para `preco` quando o feed declara venda.
 */
function ppiHasDiscountSignal(ppi) {
  if (!ppi || typeof ppi !== "object") {
    return false;
  }
  if (parseDiscountPercentFromPpi(ppi) != null) {
    return true;
  }
  const df = ppi.discount_format;
  if (df != null && String(df).trim() !== "" && /%/.test(String(df))) {
    return true;
  }
  if (typeof ppi.discount === "number" && ppi.discount > 0) {
    return true;
  }
  if (typeof ppi.discount_decimal === "number" && ppi.discount_decimal > 0) {
    return true;
  }
  return false;
}

/**
 * Preço do `default_sku` na `sku_list` — alinha com a variante do hero quando `price` vem noutro SKU.
 */
function priceFromDefaultSku(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.sku_list)) {
    return null;
  }
  const sid = pickString(raw.default_sku_id, raw.default_sku, raw.sku_id);
  if (sid == null) {
    return null;
  }
  for (const s of raw.sku_list) {
    if (!s || typeof s !== "object") {
      continue;
    }
    const id = s.sku_id ?? s.id ?? s.skuId;
    if (id != null && String(sid) === String(id)) {
      return pickNumber(
        s.sale_price,
        s.price,
        s.sale_price_decimal,
        s.sku_sale_price,
        s.purchase_price
      );
    }
  }
  return null;
}

/**
 * Sem badge de desconto, o feed muitas vezes mete o piso em `price` e o "de" em `origin_price` (a vitrine
 * mostra o de).
 */
function reconcileVitrineNoDiscount(price, originalPrice, ppi, minPrice, fromFormatStrUsed) {
  if (fromFormatStrUsed) {
    return price;
  }
  if (price == null || originalPrice == null) {
    return price;
  }
  if (Number(originalPrice) <= Number(price) + 0.0001) {
    return price;
  }
  if (ppiHasDiscountSignal(ppi)) {
    return price;
  }
  const p = Number(price);
  const pMin = minPrice != null && !Number.isNaN(Number(minPrice)) ? Number(minPrice) : null;
  if (pMin != null && Math.abs(p - pMin) < 0.0001) {
    return Number(originalPrice);
  }
  return price;
}

/**
 * Com badge e "de" no feed, o número em `price` muitas vezes é piso/variante/cupom, não a linha principal
 * do card. O valor mostrado alinha-se em geral a `origin × (1 - d/100)`.
 * - Muito abaixo de `exp` → piso/variante barata.
 * - Muito acima de `exp` → cifra antiga ou outro alvo.
 * Não aplica se já houver `format_price` (`fromFormatUsed`).
 * @param {boolean} [fromFormatUsed]
 */
function alignPriceToStatedPercent(price, originalPrice, ppi, minPrice, fromFormatUsed) {
  if (fromFormatUsed) {
    return price;
  }
  if (price == null || originalPrice == null) {
    return price;
  }
  if (!ppi || typeof ppi !== "object") {
    return price;
  }
  if (!ppiHasDiscountSignal(ppi)) {
    return price;
  }
  const d = parseDiscountPercentFromPpi(ppi);
  if (d == null || d <= 0 || d >= 100) {
    return price;
  }
  const o = Number(originalPrice);
  const p = Number(price);
  if (o <= 0) {
    return price;
  }
  const exp = Math.round(o * (1 - d / 100) * 100) / 100;
  // Piso/variante: feed << preço "de"×(1-%)
  if (p < exp * 0.92) {
    return exp;
  }
  // Cifra acima do anunciado (ex.: 18,90 vs -50% com "de" 29,90 → ~15)
  if (p > exp * 1.1) {
    return exp;
  }
  if (p >= exp - 0.0001) {
    return price;
  }
  const m = minPrice != null && !Number.isNaN(Number(minPrice)) ? Number(minPrice) : null;
  const onMin = m != null && Math.abs(p - m) < 0.01;
  if (onMin) {
    return exp;
  }
  if (m == null && p < o * 0.5 && p < exp - 1) {
    return exp;
  }
  return price;
}

/**
 * Estimativa experimental (vitrine): `original × (1 - d/100)` com d de `parseDiscountPercentFromPpi(ppi)`.
 * Não altera `price`; usado para comparar com o preço de grelha. Campos nulos se faltar dado.
 * @param {number | null | undefined} price — valor final já normalizado (`normalizeItem`)
 * @param {number | null | undefined} originalPrice
 * @param {object | undefined} ppi — `product_price_info`
 * @returns {{ preco_estimado_vitrine: number | null, preco_gap_estimado: number | null, preco_gap_estimado_percent: number | null }}
 */
function computePrecoEstimadoVitrineFields(price, originalPrice, ppi) {
  const empty = {
    preco_estimado_vitrine: null,
    preco_gap_estimado: null,
    preco_gap_estimado_percent: null
  };
  if (originalPrice == null || typeof originalPrice !== "number" || Number.isNaN(originalPrice) || originalPrice <= 0) {
    return empty;
  }
  if (price == null || typeof price !== "number" || Number.isNaN(price)) {
    return empty;
  }
  if (originalPrice <= price) {
    return empty;
  }
  const d = parseDiscountPercentFromPpi(ppi);
  if (d == null || d < 1 || d > 94) {
    return empty;
  }
  const base = originalPrice * (1 - d / 100);
  const precoEstimadoVitrine = Math.round(base * 100) / 100;
  const precoGapEstimado = precoEstimadoVitrine - price;
  const rawPct = precoGapEstimado / originalPrice;
  const precoGapEstimadoPercent = Math.round(rawPct * 10000) / 10000;
  return {
    preco_estimado_vitrine: precoEstimadoVitrine,
    preco_gap_estimado: precoGapEstimado,
    preco_gap_estimado_percent: precoGapEstimadoPercent
  };
}

function extractImages(p) {
  const imgs = new Set();
  const pushUrl = (u) => {
    if (u == null || typeof u !== "string") return;
    let t = u.trim();
    if (t.startsWith("//")) t = `https:${t}`;
    if (t.startsWith("http")) imgs.add(t);
  };
  if (Array.isArray(p.images))
    p.images.forEach((x) => pushUrl(typeof x === "string" ? x : (x?.url ?? x?.uri ?? x?.pic_url ?? x?.thumb_url?.[0])));
  if (Array.isArray(p.image_list)) p.image_list.forEach((x) => pushUrl(typeof x === "string" ? x : (x?.url ?? x?.uri)));
  if (Array.isArray(p.product_image_list)) {
    for (const x of p.product_image_list) {
      pushUrl(typeof x === "string" ? x : x?.url ?? x?.thumb_url ?? x?.uri ?? x?.image?.url);
    }
  }
  if (Array.isArray(p.image?.url_list)) p.image.url_list.forEach(pushUrl);
  if (p.image?.url) pushUrl(p.image.url);
  if (p.cover_image?.url) pushUrl(p.cover_image.url);
  if (p.cover) pushUrl(typeof p.cover === "string" ? p.cover : p.cover?.url);
  if (p.main_image?.url) pushUrl(p.main_image.url);
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname([...imgs]));
}

/**
 * No sub-JSON dum produto PDP: apanha todos os HTTPS que pareçam foto de produto (estruturas OEC heterogéneas).
 * @param {unknown} node
 * @param {number} [maxDepth]
 * @param {number} [maxUrls]
 * @returns {string[]}
 */
function extractHttpImageUrlsDeep(node, maxDepth = 14, maxUrls = 80) {
  const acc = [];
  const seen = new Set();
  (function walk(n, d) {
    if (d > maxDepth || n == null || acc.length >= maxUrls) return;
    if (typeof n === "string") {
      let t = n.trim();
      if (t.startsWith("//")) t = `https:${t}`;
      if (t.startsWith("http") && /p16-|p19-|ibyteimg|tiktokcdn\.com/i.test(t)) {
        if (!/\/(avt|sign\/)/i.test(t) && !/aweme-avt|user_?avatar|common-sign|user_nick/i.test(t)) {
          if (!seen.has(t)) {
            seen.add(t);
            acc.push(t);
          }
        }
      }
      return;
    }
    if (Array.isArray(n)) {
      for (const x of n) {
        walk(x, d + 1);
        if (acc.length >= maxUrls) return;
      }
      return;
    }
    if (typeof n !== "object") return;
    for (const v of Object.values(n)) {
      walk(v, d + 1);
      if (acc.length >= maxUrls) return;
    }
  })(node, 0);
  return acc;
}

/**
 * Imagens combinadas dum nó de produto vindo do `__MODERN_ROUTER_DATA__` na PDP (campos conhecidos + varredura profunda limitada).
 * @param {object} raw
 */
function extractAllImageUrlsFromRouterProductNode(raw) {
  if (!raw || typeof raw !== "object") return [];
  const m = mergeProductLayers(raw);
  const shallow = extractImages(m);
  const deep = extractHttpImageUrlsDeep(m, 14, 90);
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname([...shallow, ...deep]));
}

/**
 * Identificador do asset OEC (mesmo ficheiro em p16/p19 ou em resoluções tplv distintas).
 * @param {string} u
 * @returns {string | null}
 */
function getIbyteImageAssetId(u) {
  if (!u || typeof u !== "string") {
    return null;
  }
  try {
    const path = new URL(u.trim()).pathname;
    const m = path.match(/\/([a-f0-9]{8,32})~tplv-/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Mesmo ficheiro com crops diferentes (`:1000:1000` vs `:800:800`) — um URL por id de asset.
 * @param {string[]} urls
 * @returns {string[]}
 */
function dedupeImageUrlsByAssetId(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (typeof u !== "string" || u.length < 12) {
      continue;
    }
    const t = u.trim();
    const id = getIbyteImageAssetId(t);
    const key = id != null ? `id:${id}` : t;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Grelha (`fotos`) não repete o mesmo asset que já está em `fotos_pdp` (caminho diferente, mesmo hash).
 * @param {string[]|null|undefined} fotosGrelha
 * @param {string[]|null|undefined} fotosPdp
 * @returns {string[]|null}
 */
function subtractFotosOverlappingPdp(fotosGrelha, fotosPdp) {
  if (!Array.isArray(fotosGrelha) || !fotosGrelha.length) {
    return null;
  }
  const g = dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(fotosGrelha));
  if (!Array.isArray(fotosPdp) || !fotosPdp.length) {
    return g.length ? g : null;
  }
  const pdpIds = new Set();
  for (const u of fotosPdp) {
    const id = getIbyteImageAssetId(u);
    if (id) {
      pdpIds.add(id);
    }
  }
  if (pdpIds.size === 0) {
    return g.length ? g : null;
  }
  const out = g.filter((u) => {
    const id = getIbyteImageAssetId(u);
    if (id && pdpIds.has(id)) {
      return false;
    }
    return true;
  });
  return out.length ? out : null;
}

/**
 * O feed costuma listar o mesmo ficheiro em espelhos CDN (ex. `p16-oec-…` e `p19-oec-…` com o mesmo `pathname`).
 * Mantém a primeira ocorrência, ordem estável.
 * @param {string[]} urls
 * @returns {string[]}
 */
function dedupeImageUrlsByPathname(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (typeof u !== "string" || u.length < 12) {
      continue;
    }
    const t = u.trim();
    if (!t.startsWith("http")) {
      continue;
    }
    let key;
    try {
      key = new URL(t).pathname;
    } catch {
      key = t;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Deduplica URLs de imagem da galeria PDP (ordem estável, URL exata) e espelhos CDN por pathname.
 * @param {string[]} urls
 * @returns {string[]}
 */
function dedupePdpImageUrls(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (typeof u !== "string") continue;
    const t = u.trim();
    if (t.length < 12) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(out));
}

/**
 * `shop_logo.url_list` traz o mesmo ficheiro em p16 e p19 (e por vezes resoluções tplv) — alinhar a `fotos`/`fotos_pdp`.
 * @param {string[]} urls
 * @returns {string[]}
 */
function normalizeAndDedupeLogoUrlList(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const abs = urls
    .filter((u) => typeof u === "string")
    .map((u) => {
      const t = u.trim();
      return t.startsWith("//") ? `https:${t}` : t;
    })
    .filter((u) => u.startsWith("http"));
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(abs));
}

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
function combinePdpHeroPriceParts(intPart, decPart) {
  const a = String(intPart || "").replace(/[^\d]/g, "");
  if (!a) {
    return null;
  }
  const rawD = String(decPart || "").replace(/[^\d]/g, "");
  if (!rawD) {
    const n = parseFloat(a, 10);
    if (Number.isNaN(n) || n < 0) {
      return null;
    }
    return n;
  }
  const d2 = rawD.length >= 2 ? rawD.slice(0, 2) : rawD.padEnd(2, "0");
  const n = parseFloat(`${a}.${d2}`, 10);
  if (Number.isNaN(n) || n < 0) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

/**
 * Aplica o par { sale, listPrice } lido no DOM do PDP: `price` = vitrine; `original_price` = "de" só
 * se houver riscado acima do preço de venda, senão `null` (sem desconto visível nesse bloco).
 * @param {Record<string, unknown>} n linha de `byProductId` (mutável)
 * @param {{ sale: number | null, listPrice: number | null } | null | undefined} pdp
 * @returns {Record<string, unknown>}
 */
function applyPdpDomPrices(n, pdp) {
  if (!n || !pdp || typeof pdp !== "object") {
    return n;
  }
  const sale = pdp.sale;
  const listPrice = pdp.listPrice;
  if (typeof sale !== "number" || Number.isNaN(sale) || sale <= 0) {
    return n;
  }
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

/**
 * Nó de produto no JSON embebido da PDP (o mesmo `product_id` + `product_price_info` que a vitrine OEC).
 * @param {object} rootData
 * @param {string} productId
 * @returns {object | null}
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
      await secondary.setExtraHTTPHeaders({
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      });
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

/* =============================================================================
 * Loja (seller): normalização, merge entre linhas e agregado por `seller_id`.
 * Não confundir com `reviewer_name` / nós de review (filtrados em outro sítio).
 * Saída: campos de loja na linha + `output/dados_lojas.json` (dedupe por `seller_id`).
 * ============================================================================= */
const LOJA_FIELD_DEFAULTS = {
  seller_id: null,
  global_seller_id: null,
  nome_loja: null,
  loja_vendas_total: null,
  loja_produtos_ativos: null,
  loja_reviews_total: null,
  loja_seguidores: null,
  loja_videos: null,
  loja_enable_follow: null,
  loja_logo_uri: null,
  loja_logo_urls: null
};

/** `shop_logo`: uri e url_list. */
function readShopLogo(logo) {
  if (!logo || typeof logo !== "object") {
    return { uri: null, urls: [] };
  }
  const uri = logo.uri != null && String(logo.uri).trim() !== "" ? String(logo.uri).trim() : null;
  const raw = Array.isArray(logo.url_list)
    ? logo.url_list.filter((u) => typeof u === "string" && (u.startsWith("http") || u.startsWith("//")))
    : [];
  const urls = normalizeAndDedupeLogoUrlList(raw);
  return { uri, urls };
}

/**
 * Dados de loja a partir de `seller_info` e/ou `shop_info` (não usa reviewer_name, review_id, review_text).
 * @param {object} node
 * @returns {Record<string, unknown> | null}
 */
function normalizeSellerInfo(node) {
  if (!node || typeof node !== "object") {
    return null;
  }
  if (isReviewOnlyProductNode(node)) {
    return null;
  }
  const hasSe = node.seller_info && typeof node.seller_info === "object";
  const hasSh = node.shop_info && typeof node.shop_info === "object";
  if (!hasSe && !hasSh) {
    return null;
  }
  const se = hasSe ? node.seller_info : null;
  const sh = hasSh ? node.shop_info : null;
  const logSe = se ? readShopLogo(se.shop_logo) : { uri: null, urls: [] };
  const logSh = sh ? readShopLogo(sh.shop_logo) : { uri: null, urls: [] };
  const uri = logSh.uri || logSe.uri || null;
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
      sh && typeof sh.enable_follow === "boolean"
        ? sh.enable_follow
        : sh && sh.enable_follow != null
          ? Boolean(sh.enable_follow)
          : null,
    loja_logo_uri: uri,
    loja_logo_urls: urlsMerged.length > 0 ? urlsMerged : null
  };
}

function coalesceLojaString(a, b) {
  if (b != null && String(b).trim() !== "") {
    return String(b).trim();
  }
  if (a != null && String(a).trim() !== "") {
    return String(a).trim();
  }
  return null;
}

function coalesceLojaNumber(a, b) {
  if (b != null && !Number.isNaN(Number(b))) {
    return Number(b);
  }
  if (a != null && !Number.isNaN(Number(a))) {
    return Number(a);
  }
  return null;
}

function coalesceLojaBool(a, b) {
  if (typeof b === "boolean") {
    return b;
  }
  if (typeof a === "boolean") {
    return a;
  }
  return null;
}

/**
 * @param {object} row
 */
function extractLojaFromNormalized(row) {
  if (!row || typeof row !== "object") {
    return { ...LOJA_FIELD_DEFAULTS };
  }
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

function lojaToRowFields(merged) {
  return { ...LOJA_FIELD_DEFAULTS, ...merged };
}

/**
 * Campos de loja: o novo nunca apaga o antigo com null; URLs de logo unem sem duplicar.
 */
function mergeLojaFromNormalized(prevRow, nextRow) {
  const p = extractLojaFromNormalized(prevRow);
  const n = extractLojaFromNormalized(nextRow);
  const pUrls = p.loja_logo_urls || [];
  const nUrls = n.loja_logo_urls || [];
  const mergedUrls = normalizeAndDedupeLogoUrlList([...pUrls, ...nUrls]);
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
      mergedUrls.length > 0
        ? mergedUrls
        : p.loja_logo_urls != null || n.loja_logo_urls != null
          ? mergedUrls
          : null
  };
}

function tryRecordSellerDebugSource(raw) {
  if (!recordSellerDebug || sellerDebugSamples.length >= 20) {
    return;
  }
  const hasS = raw?.seller_info && typeof raw.seller_info === "object";
  const hasSh = raw?.shop_info && typeof raw.shop_info === "object";
  if (!hasS && !hasSh) {
    return;
  }
  sellerDebugSamples.push({
    product_id: raw?.product_id != null ? String(raw.product_id) : null,
    has_seller_info: hasS,
    has_shop_info: hasSh,
    seller_info_keys: hasS ? Object.keys(raw.seller_info).slice(0, 30) : [],
    shop_info_keys: hasSh ? Object.keys(raw.shop_info).slice(0, 35) : []
  });
}

/* =============================================================================
 * Produto (product): colisão no mapa por `product_id`, normalização grelha (`normalizeItem`)
 * e escolha da linha mais “rica” (`productRowRichness`). Preço/merge: não alterar sem testes.
 * Snapshot histórico (futuro) é responsabilidade de camada à parte — aqui só estado corrente.
 * ============================================================================= */

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
  if (n.original_price != null && n.price != null && n.original_price > n.price) {
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
 * No merge, preserva o maior `sales_count` visto (várias respostas / XHR).
 * Não afeta preço, loja, nem `normalizeItem`.
 */
function coalesceMaxSalesCount(a, b) {
  const valid = (x) => typeof x === "number" && !Number.isNaN(x);
  const va = valid(a);
  const vb = valid(b);
  if (!va && !vb) {
    return null;
  }
  if (!va) {
    return b;
  }
  if (!vb) {
    return a;
  }
  return Math.max(a, b);
}

/**
 * Vencedor do merge conserva o seu `sales_display` se tiver texto; senão, o do outro.
 */
function coalesceSalesDisplayFromMerge(winner, other) {
  const trimmed = (v) =>
    v != null && String(v).trim() !== "" ? String(v) : null;
  const w = trimmed(winner?.sales_display);
  if (w) {
    return winner.sales_display;
  }
  const o = trimmed(other?.sales_display);
  if (o) {
    return other.sales_display;
  }
  return winner?.sales_display ?? other?.sales_display ?? null;
}

/**
 * @param {Map<string, object>} byProductId chave = product_id
 * @param {ReturnType<normalizeItem>} n
 */
function mergeProductById(byProductId, n) {
  const key = String(n.product_id);
  const prev = byProductId.get(key);
  const mergedLoja = prev ? mergeLojaFromNormalized(prev, n) : extractLojaFromNormalized(n);
  const lojaBlock = lojaToRowFields(mergedLoja);
  const rateBlock = prev ? coalesceProductRatings(n, prev) : null;
  if (!prev) {
    byProductId.set(key, { ...n, ...lojaBlock });
    return;
  }
  const salesMax = coalesceMaxSalesCount(prev.sales_count, n.sales_count);
  if (productRowRichness(n) > productRowRichness(prev)) {
    const base = { ...n, ...lojaBlock, ...rateBlock };
    byProductId.set(key, {
      ...base,
      sales_count: salesMax,
      sales_display: coalesceSalesDisplayFromMerge(n, prev)
    });
  } else {
    const base = { ...prev, ...lojaBlock, ...rateBlock };
    byProductId.set(key, {
      ...base,
      sales_count: salesMax,
      sales_display: coalesceSalesDisplayFromMerge(prev, n)
    });
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

/** Nó de produto (grelha): `product_id`, preço, imagens, url PDP, vendas, ratings de produto; anexa bloco de loja quando existir. */
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

  const originalPrice = pickNumber(
    ppi?.origin_price,
    ppi?.original_price,
    ppi?.origin_price_decimal,
    raw.origin_price,
    raw.original_price,
    raw.strike_price,
    raw.price_info?.origin_price
  );

  const fromFormatStr =
    pickPriceFromFormatStrings(ppi) ??
    pickPriceFromFormatStrings(raw) ??
    (raw.price_info && typeof raw.price_info === "object" ? pickPriceFromFormatStrings(raw.price_info) : null);
  const fromFormatUsed = fromFormatStr != null;
  const minPrice = pickNumber(ppi?.min_price, pm?.min_price, raw.min_price);
  const defaultSkuPrice = priceFromDefaultSku(raw);
  // Preço de grelha: strings format primeiro, depois default SKU, depois colunas a nível de produto
  // (`sku_list[0]` piso, `min_price` por último). Reconcile/align: vitrine real vs. piso+desconto no feed.
  const priceBase =
    fromFormatStr ??
    defaultSkuPrice ??
    pickNumber(
      ppi?.sale_price,
      ppi?.price,
      ppi?.sale_price_decimal,
      pm?.sale_price,
      pm?.price,
      sku0?.sale_price,
      sku0?.price,
      ppi?.min_price,
      pm?.min_price,
      raw.price,
      raw.min_price,
      raw.sale_price,
      raw.salePrice,
      raw.price_info?.price,
      raw.price_info?.sale_price
    ) ??
    null;
  const priceReconciled = reconcileVitrineNoDiscount(priceBase, originalPrice, ppi, minPrice, fromFormatUsed);
  const price = alignPriceToStatedPercent(
    priceReconciled,
    originalPrice,
    ppi,
    minPrice,
    fromFormatUsed
  );

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

  const product_url = pickProductPdpUrl(id, raw, categoriaUrl);

  const lojaBlob = normalizeSellerInfo(raw) || { ...LOJA_FIELD_DEFAULTS };
  tryRecordSellerDebugSource(raw);

  const dDisc = parseDiscountPercentFromPpi(ppi);
  const temDesconto =
    dDisc != null &&
    dDisc >= 1 &&
    dDisc <= 94 &&
    originalPrice != null &&
    typeof originalPrice === "number" &&
    !Number.isNaN(originalPrice) &&
    originalPrice > price;

  const { preco_estimado_vitrine, preco_gap_estimado, preco_gap_estimado_percent } = temDesconto
    ? computePrecoEstimadoVitrineFields(price, originalPrice, ppi)
    : { preco_estimado_vitrine: null, preco_gap_estimado: null, preco_gap_estimado_percent: null };
  const outOriginal = temDesconto ? originalPrice : null;

  return {
    sku,
    product_id: id,
    product_url,
    title,
    price,
    original_price: outOriginal,
    tem_desconto: temDesconto,
    currency,
    preco_estimado_vitrine,
    preco_gap_estimado,
    preco_gap_estimado_percent,
    sales_count: salesParsed,
    sales_display: salesRaw,
    images: extractImages(raw),
    source_keys: Object.keys(raw).slice(0, 25),
    ...extractProductRatings(raw),
    ...lojaToRowFields(lojaBlob)
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

async function humanPause(page, min = 200, max = 600) {
  const ms = min + Math.random() * (max - min);
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
  const vp = page.viewport() || { width: 1280, height: 800 };
  for (let i = 0; i < 3; i++) {
    const x = 80 + Math.random() * (vp.width - 160);
    const y = 120 + Math.random() * (vp.height - 200);
    await page.mouse.move(x, y, { steps: 12 + Math.floor(Math.random() * 8) });
    await humanPause(page, 100, 250);
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
    await humanPause(page, 250, 550);
    const h = await page.evaluate(() => document.body?.scrollHeight ?? 0);
    if (h === lastHeight) stable += 1;
    else stable = 0;
    lastHeight = h;
    if (stable >= 2) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await humanPause(page, 150, 300);
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
  const maxClicks = off ? 0 : Math.min(10, Math.max(0, maxClicksConfigured));
  const drainMs = Math.max(800, Number(process.env.VIEW_MORE_DRAIN_MS) || 4500);

  if (maxClicks === 0) {
    // eslint-disable-next-line no-console
    console.log("[view-more] encerrando (motivo: VIEW_MORE_MAX_CLICKS=0 ou VIEW_MORE=0)");
    return;
  }

  let noGrowthStreak = 0;

  for (let i = 0; i < maxClicks; i++) {
    const found = await page.evaluate(() => {
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

    if (!found.ok) {
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

const DEFAULT_CHROME_PROFILE = path.join(ROOT, ".chrome-tiktok-profile");

/**
 * Deduplica lojas por `seller_id` a partir do mapa de produtos.
 * Alimenta `output/dados_lojas.json` (agregado oficial por vendedor; ver `docs/ARCHITECTURE.md`).
 * @param {Map<string, object>} byProductId
 * @returns {Map<string, object>} valores = campos de loja (sem campos de produto)
 */
function buildLojasMapBySeller(byProductId) {
  const m = new Map();
  for (const p of byProductId.values()) {
    const sid = p.seller_id;
    if (sid == null || String(sid).trim() === "") {
      continue;
    }
    const k = String(sid);
    if (!m.has(k)) {
      m.set(k, extractLojaFromNormalized(p));
    } else {
      const merged = mergeLojaFromNormalized(m.get(k), p);
      m.set(k, merged);
    }
  }
  return m;
}

async function launchTikTokBrowser() {
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
  /** Navegador visível: em muitos casos evita redirecionamento forçado à página de login (headless). */
  const headless = isHeaded ? false : "new";
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined;
  const launchOpts = {
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--lang=pt-BR",
      "--window-size=1366,800"
    ],
    defaultViewport: headless ? { width: 1366, height: 800 } : null
  };
  if (execPath) {
    launchOpts.executablePath = execPath;
  }
  if (userDataDir) {
    launchOpts.userDataDir = userDataDir;
  }
  return puppeteer.launch(launchOpts);
}

/**
 * Fecha abas extra do perfil e impede popups — chamar após `browser.newPage()` da coleta.
 * @param {import("puppeteer").Browser} browser
 * @param {import("puppeteer").Page} page
 */
async function installAntiPopupGuards(browser, page) {
  for (const p of await browser.pages()) {
    if (p !== page) {
      await p.close().catch(() => {});
    }
  }
  page.on("popup", (popup) => {
    void popup.close().catch(() => {});
  });
}

/** Palavras-chave anti-bot / bloqueio no HTML (minúsculas). */
const SCRAPE_DIAG_HTML_KEYWORDS = [
  "captcha",
  "verify",
  "unusual traffic",
  "login",
  "challenge",
  "access denied",
  "robot",
  "blocked"
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
  }
  await new Promise((r) => setTimeout(r, 10_000));
  await progressiveScrollPageToBottom(page);
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

  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: png1, fullPage: true }).catch(() => {});
  await progressiveScrollPageToBottom(page);
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: png2, fullPage: true }).catch(() => {});

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

  const browserEnv = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    webdriver: navigator.webdriver,
    language: navigator.language,
    languages: navigator.languages ? [...navigator.languages] : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    platform: navigator.platform
  }));
  await fs.writeFile(envPath, JSON.stringify(browserEnv, null, 2), "utf8");

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
    browser_env: browserEnv,
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
 * @returns {Promise<number>} código de saída (0 ok, 1 sem produtos com `status` ok→no_products)
 */
async function runCategoryHarvest(browser, page, startUrl) {
  const pdpGalleryEnv =
    process.env.PDP_GALLERY === "1" || /^true$/i.test(String(process.env.PDP_GALLERY || ""));
  await ensureOutAuxDir();
  const outFile = path.join(OUT_AUX, "teste_categoria.json");
  const debugFile = path.join(OUT_AUX, "debug_responses.log");
  const isHeaded = process.env.HEADED === "1";
  const loginWaitMaxMs = Math.max(60_000, Number(process.env.LOGIN_WAIT_MAX_MS) || 15 * 60_000);

  /** chave = product_id; dedupe: mantém a linha mais "rica" (preço, imagens) */
  const byProductId = new Map();
  recordSellerDebug = true;
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
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  });

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

  let reloadedCategoryAfterLogin = false;

  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await humanPause(page, 1250, 2250);
    finalUrl = page.url();

    if (!/shop\.tiktok\.com/i.test(finalUrl) && isHeaded) {
      const w = await waitForShopOrTimeout(page, { maxMs: loginWaitMaxMs });
      finalUrl = w.url;
      if (w.ok) {
        reloadedCategoryAfterLogin = true;
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await humanPause(page, 1000, 2000);
        finalUrl = page.url();
      }
    }

    if (!/shop\.tiktok\.com/i.test(finalUrl)) {
      status = "not_shop";
      note = isHeaded
        ? `Ainda fora de shop.tiktok.com após ${Math.round(loginWaitMaxMs / 60_000)} min. Aumente LOGIN_WAIT_MAX_MS ou conclua o login a tempo. Perfil: CHROME_USER_DATA=...`
        : "A sessão caiu fora de shop.tiktok.com. Use HEADED=1, faça o login; na próxima execução o login deve persistir no perfil .chrome-tiktok-profile. Outro local: CHROME_USER_DATA=caminho.";
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
      // Pós-goto em shop.tiktok.com: networkidle2 (reload em headless por defeito) + 10s + scroll longo
      await postGotoShopStabilize(page, isHeaded);
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

      if (reloadedCategoryAfterLogin) {
        // já recarregou a categoria acima; só ajusta ritmo
        await humanPause(page, 500, 1000);
      } else {
        await humanPause(page, 750, 1500);
      }
      await gentleMouseJiggle(page);
      await scrollToLoadGrid(page);
      await humanPause(page, 1000, 2000);
      await clickViewMoreWhileNeeded(page, () => byProductId.size);
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

  let exitCode = 0;
  /** @type {object | null} */
  let diagnostic = null;

  if (byProductId.size === 0 && status === "ok") {
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
  recordSellerDebug = false;

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
 */
export async function scrapeCategoriesSequentialSharedBrowser(runs) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("scrapeCategoriesSequentialSharedBrowser: runs[] vazio");
  }
  const browser = await launchTikTokBrowser();
  let exitCode = 0;
  try {
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const label = r.label || r.CATEGORY_URL;
      process.env.OUTPUT_DIR = r.OUTPUT_DIR;
      initOutputPaths();
      // eslint-disable-next-line no-console
      console.log(`\n--- ${label} ---\nOUTPUT_DIR=${r.OUTPUT_DIR}\nCATEGORY_URL=${r.CATEGORY_URL}\n`);
      const page = await browser.newPage();
      await installAntiPopupGuards(browser, page);
      const code = await runCategoryHarvest(browser, page, r.CATEGORY_URL);
      exitCode = Math.max(exitCode, code);
      await page.close().catch(() => {});
      if (i < runs.length - 1) {
        await new Promise((res) => setTimeout(res, 450 + Math.random() * 550));
      }
    }
  } finally {
    await browser.close();
  }
  return exitCode;
}

async function main() {
  initOutputPaths();
  const startUrl = process.env.CATEGORY_URL || DEFAULT_URL;
  const browser = await launchTikTokBrowser();
  const page = await browser.newPage();
  await installAntiPopupGuards(browser, page);
  try {
    return await runCategoryHarvest(browser, page, startUrl);
  } finally {
    await browser.close();
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

/* Regressão: `npm test` importa sem executar o scrape; não alterar sem correr testes. */
export {
  coalesceProductRatings,
  dedupeImageUrlsByAssetId,
  dedupeImageUrlsByPathname,
  dedupePdpImageUrls,
  extractProductRatings,
  mergeLojaFromNormalized,
  mergeProductById,
  mergeProductLayers,
  normalizeItem,
  normalizeSellerInfo,
  parseBrlishMoneyString,
  parseDiscountPercentFromPpi,
  parseRateInfoObject,
  pickPriceFromFormatStrings,
  isReviewOnlyProductNode,
  productRowRichness,
  combinePdpHeroPriceParts,
  applyPdpDomPrices,
  toDadosProdutoClean,
  launchTikTokBrowser,
  installAntiPopupGuards
};
