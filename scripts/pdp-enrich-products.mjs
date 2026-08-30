/**
 * Enriquece em lote só o PDP de `product_id` escolhidos: lê `output/dados_produtos.json`,
 * visita `/pdp/...`, mescla `fotos_pdp` + preços DOM (reutiliza `enrichByProductIdWithPdpGallery`).
 *
 * Uso:
 *   npm run pdp:enrich -- --ids=123,456
 *   PDP_PRODUCT_IDS=123,456 npm run pdp:enrich
 */
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  enrichByProductIdWithPdpGallery,
  installAntiPopupGuards,
  launchTikTokBrowser,
  toDadosProdutoClean
} from "../src/scrapeCategory.mjs";
import { extractOrderedImageUrls } from "./lib/extract-image-urls.mjs";
import { productIdDeUrl, itemMinimoDeUrl } from "../src/scrape/pdp-url.mjs";

/** Link original de cada id que veio de URL, para o fallback saber a PDP. */
const linkPorId = new Map();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DADOS_PATH = path.join(root, "output", "dados_produtos.json");
const prisma = new PrismaClient();

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
 * @param {object} item — uma entrada de `itens[]`
 * @returns {string}
 */
function resolvePdpUrlForItem(item) {
  const link = item?.link_produto != null ? String(item.link_produto).trim() : "";
  if (link && /\/pdp\//i.test(link)) {
    return link.split(/[?#]/)[0];
  }
  const id = item?.product_id != null ? String(item.product_id).trim() : "";
  if (!id) {
    return "";
  }
  const region = pathRegionFromCategoryUrl(item?.categoria_url);
  return `https://www.tiktok.com/shop/${region}/pdp/${id}`;
}

/**
 * @param {object} item
 * @param {string} pdpUrl
 * @returns {Record<string, unknown>}
 */
function jsonItemToNormalized(item, pdpUrl) {
  const toNum = (v) => {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  return {
    sku: item.product_id ?? null,
    product_id: String(item.product_id ?? ""),
    product_url: pdpUrl,
    title: item.nome ?? null,
    price: toNum(item.preco),
    original_price:
      item.preco_original != null && typeof item.preco_original === "number"
        ? item.preco_original
        : toNum(item.preco_original),
    tem_desconto: Boolean(item.tem_desconto),
    currency: item.moeda ?? null,
    preco_estimado_vitrine: toNum(item.preco_estimado_vitrine),
    preco_gap_estimado: toNum(item.preco_gap_estimado),
    preco_gap_estimado_percent: toNum(item.preco_gap_estimado_percent),
    sales_count: item.vendas != null ? toNum(item.vendas) : null,
    sales_display: item.vendas_texto ?? null,
    images: Array.isArray(item.fotos) ? item.fotos : null,
    images_pdp: Array.isArray(item.fotos_pdp) ? item.fotos_pdp : null,
    review_avg: toNum(item.avaliacao_media),
    review_count_total: toNum(item.avaliacoes_total),
    review_star_votes: item.votos_por_estrela ?? null,
    seller_id: item.seller_id ?? null,
    global_seller_id: item.global_seller_id ?? null,
    nome_loja: item.nome_loja ?? null,
    loja_vendas_total: item.loja_vendas_total ?? null,
    loja_produtos_ativos: item.loja_produtos_ativos ?? null,
    loja_reviews_total: item.loja_reviews_total ?? null,
    loja_seguidores: item.loja_seguidores ?? null,
    loja_videos: item.loja_videos ?? null,
    loja_enable_follow: item.loja_enable_follow ?? null,
    loja_logo_uri: item.loja_logo_uri ?? null,
    loja_logo_urls: Array.isArray(item.loja_logo_urls) ? item.loja_logo_urls : null
  };
}

/**
 * Aceita id nu OU link de produto — ver `src/scrape/pdp-url.mjs`.
 *
 * Descobrir produto a navegar é caso de uso real: vês algo bom na app, copias
 * o link, queres a galeria. Obrigar a extrair o id à mão de uma URL de 120
 * caracteres era atrito sem motivo.
 */
function normalizarEntradas(valores) {
  const ids = [];
  for (const bruto of valores) {
    const t = String(bruto).trim();
    if (t === "") continue;
    const id = productIdDeUrl(t);
    if (id) {
      ids.push(id);
      if (id !== t) linkPorId.set(id, t);
    } else {
      // Entra na mesma: quem falha a seguir diz porquê, com o valor à vista.
      ids.push(t);
    }
  }
  return ids;
}

function parseIds(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--ids=")) {
      out.push(...a.slice(6).split(","));
      return normalizarEntradas(out);
    }
    if (a === "--ids" && argv[i + 1]) {
      const v = argv[i + 1];
      out.push(...String(v).split(","));
      return normalizarEntradas(out);
    }
    // `--url=` é o mesmo caminho, com nome que diz ao que vem.
    if (a.startsWith("--url=")) {
      out.push(...a.slice(6).split(","));
      return normalizarEntradas(out);
    }
    if (a === "--url" && argv[i + 1]) {
      out.push(...String(argv[i + 1]).split(","));
      return normalizarEntradas(out);
    }
  }
  const env = process.env.PDP_PRODUCT_IDS?.trim();
  if (env) {
    return normalizarEntradas(env.split(","));
  }
  return [];
}

/**
 * Merge seguro PDP → item exportado (`itens[]`). Nunca grava null por cima de valores úteis
 * já presentes quando o PDP não trouxe alternativa equivalente.
 * @param {object} orig
 * @param {object} clean — saída de `toDadosProdutoClean` após `enrichByProductIdWithPdpGallery`
 * @param {boolean} enrichedOk
 * @returns {object}
 */
function mergePdpIntoItem(orig, clean, enrichedOk) {
  if (!enrichedOk) {
    return { ...orig };
  }
  /** @type {Record<string, unknown>} */
  const next = { ...orig };

  const pdpPhotos = Array.isArray(clean.fotos_pdp) ? clean.fotos_pdp : null;
  if (pdpPhotos && pdpPhotos.length > 0) {
    next.fotos_pdp = pdpPhotos;
  }

  // Mídia das avaliações — o único material com uma pessoa real a usar este
  // produto, que é o que a TikTok premia e a foto de catálogo nunca tem. Era o
  // segundo sítio onde se perdia: mesmo depois de a normalização passar a
  // exportá-la, este merge não a copiava para `itens[]`.
  // Só sobrescreve quando veio conteúdo: PDP sem secção de avaliações carregada
  // não pode apagar o que uma passagem anterior já tinha achado.
  for (const campo of ["fotos_review", "videos_review"]) {
    const v = Array.isArray(clean[campo]) ? clean[campo] : null;
    if (v && v.length > 0) {
      next[campo] = v;
    }
  }

  const grid = Array.isArray(clean.fotos) ? clean.fotos : null;
  if (grid != null && grid.length > 0) {
    next.fotos = grid;
  }

  const saleOk = typeof clean.preco === "number" && !Number.isNaN(clean.preco) && clean.preco > 0;
  if (saleOk) {
    next.preco = clean.preco;
  }

  const listClean = clean.preco_original;
  let updatedOriginalFromPdp = false;
  if (listClean != null && typeof listClean === "number" && !Number.isNaN(listClean)) {
    next.preco_original = listClean;
    updatedOriginalFromPdp = true;
  }

  if (typeof clean.tem_desconto === "boolean") {
    const origHadList =
      orig?.preco_original != null &&
      typeof orig.preco_original === "number" &&
      !Number.isNaN(orig.preco_original);
    if (updatedOriginalFromPdp) {
      next.tem_desconto = Boolean(clean.tem_desconto);
    } else if (!(origHadList && listClean == null) && saleOk) {
      next.tem_desconto = Boolean(clean.tem_desconto);
    }
  }

  for (const k of ["preco_estimado_vitrine", "preco_gap_estimado", "preco_gap_estimado_percent"]) {
    const v = clean[k];
    if (v != null && typeof v === "number" && !Number.isNaN(v)) {
      next[k] = v;
    }
  }

  const pd = typeof clean.productDescription === "string" ? clean.productDescription.trim() : "";
  if (pd) {
    next.productDescription = pd;
  }

  return next;
}

async function captureProductDescriptionFromPdp(page) {
  try {
    const out = await page.evaluate(() => {
      const targetRe = /(descri[cç][aã]o do produto|product description)/i;

      const normSpaces = (s) =>
        String(s || "")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+/g, " ")
          .trim();

      const cleanText = (text) => {
        const lines = String(text || "")
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map((l) => normSpaces(l))
          .filter((l) => l !== "");
        const deduped = [];
        for (const line of lines) {
          if (deduped.length && deduped[deduped.length - 1] === line) continue;
          deduped.push(line);
        }
        const merged = deduped.join("\n").trim();
        return merged ? merged : null;
      };

      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none") return false;
        if (style.visibility === "hidden") return false;
        if (Number(style.opacity || "1") === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const isHeading = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const tag = el.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) return true;
        const role = el.getAttribute("role");
        return role != null && role.toLowerCase() === "heading";
      };

      const allEls = Array.from(document.querySelectorAll("*"));
      const candidates = [];
      for (let i = 0; i < allEls.length && i < 4000; i++) {
        const el = allEls[i];
        if (!(el instanceof HTMLElement)) continue;
        if (!isVisible(el)) continue;
        const t = (el.innerText || "").trim();
        if (!t) continue;
        if (!targetRe.test(t)) continue;
        if (t.length > 120) continue;
        const headingBonus = isHeading(el) ? 10 : 0;
        const exactBonus = /^descri[cç][aã]o do produto$/i.test(t) || /^product description$/i.test(t) ? 20 : 0;
        const tag = el.tagName.toLowerCase();
        const tagBonus = tag === "h2" || tag === "h3" ? 8 : tag === "h4" ? 6 : tag === "h5" ? 4 : 0;
        candidates.push({ el, score: headingBonus + exactBonus + tagBonus + Math.max(0, 120 - t.length) / 40 });
      }
      candidates.sort((a, b) => b.score - a.score);
      const h = candidates.length ? candidates[0].el : null;
      if (!h) return { text: null, status: "not_found" };

      const blocks = [];
      const stopRe = /(especifica[cç][oõ]es|detalhes|avalia[cç][oõ]es|reviews|shipping|entrega)/i;
      const noiseRe = /(comprar|buy now|r\$\s*\d|explore|explorar|ver mais|see more|menu|varia[cç][aã]o|variation)/i;

      const pushFrom = (el) => {
        if (!(el instanceof HTMLElement)) return;
        if (isHeading(el) && stopRe.test((el.innerText || "").trim())) return;
        const raw = cleanText(el.innerText || "");
        if (!raw) return;
        const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);
        const keep = lines.filter((l) => !noiseRe.test(l));
        const txt = cleanText(keep.join("\n"));
        if (!txt) return;
        blocks.push(txt);
      };

      let container = h.parentElement;
      for (let up = 0; up < 5 && container; up++) {
        const txt = (container.innerText || "").trim();
        if (txt && txt.length < 20000) break;
        container = container.parentElement;
      }

      const fromSiblings = () => {
        let cur = h.nextElementSibling;
        for (let step = 0; step < 18 && cur; step++) {
          const el = cur;
          if (isHeading(el) && stopRe.test((el.innerText || "").trim())) break;
          pushFrom(el);
          if (blocks.join("\n").length > 9000) break;
          cur = cur.nextElementSibling;
        }
      };

      const fromContainerChildren = () => {
        if (!container) return;
        const kids = Array.from(container.children);
        const idx = kids.indexOf(h);
        if (idx < 0) return;
        for (let i = idx + 1; i < kids.length; i++) {
          const el = kids[i];
          if (!(el instanceof HTMLElement)) continue;
          if (isHeading(el) && stopRe.test((el.innerText || "").trim())) break;
          pushFrom(el);
          if (blocks.join("\n").length > 9000) break;
        }
      };

      fromSiblings();
      if (blocks.length === 0) fromContainerChildren();

      const merged = cleanText(blocks.join("\n"));
      return { text: merged, status: merged ? "ok" : "empty" };
    });

    const text = typeof out?.text === "string" ? out.text.trim() : "";
    const status = typeof out?.status === "string" ? out.status : "empty";
    return { text: text ? text : null, status, size: text ? text.length : 0 };
  } catch {
    return { text: null, status: "empty", size: 0 };
  }
}

