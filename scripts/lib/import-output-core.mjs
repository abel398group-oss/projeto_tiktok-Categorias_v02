/**
 * Núcleo de importação JSON → Postgres (Prisma), partilhado por:
 * - `scripts/import-output-to-db.mjs` (CLI, lê ficheiros em `output/`)
 * - `POST /scrape/import-remote` (API, payload enviado pelo worker local)
 *
 * Não recalcula preço/vendas/merge — só mapeia campos do JSON.
 */
import { createHash } from "node:crypto";
import { hasAtLeastHttpPdpImages } from "./extract-image-urls.mjs";
import { nucleoDoTitulo, especieDoTitulo, rotuloCurto } from "../../src/scrape/nucleo.mjs";

/**
 * Concatenação determinística para import idempotente (SHA-256).
 * @param {string} produtosText
 * @param {string} lojasTextOrAbsent — conteúdo UTF-8 de `dados_lojas.json` ou sentinel `__NO_DADOS_LOJAS_FILE__`
 */
export function computeInputHash(produtosText, lojasTextOrAbsent) {
  const boundary = "\n---IMPORT_INPUT_HASH_V1---\n";
  const body = produtosText + boundary + lojasTextOrAbsent;
  return createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"quick_scrape" | "pdp_enrich" | "unknown"}
 */
export function resolveImportRunType(env = process.env) {
  const v = env.IMPORT_RUN_TYPE?.trim().toLowerCase();
  if (v === "pdp_enrich") return "pdp_enrich";
  if (v === "unknown") return "unknown";
  if (v === "quick_scrape" || v === "") return "quick_scrape";
  return "quick_scrape";
}

function toJson(v) {
  if (v === undefined) {
    return null;
  }
  return v;
}

function normalizeUrlForHash(url) {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw.split("?")[0].trim();
  }
}

