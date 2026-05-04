/**
 * Importa `output/dados_produtos.json` (+ opcional `dados_lojas.json`) para Postgres (Prisma).
 * Identidade: upsert (Seller, Product). Histórico: novos registos (snapshots + RawPayload).
 * Não altera nem recalcula campos; apenas mapeia valores do JSON.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DADOS_PRODUTOS = path.join(root, "output", "dados_produtos.json");
const DADOS_LOJAS = path.join(root, "output", "dados_lojas.json");

let prisma;

function requireEnv() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env e configure a ligação ao Postgres."
    );
  }
}

async function fileExists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function parseDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Data inválida: ${iso}`);
  }
  return d;
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

function toJson(v) {
  if (v === undefined) {
    return null;
  }
  return v;
}

/** Concatenação determinística para import idempotente (SHA-256). */
function computeInputHash(produtosText, lojasTextOrAbsent) {
  const boundary = "\n---IMPORT_INPUT_HASH_V1---\n";
  const body = produtosText + boundary + lojasTextOrAbsent;
  return createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
}

/**
 * IMPORT_RUN_TYPE opcional: quick_scrape | pdp_enrich | unknown (por defeito quick_scrape neste importador).
 * @returns {"quick_scrape" | "pdp_enrich" | "unknown"}
 */
function resolveImportRunType() {
  const v = process.env.IMPORT_RUN_TYPE?.trim().toLowerCase();
  if (v === "pdp_enrich") return "pdp_enrich";
  if (v === "unknown") return "unknown";
  if (v === "quick_scrape" || v === "") return "quick_scrape";
  return "quick_scrape";
}

/**
 * @param {import("@prisma/client").PrismaClient} client
 */
async function importMain() {
  requireEnv();
  if (!(await fileExists(DADOS_PRODUTOS))) {
    throw new Error(
      `Ficheiro em falta: ${path.relative(root, DADOS_PRODUTOS)}. Gere a coleta antes (ex. npm run coleta).`
    );
  }

  const produtosText = await readFile(DADOS_PRODUTOS, "utf8");
  const lojasTextOrAbsent = (await fileExists(DADOS_LOJAS))
    ? await readFile(DADOS_LOJAS, "utf8")
    : "__NO_DADOS_LOJAS_FILE__";
  const inputHash = computeInputHash(produtosText, lojasTextOrAbsent);

  prisma = new PrismaClient();
  const jaImportado = await prisma.scrapeRun.findFirst({
    where: { inputHash },
    select: { id: true }
  });
  if (jaImportado) {
    console.log("Importação ignorada: este output já foi importado.");
    console.log("(ScrapeRun existente:", jaImportado.id, "| inputHash:", inputHash + ")");
    return;
  }

  const dadosProdutos = JSON.parse(produtosText);
  const itens = Array.isArray(dadosProdutos.itens) ? dadosProdutos.itens : [];

  let dadosLojas = null;
  if (await fileExists(DADOS_LOJAS)) {
    dadosLojas = JSON.parse(lojasTextOrAbsent);
  }

  const t = parseDate(dadosProdutos.coletado_em);
  const status = String(dadosProdutos.status ?? "ok");
  const categoriaUrl = dadosProdutos.categoria_url != null ? String(dadosProdutos.categoria_url) : null;
  const finalUrl = dadosProdutos.final_url != null ? String(dadosProdutos.final_url) : null;
  const total = typeof dadosProdutos.total === "number" ? dadosProdutos.total : itens.length;
  const filtro = dadosProdutos.filtro != null ? String(dadosProdutos.filtro) : null;

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      collectedAt: t,
      sourcePlatform: "tiktok_shop",
      status,
      categoryUrl: categoriaUrl,
      finalUrl: finalUrl,
      totalProducts: total,
      filterDescription: filtro,
      runType: resolveImportRunType(),
      inputHash
    }
  });
  const scrapeRunId = scrapeRun.id;

  const lojasArr =
    dadosLojas && Array.isArray(dadosLojas.lojas) ? dadosLojas.lojas : [];

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
  const uniqueSellerCount = new Set([...lojasArr.map((l) => l.seller_id), ...uniqueSellerFromItems])
    .size;

  let productsUpserted = 0;
  let productSnapshotsCreated = 0;

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

    const row = await prisma.product.upsert({
      where: { productId },
      create: {
        productId,
        name: item.nome ?? null,
        productUrl: item.link_produto ?? null,
        categoryUrl: item.categoria_url ?? null,
        currency: item.moeda ?? null,
        sellerRefId,
        firstSeenAt: t,
        lastSeenAt: t
      },
      update: {
        name: item.nome ?? null,
        productUrl: item.link_produto ?? null,
        categoryUrl: item.categoria_url ?? null,
        currency: item.moeda ?? null,
        sellerRefId,
        lastSeenAt: t
      }
    });
    productsUpserted++;

    /** Regressão: JSON com fotos:null e fotos_pdp preenchido (subtract total) gravava BD sem imagens. */
    const snapshotImages =
      Array.isArray(item.fotos) && item.fotos.length > 0
        ? item.fotos
        : Array.isArray(item.fotos_pdp) && item.fotos_pdp.length > 0
          ? item.fotos_pdp
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
        dataQuality: null,
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
  const envelope = {
    imported_at: importedAt,
    dados_produtos: dadosProdutos,
    dados_lojas: dadosLojas
  };
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

  console.log("--- Resumo importação ---");
  console.log("scrapeRunId:", scrapeRunId);
  console.log("produtos (itens) processados (upsert):", productsUpserted);
  console.log("vendedores únicos (IDs distintos no JSON):", uniqueSellerCount);
  console.log("productSnapshots criados:", productSnapshotsCreated);
  console.log("sellerSnapshots criados:", sellerSnapshotsCreated);
  console.log("rawPayload id:", raw.id);
  console.log("-------------------------");
}

try {
  await importMain();
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = 1;
} finally {
  if (prisma) {
    await prisma.$disconnect();
  }
}