async function smallLazyScrollDown(page, index) {
  try {
    await page.evaluate(() => {
      const dy = Math.max(280, Math.floor(window.innerHeight * 0.55));
      window.scrollBy(0, dy);
    });
  } catch {
  }
  try {
    await page.waitForTimeout(index === 0 ? 250 : 350);
  } catch {
  }
}

function indicesByProductId(itens) {
  /** @type {Map<string, number[]>} */
  const map = new Map();
  if (!Array.isArray(itens)) {
    return map;
  }
  for (let i = 0; i < itens.length; i++) {
    const id = itens[i]?.product_id != null ? String(itens[i].product_id) : "";
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, []);
    }
    map.get(id).push(i);
  }
  return map;
}

function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toNumberOrNull(value) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Cria uma entrada mínima compatível com `dados_produtos.json` quando o produto
 * já existe na BD, mas não está presente no `output` consolidado atual.
 * @param {string} productId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function buildFallbackItemFromDb(productId) {
  const product = await prisma.product.findUnique({
    where: { productId },
    include: {
      seller: true,
      snapshots: {
        orderBy: [{ scrapeRun: { collectedAt: "desc" } }, { capturedAt: "desc" }],
        take: 1
      }
    }
  });
  if (!product) {
    return null;
  }

  const snap = product.snapshots[0] ?? null;
  const orderedImages = snap ? extractOrderedImageUrls({ images: snap.images, pdpImages: null }) : [];
  const pdpImages = snap ? extractOrderedImageUrls({ images: null, pdpImages: snap.pdpImages }) : [];
  const dq = snap?.dataQuality && typeof snap.dataQuality === "object" ? snap.dataQuality : null;
  const productDescription =
    dq && typeof dq.productDescription === "string" && dq.productDescription.trim()
      ? dq.productDescription.trim()
      : null;

  return {
    product_id: product.productId,
    nome: product.name ?? null,
    link_produto: product.productUrl ?? `https://www.tiktok.com/shop/br/pdp/${encodeURIComponent(product.productId)}`,
    categoria_url: product.categoryUrl ?? null,
    moeda: product.currency ?? null,
    preco: toNumberOrNull(snap?.price),
    preco_original: toNumberOrNull(snap?.originalPrice),
    tem_desconto: Boolean(snap?.hasDiscount),
    preco_estimado_vitrine: toNumberOrNull(snap?.estimatedShowcasePrice),
    preco_gap_estimado: toNumberOrNull(snap?.estimatedPriceGap),
    preco_gap_estimado_percent: toNumberOrNull(snap?.estimatedPriceGapPercent),
    vendas: toNumberOrNull(snap?.salesCount),
    vendas_texto: snap?.salesText ?? null,
    fotos: orderedImages.length > 0 ? orderedImages : null,
    fotos_pdp: pdpImages.length > 0 ? pdpImages : null,
    avaliacao_media: toNumberOrNull(snap?.ratingAverage),
    avaliacoes_total: toNumberOrNull(snap?.ratingTotal),
    votos_por_estrela: snap?.votesByStar ?? null,
    seller_id: product.seller?.sellerId ?? null,
    global_seller_id: product.seller?.globalSellerId ?? null,
    nome_loja: product.seller?.name ?? null,
    loja_logo_uri: product.seller?.logoUri ?? null,
    loja_logo_urls: Array.isArray(product.seller?.logoUrls) ? product.seller.logoUrls : null,
    productDescription
  };
}

