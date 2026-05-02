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
import {
  enrichByProductIdWithPdpGallery,
  installAntiPopupGuards,
  launchTikTokBrowser,
  toDadosProdutoClean
} from "../src/scrapeCategory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DADOS_PATH = path.join(root, "output", "dados_produtos.json");

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

function parseIds(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--ids=")) {
      out.push(...a.slice(6).split(","));
      return out.map((s) => s.trim()).filter(Boolean);
    }
    if (a === "--ids" && argv[i + 1]) {
      const v = argv[i + 1];
      out.push(...String(v).split(","));
      return out.map((s) => s.trim()).filter(Boolean);
    }
  }
  const env = process.env.PDP_PRODUCT_IDS?.trim();
  if (env) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
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

  return next;
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

async function main() {
  const idsArg = parseIds(process.argv.slice(2));
  if (!idsArg.length) {
    // eslint-disable-next-line no-console
    console.error(
      "Indique product_id: npm run pdp:enrich -- --ids=123,456 ou env PDP_PRODUCT_IDS=123,456"
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

  const browser = await launchTikTokBrowser();
  const page = await browser.newPage();
  await installAntiPopupGuards(browser, page);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  });

  try {
    for (const reqIdRaw of idsArg) {
      const reqId = String(reqIdRaw).trim();
      const indices = idIndex.get(reqId);
      if (!indices?.length) {
        // eslint-disable-next-line no-console
        console.error(`[pdp:enrich] product_id=${reqId} não encontrado em itens[] — ignorado`);
        continue;
      }

      const baseIdx = indices[0];
      const item = itens[baseIdx];
      const categoriaUrl = item?.categoria_url != null ? String(item.categoria_url) : "";

      let pdpUrl = resolvePdpUrlForItem(item);
      if (!pdpUrl || !/\/pdp\//i.test(pdpUrl)) {
        // eslint-disable-next-line no-console
        console.error(`[pdp:enrich] product_id=${reqId}: URL PDP inválida — ignorado`);
        continue;
      }

      const n = jsonItemToNormalized(item, pdpUrl);
      const byProductId = new Map([[String(reqId), n]]);

      let stats = { visited: 0, max: 0, eligible: 0 };
      try {
        stats = await enrichByProductIdWithPdpGallery(browser, page, byProductId, {
          max: 1,
          categoriaUrl
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[pdp:enrich] product_id=${reqId} falhou (browser): ${(e && e.message) || e}`);
      }

      const enrichedOk = stats.visited >= 1 && stats.eligible >= 1;

      /** @type {object | null} */
      let clean = null;
      try {
        const after = byProductId.get(String(reqId));
        clean = toDadosProdutoClean(after, categoriaUrl);
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

      // eslint-disable-next-line no-console
      console.log(`[pdp:enrich] OK product_id=${reqId} (${indices.length} linha(s) em itens[])`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  payload.coletado_em = new Date().toISOString();

  await writeFile(DADOS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[pdp:enrich] Gravado ${DADOS_PATH}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