export function computeEnrichmentBaseHashFromItem(item) {
  const nome = item?.nome != null ? String(item.nome).trim() : "";
  const sellerId = item?.seller_id != null ? String(item.seller_id).trim() : "";
  const price = item?.preco != null && item.preco !== "" ? String(item.preco) : "";
  const orig = item?.preco_original != null && item.preco_original !== "" ? String(item.preco_original) : "";
  const fotos = Array.isArray(item?.fotos) ? item.fotos : [];
  const imgs = [];
  const seen = new Set();
  for (const x of fotos) {
    if (typeof x !== "string") continue;
    const k = normalizeUrlForHash(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    imgs.push(k);
    if (imgs.length >= 3) break;
  }
  const body = `v1\n${nome}\n${sellerId}\n${price}\n${orig}\n${imgs.join("\n")}`;
  return createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
}

export function extractEnrichmentFromDataQuality(dataQuality) {
  if (!dataQuality || typeof dataQuality !== "object") return null;
  const e = dataQuality.enrichment;
  if (!e || typeof e !== "object") return null;
  const status = typeof e.status === "string" ? e.status : "";
  if (status !== "enriched") return null;
  const baseHash = typeof e.baseHash === "string" ? e.baseHash : "";
  const at = typeof e.at === "string" ? e.at : null;
  const source = typeof e.source === "string" ? e.source : "pdp";
  if (!baseHash) return null;
  return { status: "enriched", baseHash, ...(at ? { at } : {}), ...(source ? { source } : {}) };
}

/**
 * @param {import("@prisma/client").PrismaClient} client
 * @param {object} data - campos de loja no item produto
 */
async function upsertSellerFromProductRow(client, data) {
  const sid = data.seller_id;
  if (sid == null || sid === "") {
    return null;
  }
  return client.seller.upsert({
    where: { sellerId: String(sid) },
    create: {
      sellerId: String(sid),
      globalSellerId: data.global_seller_id != null ? String(data.global_seller_id) : null,
      name: data.nome_loja ?? null,
      logoUri: data.loja_logo_uri ?? null,
      logoUrls: toJson(data.loja_logo_urls)
    },
    update: {
      globalSellerId: data.global_seller_id != null ? String(data.global_seller_id) : null,
      name: data.nome_loja ?? null,
      logoUri: data.loja_logo_uri ?? null,
      logoUrls: toJson(data.loja_logo_urls)
    }
  });
}

/**
 * @param {import("@prisma/client").PrismaClient} client
 */
async function upsertSellerFromLojaRow(client, loja) {
  const sid = loja.seller_id;
  if (sid == null || sid === "") {
    return null;
  }
  return client.seller.upsert({
    where: { sellerId: String(sid) },
    create: {
      sellerId: String(sid),
      globalSellerId: loja.global_seller_id != null ? String(loja.global_seller_id) : null,
      name: loja.nome_loja ?? null,
      logoUri: loja.loja_logo_uri ?? null,
      logoUrls: toJson(loja.loja_logo_urls)
    },
    update: {
      globalSellerId: loja.global_seller_id != null ? String(loja.global_seller_id) : null,
      name: loja.nome_loja ?? null,
      logoUri: loja.loja_logo_uri ?? null,
      logoUrls: toJson(loja.loja_logo_urls)
    }
  });
}

function parseDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Data inválida: ${iso}`);
  }
  return d;
}

/**
 * Quantos envelopes brutos guardar. `0` desliga a poda.
 *
 * O envelope existe para permitir reprocessar sem recoletar do TikTok — e para
 * isso o que interessa é o passado RECENTE, não o histórico inteiro.
 */
export const MANTER_ENVELOPES = Number.isFinite(Number(process.env.RAW_PAYLOADS_MANTER))
  ? Number(process.env.RAW_PAYLOADS_MANTER)
  : 5;

/**
 * Apaga os envelopes mais antigos, mantendo os `MANTER_ENVELOPES` recentes.
 *
 * Motivo (medido em 23/08/2026 por `npm run db:inventario`): `raw_payloads`
 * tinha 60 linhas e **235 MB** — 27% da base inteira — e nenhum código lia
 * dela. Cada import junta ~4 MB. Guardar o histórico completo pagava o preço
 * de um caminho de reprocessamento que nunca foi escrito.
 *
 * Apagar aqui é seguro: `RawPayload` é o filho em todas as suas relações
 * (aponta para ScrapeRun/Product/Seller e ninguém aponta para ela), por isso
 * remover linha antiga não deixa referência órfã em lado nenhum.
 *
 * Erro na poda NÃO derruba o import: o dado que interessa já foi gravado, e
 * falhar a limpeza é problema de espaço, não de integridade.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @returns {Promise<number>} quantos foram removidos
 */
export async function podarEnvelopesAntigos(prisma) {
  if (!Number.isFinite(MANTER_ENVELOPES) || MANTER_ENVELOPES <= 0) return 0;
  try {
    const manter = await prisma.rawPayload.findMany({
      orderBy: { capturedAt: "desc" },
      take: MANTER_ENVELOPES,
      select: { id: true }
    });
    if (manter.length < MANTER_ENVELOPES) return 0;
    const { count } = await prisma.rawPayload.deleteMany({
      where: { id: { notIn: manter.map((r) => r.id) } }
    });
    return count;
  } catch (e) {
    console.warn(`[raw] poda de envelopes falhou (o import está OK): ${e?.message ?? e}`);
    return 0;
  }
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {object} opts
 * @param {string} opts.produtosText — conteúdo exacto de `dados_produtos.json` (UTF-8)
 * @param {string} opts.lojasTextOrAbsent — conteúdo exacto de `dados_lojas.json` ou `__NO_DADOS_LOJAS_FILE__`
 * @param {"quick_scrape" | "pdp_enrich" | "unknown"} [opts.runType] — se omitido, usa `resolveImportRunType()`
 * @param {Record<string, unknown>} [opts.rawPayloadExtra] — fundido em `worker_extra` no envelope `RawPayload`
 * @returns {Promise<{
 *   skipped: boolean,
 *   inputHash: string,
 *   scrapeRunId?: string,
 *   existingScrapeRunId?: string,
 *   productsUpserted?: number,
 *   productSnapshotsCreated?: number,
 *   sellerSnapshotsCreated?: number,
 *   rawPayloadId?: string,
 *   uniqueSellerCount?: number
 * }>}
 */
export async function importOutputFromStrings(prisma, opts) {
  const { produtosText, lojasTextOrAbsent, runType: runTypeOpt, rawPayloadExtra } = opts;

  const inputHash = computeInputHash(produtosText, lojasTextOrAbsent);

  const jaImportado = await prisma.scrapeRun.findFirst({
    where: { inputHash },
    select: { id: true }
  });
  if (jaImportado) {
    return {
      skipped: true,
      inputHash,
      existingScrapeRunId: jaImportado.id
    };
  }

  const dadosProdutos = JSON.parse(produtosText);
  const itens = Array.isArray(dadosProdutos.itens) ? dadosProdutos.itens : [];

  let dadosLojas = null;
  if (lojasTextOrAbsent !== "__NO_DADOS_LOJAS_FILE__") {
    dadosLojas = JSON.parse(lojasTextOrAbsent);
  }

  const t = parseDate(dadosProdutos.coletado_em);
  const status = String(dadosProdutos.status ?? "ok");
  const categoriaUrl = dadosProdutos.categoria_url != null ? String(dadosProdutos.categoria_url) : null;
  const finalUrl = dadosProdutos.final_url != null ? String(dadosProdutos.final_url) : null;
  const total = typeof dadosProdutos.total === "number" ? dadosProdutos.total : itens.length;
  const filtro = dadosProdutos.filtro != null ? String(dadosProdutos.filtro) : null;

  const runType = runTypeOpt ?? resolveImportRunType();

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      collectedAt: t,
      sourcePlatform: "tiktok_shop",
      status,
      categoryUrl: categoriaUrl,
      finalUrl: finalUrl,
      totalProducts: total,
      filterDescription: filtro,
      runType,
      inputHash
    }
  });
  const scrapeRunId = scrapeRun.id;

  const lojasArr = dadosLojas && Array.isArray(dadosLojas.lojas) ? dadosLojas.lojas : [];

  for (const loja of lojasArr) {
    await upsertSellerFromLojaRow(prisma, loja);
  }

  for (const item of itens) {
    if (item.seller_id) {
      await upsertSellerFromProductRow(prisma, item);
    }
  }

  const uniqueSellerFromItems = new Set(
    itens.map((i) => i.seller_id).filter((x) => x != null && x !== "")
  );
  const uniqueSellerCount = new Set([...lojasArr.map((l) => l.seller_id), ...uniqueSellerFromItems]).size;

  let productsUpserted = 0;
  let productSnapshotsCreated = 0;

  const prevEnrichmentByProductRefId = new Map();

  for (const item of itens) {
    const productId = item.product_id != null ? String(item.product_id) : null;
    if (!productId) {
      continue;
    }

    let sellerRefId = null;
    if (item.seller_id) {
      const s = await prisma.seller.findUnique({ where: { sellerId: String(item.seller_id) } });
      sellerRefId = s?.id ?? null;
    }

    /*
     * Núcleo, espécie e rótulo saem do título por regra pura (nucleo.mjs) —
     * sem rede, sem modelo. Derivados aqui, no import, porque é o único sítio
     * por onde todo produto passa: calcular na leitura repetiria o trabalho
     * a cada consulta, e um script à parte esqueceria os produtos novos.
     */
    const nucleo = nucleoDoTitulo(item.nome);
    const derivados = {
      nucleo,
      especie: nucleo ? especieDoTitulo(item.nome) : null,
      rotuloCurto: rotuloCurto(item.nome)
    };

    const row = await prisma.product.upsert({
      where: { productId },
      create: {
        productId,
        name: item.nome ?? null,
        productUrl: item.link_produto ?? null,
        categoryUrl: item.categoria_url ?? null,
        currency: item.moeda ?? null,
        sellerRefId,
        ...derivados,
        firstSeenAt: t,
        lastSeenAt: t
      },
      update: {
        name: item.nome ?? null,
        productUrl: item.link_produto ?? null,
        categoryUrl: item.categoria_url ?? null,
        currency: item.moeda ?? null,
        sellerRefId,
        ...derivados,
        lastSeenAt: t
      }
    });
    productsUpserted++;

    let prevEnrichment = prevEnrichmentByProductRefId.get(row.id) ?? null;
    if (prevEnrichment === undefined) {
      prevEnrichment = null;
    }
    if (prevEnrichmentByProductRefId.has(row.id) === false) {
      try {
        const prev = await prisma.productSnapshot.findFirst({
          where: { productRefId: row.id },
          orderBy: { capturedAt: "desc" },
          select: { dataQuality: true }
        });
        prevEnrichment = extractEnrichmentFromDataQuality(prev?.dataQuality ?? null);
      } catch {
        prevEnrichment = null;
      }
      prevEnrichmentByProductRefId.set(row.id, prevEnrichment);
    }

    const snapshotImages =
      Array.isArray(item.fotos) && item.fotos.length > 0
        ? item.fotos
        : Array.isArray(item.fotos_pdp) && item.fotos_pdp.length > 0
          ? item.fotos_pdp
          : null;

    const productDescription =
      typeof item.productDescription === "string" && item.productDescription.trim()
        ? item.productDescription.trim()
        : null;

    const baseHash = computeEnrichmentBaseHashFromItem(item);
    const isEnrichedNow = hasAtLeastHttpPdpImages({ pdpImages: item.fotos_pdp }, 3);
    const carry =
      !isEnrichedNow && prevEnrichment != null && typeof prevEnrichment.baseHash === "string"
        ? prevEnrichment.baseHash === baseHash
        : false;
    const enrichment = isEnrichedNow
      ? { status: "enriched", at: t.toISOString(), source: "pdp", baseHash }
      : carry
        ? prevEnrichment
        : null;

    const dataQuality =
      productDescription || enrichment
        ? { ...(productDescription ? { productDescription } : {}), ...(enrichment ? { enrichment } : {}) }
        : null;

    await prisma.productSnapshot.create({
      data: {
        capturedAt: t,
        price: item.preco ?? null,
        originalPrice: item.preco_original ?? null,
        hasDiscount: Boolean(item.tem_desconto),
        estimatedShowcasePrice: item.preco_estimado_vitrine ?? null,
        estimatedPriceGap: item.preco_gap_estimado ?? null,
        estimatedPriceGapPercent: item.preco_gap_estimado_percent ?? null,
        salesCount: item.vendas != null ? Math.trunc(Number(item.vendas)) : null,
        salesText: item.vendas_texto ?? null,
        ratingAverage: item.avaliacao_media ?? null,
        ratingTotal: item.avaliacoes_total != null ? Math.trunc(Number(item.avaliacoes_total)) : null,
        votesByStar: toJson(item.votos_por_estrela),
        images: toJson(snapshotImages),
        pdpImages: toJson(item.fotos_pdp),
        // Fotos de clientes nas avaliações — o único material da base com uma
        // pessoa real a usar o produto. Coluna à parte de `pdpImages` para a
        // interface as poder oferecer como escolha, em vez de entrarem sozinhas
        // no vídeo: é conteúdo de terceiros.
        reviewImages: toJson(item.fotos_review),
        dataQuality,
        productRefId: row.id,
        scrapeRunId
      }
    });
    productSnapshotsCreated++;
  }

  let sellerSnapshotsCreated = 0;
  if (lojasArr.length > 0) {
    for (const loja of lojasArr) {
      const seller = await prisma.seller.findUnique({
        where: { sellerId: String(loja.seller_id) }
      });
      if (!seller) {
        continue;
      }
      await prisma.sellerSnapshot.create({
        data: {
          capturedAt: t,
          totalSales: loja.loja_vendas_total != null ? Math.trunc(Number(loja.loja_vendas_total)) : null,
          activeProducts:
            loja.loja_produtos_ativos != null ? Math.trunc(Number(loja.loja_produtos_ativos)) : null,
          totalReviews: loja.loja_reviews_total != null ? Math.trunc(Number(loja.loja_reviews_total)) : null,
          followers: loja.loja_seguidores != null ? Math.trunc(Number(loja.loja_seguidores)) : null,
          videos: loja.loja_videos != null ? Math.trunc(Number(loja.loja_videos)) : null,
          enableFollow: loja.loja_enable_follow ?? null,
          dataQuality: null,
          sellerRefId: seller.id,
          scrapeRunId
        }
      });
      sellerSnapshotsCreated++;
    }
  } else {
    const bySeller = new Map();
    for (const item of itens) {
      if (item.seller_id && !bySeller.has(String(item.seller_id))) {
        bySeller.set(String(item.seller_id), item);
      }
    }
    for (const [_sid, rep] of bySeller) {
      const seller = await prisma.seller.findUnique({
        where: { sellerId: String(rep.seller_id) }
      });
      if (!seller) {
        continue;
      }
      await prisma.sellerSnapshot.create({
        data: {
          capturedAt: t,
          totalSales: rep.loja_vendas_total != null ? Math.trunc(Number(rep.loja_vendas_total)) : null,
          activeProducts:
            rep.loja_produtos_ativos != null ? Math.trunc(Number(rep.loja_produtos_ativos)) : null,
          totalReviews: rep.loja_reviews_total != null ? Math.trunc(Number(rep.loja_reviews_total)) : null,
          followers: rep.loja_seguidores != null ? Math.trunc(Number(rep.loja_seguidores)) : null,
          videos: rep.loja_videos != null ? Math.trunc(Number(rep.loja_videos)) : null,
          enableFollow: rep.loja_enable_follow ?? null,
          dataQuality: null,
          sellerRefId: seller.id,
          scrapeRunId
        }
      });
      sellerSnapshotsCreated++;
    }
  }

  const importedAt = new Date().toISOString();
  /** @type {Record<string, unknown>} */
  const envelope = {
    imported_at: importedAt,
    dados_produtos: dadosProdutos,
    dados_lojas: dadosLojas
  };
  if (rawPayloadExtra != null && typeof rawPayloadExtra === "object" && !Array.isArray(rawPayloadExtra)) {
    envelope.worker_extra = rawPayloadExtra;
  }

  const raw = await prisma.rawPayload.create({
    data: {
      scrapeRunId,
      payloadType: "consolidated_output",
      storageKind: "jsonb",
      storagePath: null,
      payloadJson: envelope,
      capturedAt: t,
      productRefId: null,
      sellerRefId: null
    }
  });

  const podados = await podarEnvelopesAntigos(prisma);
  if (podados > 0) {
    console.log(`[raw] ${podados} envelope(s) antigo(s) removido(s) — mantidos os ${MANTER_ENVELOPES} mais recentes.`);
  }

  return {
    skipped: false,
    inputHash,
    scrapeRunId,
    productsUpserted,
    productSnapshotsCreated,
    sellerSnapshotsCreated,
    rawPayloadId: raw.id,
    uniqueSellerCount
  };
}