async function main() {
  const idsArg = parseIds(process.argv.slice(2));
  if (!idsArg.length) {
    // eslint-disable-next-line no-console
    console.error(
      [
        "Indique o produto:",
        "  npm run pdp:enrich -- --ids=123,456          (id já na base)",
        "  npm run pdp:enrich -- --url=<link da PDP>    (produto novo, achado a navegar)",
        "  ou env PDP_PRODUCT_IDS=123,456"
      ].join("\n")
    );
    process.exit(1);
  }

  const rawText = await readFile(DADOS_PATH, "utf8");
  /** @type {Record<string, unknown>} */
  const payload = JSON.parse(rawText);
  const itens = payload.itens;
  if (!Array.isArray(itens)) {
    throw new Error("dados_produtos.json: campo 'itens' não é um array");
  }

  const idIndex = indicesByProductId(itens);

  const backupPath = path.join(root, "output", `dados_produtos.backup-${backupStamp()}.json`);
  await copyFile(DADOS_PATH, backupPath);
  // eslint-disable-next-line no-console
  console.log(`[backup] ${backupPath}`);

  // Resultado por produto. Sem isto o enriquecimento falhava em silêncio:
  // `continue` no meio do laço, exit 0 no fim, e a interface dizia
  // "enriquecido com sucesso" sobre um produto em que nada mudou.
  /** @type {Map<string, { status: string, nota: string }>} */
  const resultadoPorProduto = new Map();
  const registar = (id, status, nota = "") => {
    resultadoPorProduto.set(String(id), { status, nota });
  };

  try {
    const browser = await launchTikTokBrowser();
    const page = await browser.newPage();
    await installAntiPopupGuards(browser, page);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
    });

    try {
      for (const reqIdRaw of idsArg) {
        const reqId = String(reqIdRaw).trim();
        let indices = idIndex.get(reqId) ?? [];
        if (!indices.length) {
          const fallbackItem =
            (await buildFallbackItemFromDb(reqId)) ??
            // Produto novo, descoberto por link: não está no output nem na
            // base, e é exactamente para isso que o link serve. O item vai
            // vazio de propósito — nome, preço e galeria vêm da PDP.
            (linkPorId.has(reqId) ? itemMinimoDeUrl(reqId, linkPorId.get(reqId)) : null);
          if (!fallbackItem) {
            // eslint-disable-next-line no-console
            console.error(`[pdp:enrich] product_id=${reqId} não encontrado em itens[] nem na BD — ignorado. Se é um produto novo, passe o link: npm run pdp:enrich -- --url=<link da PDP>`);
            registar(reqId, "erro", "produto não existe no output nem na base");
            continue;
          }
          itens.push(fallbackItem);
          indices = [itens.length - 1];
          idIndex.set(reqId, indices);
          // eslint-disable-next-line no-console
          console.log(
            linkPorId.has(reqId)
              ? `[pdp:enrich] product_id=${reqId} veio de link — tudo será lido da PDP`
              : `[pdp:enrich] product_id=${reqId} carregado da BD para fallback do output`
          );
        }

        const baseIdx = indices[0];
        const item = itens[baseIdx];
        const categoriaUrl = item?.categoria_url != null ? String(item.categoria_url) : "";

        let pdpUrl = resolvePdpUrlForItem(item);
        if (!pdpUrl || !/\/pdp\//i.test(pdpUrl)) {
          // eslint-disable-next-line no-console
          console.error(`[pdp:enrich] product_id=${reqId}: URL PDP inválida — ignorado`);
          registar(reqId, "url_invalida", "sem link de PDP utilizável");
          continue;
        }

        const n = jsonItemToNormalized(item, pdpUrl);
        const byProductId = new Map([[String(reqId), n]]);

        let stats = { visited: 0, max: 0, eligible: 0 };
        let erroNavegador = "";
        try {
          stats = await enrichByProductIdWithPdpGallery(browser, page, byProductId, {
            max: 1,
            categoriaUrl
          });
        } catch (e) {
          erroNavegador = String((e && e.message) || e);
          // eslint-disable-next-line no-console
          console.error(`[pdp:enrich] product_id=${reqId} falhou (browser): ${erroNavegador}`);
        }

        const enrichedOk = stats.visited >= 1 && stats.eligible >= 1;

        let productDescription = null;
        if (stats.visited >= 1) {
          const r0 = await captureProductDescriptionFromPdp(page);
          if (r0.status === "ok") {
            productDescription = r0.text;
            console.log(`[pdp-description] found-before-scroll size=${r0.size} product_id=${reqId}`);
          } else {
            console.log(`[pdp-description] empty-before-scroll size=${r0.size} product_id=${reqId}`);
            for (let s = 0; s < 2; s++) {
              await smallLazyScrollDown(page, s);
              const r1 = await captureProductDescriptionFromPdp(page);
              if (r1.status === "ok") {
                productDescription = r1.text;
                console.log(`[pdp-description] found-after-scroll size=${r1.size} product_id=${reqId}`);
                break;
              }
            }
            if (!productDescription) {
              console.log(`[pdp-description] empty-after-scroll size=0 product_id=${reqId}`);
            }
          }
        }

        /** @type {object | null} */
        let clean = null;
        try {
          const after = byProductId.get(String(reqId));
          clean = toDadosProdutoClean(after, categoriaUrl);
          if (clean && typeof productDescription === "string" && productDescription.trim()) {
            clean.productDescription = productDescription.trim();
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(
            `[pdp:enrich] product_id=${reqId} toDadosProdutoClean: ${(e && e.message) || e}`
          );
        }

        if (!clean || !enrichedOk) {
          if (!enrichedOk) {
            // eslint-disable-next-line no-console
            console.warn(
              `[pdp:enrich] product_id=${reqId} PDP não aplicado (visited=${stats.visited}, eligible=${stats.eligible}) — item original preservado`
            );
          }
          // Página nunca abriu = provável bloqueio (captcha/rede); abriu mas não
          // rendeu galeria = produto sem material. São causas diferentes e pedem
          // ações opostas: uma repete, a outra não vale repetir.
          if (erroNavegador) {
            registar(reqId, "erro", `navegador: ${erroNavegador}`.slice(0, 300));
          } else if (stats.visited < 1) {
            registar(reqId, "captcha", "a PDP não abriu — verificação de segurança ou bloqueio");
          } else {
            registar(reqId, "sem_galeria", "a PDP abriu mas não devolveu galeria utilizável");
          }
          continue;
        }
        for (const idx of indices) {
          try {
            itens[idx] = mergePdpIntoItem(itens[idx], clean, true);
            if (
              enrichedOk &&
              pdpUrl &&
              typeof itens[idx] === "object" &&
              itens[idx].link_produto !== pdpUrl
            ) {
              itens[idx].link_produto = pdpUrl;
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[pdp:enrich] product_id=${reqId} idx=${idx}: ${(e && e.message) || e}`);
          }
        }

        registar(reqId, "ok");
        // eslint-disable-next-line no-console
        console.log(`[pdp:enrich] OK product_id=${reqId} (${indices.length} linha(s) em itens[])`);
      }
    } finally {
      await browser.close().catch(() => {});
    }

    // Grava o estado de cada tentativa — inclusive as falhadas. É o que permite
    // ver "este produto nunca enriquece, e porquê" em vez de o retentar sempre.
    for (const [pid, r] of resultadoPorProduto) {
      try {
        await prisma.product.updateMany({
          where: { productId: pid },
          data: {
            enrichStatus: r.status,
            enrichCheckedAt: new Date(),
            enrichNote: r.nota || null
          }
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[pdp:enrich] não consegui gravar o estado de ${pid}: ${(e && e.message) || e}`);
      }
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  payload.coletado_em = new Date().toISOString();

  await writeFile(DADOS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[pdp:enrich] Gravado ${DADOS_PATH}`);

  // Resumo + código de saída honesto. Antes, um produto que não enriquecia
  // terminava com exit 0 e a interface anunciava sucesso: o utilizador só
  // descobria ao ver que as fotos eram as mesmas de antes.
  const resultados = [...resultadoPorProduto.values()];
  const okCount = resultados.filter((r) => r.status === "ok").length;
  const falhas = resultados.filter((r) => r.status !== "ok");
  // eslint-disable-next-line no-console
  console.log(`[pdp:enrich] resumo: ${okCount} enriquecido(s), ${falhas.length} falha(s) de ${idsArg.length} pedido(s)`);
  for (const [pid, r] of resultadoPorProduto) {
    if (r.status !== "ok") {
      // eslint-disable-next-line no-console
      console.log(`  • ${pid}: ${r.status} — ${r.nota}`);
    }
  }
  // Nada enriquecido quando havia trabalho a fazer é falha, não sucesso.
  return okCount === 0 && idsArg.length > 0 ? 4 : 0;
}

main()
  .then((code) => {
    process.exit(typeof code === "number" ? code : 0);
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
