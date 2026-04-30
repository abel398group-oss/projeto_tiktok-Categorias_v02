/**
 * Detalhe de produto para a página «workspace» (último ScrapeRun, mesmo score que product-score).
 */
import { extractOrderedImageUrls } from "../../lib/extract-image-urls.mjs";
import {
  buildProductExportPrefix,
  deriveCategorySlugFromUrl,
  DEFAULT_PLATFORM,
  resolvedExportRoot
} from "../../lib/spaces-export-paths.mjs";
import { getLatestAndPreviousRun } from "../_common.mjs";
import { computeProductScoreLine } from "./product-score.mjs";

const MAX_PREVIEW_IMAGES = 24;

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} tiktokProductId
 */
export async function getProductWorkspaceDetail(prisma, tiktokProductId) {
  const idTrim = typeof tiktokProductId === "string" ? tiktokProductId.trim() : "";
  if (!idTrim) {
    return { error: "bad_request", message: "productId vazio." };
  }

  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);
  if (!latest) {
    return { error: "no_run", message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)." };
  }

  const product = await prisma.product.findUnique({
    where: { productId: idTrim },
    include: {
      seller: true,
      snapshots: {
        where: { scrapeRunId: latest.id },
        orderBy: { capturedAt: "desc" },
        take: 1
      }
    }
  });

  if (!product) {
    return { error: "not_found", message: `Produto não encontrado: productId=${idTrim}` };
  }

  const snap = product.snapshots[0];
  if (!snap) {
    return {
      error: "no_snapshot",
      message: "Este produto não tem snapshot no último ScrapeRun (última importação)."
    };
  }

  const prevPorRef = new Map();
  if (count >= 2 && previous) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: previous.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) {
      prevPorRef.set(ps.productRefId, ps.salesCount);
    }
  }

  const ctx = { prevPorRef, count, previous };

  const s = {
    ...snap,
    product: {
      name: product.name,
      productId: product.productId,
      productUrl: product.productUrl,
      seller: product.seller
    }
  };

  const line = computeProductScoreLine(s, ctx);
  const imageUrls = extractOrderedImageUrls(snap).slice(0, MAX_PREVIEW_IMAGES);

  /** @type {string | null} */
  let deltaHint = null;
  if (line.deltaVendas === "—") {
    if (count < 2 || previous == null) {
      deltaHint = "Δ vendas: são precisos pelo menos dois ScrapeRuns e vendas registadas nos dois para comparar.";
    } else {
      deltaHint =
        "Δ vendas indisponível: vendas em falta no run anterior para este produto (ou apenas neste snapshot).";
    }
  }

  const categorySlug = deriveCategorySlugFromUrl(product.categoryUrl);
  const exportRoot = resolvedExportRoot();
  const exportPrefix = buildProductExportPrefix({
    root: exportRoot,
    platform: process.env.SPACES_EXPORT_PLATFORM?.trim() || DEFAULT_PLATFORM,
    categorySlug,
    productName: product.name,
    productId: product.productId
  });

  /** @param {unknown} j */
  const jsonSnippet = (j) => (j != null && typeof j === "object" ? j : null);

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    previousRun:
      previous != null
        ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() }
        : null,
    hasGrowthComparableRuns: count >= 2 && previous != null,
    productId: product.productId,
    nome: (product.name ?? "—").trim() || "—",
    nomeLista: line.nome,
    loja: line.loja,
    score: line.score,
    classific: line.classific,
    preco: line.preco,
    vendas: line.vendas,
    rating: line.rating,
    deltaVendas: line.deltaVendas,
    deltaHint,
    motivos: line.motivos,
    link: line.link,
    categoryUrl: product.categoryUrl ?? null,
    categorySlug,
    exportPrefix: `${exportPrefix}/`,
    imageUrls,

    currency: product.currency ?? null,
    sourcePlatform: product.sourcePlatform ?? null,
    firstSeenAt: product.firstSeenAt instanceof Date ? product.firstSeenAt.toISOString() : product.firstSeenAt ?? null,
    lastSeenAt: product.lastSeenAt instanceof Date ? product.lastSeenAt.toISOString() : product.lastSeenAt ?? null,

    sellerId: product.seller?.sellerId ?? null,
    sellerGlobalId: product.seller?.globalSellerId ?? null,

    snapshotCapturedAt:
      snap.capturedAt instanceof Date ? snap.capturedAt.toISOString() : String(snap.capturedAt ?? ""),

    originalPrice: snap.originalPrice ?? null,
    hasDiscount: snap.hasDiscount,
    estimatedShowcasePrice: snap.estimatedShowcasePrice ?? null,
    estimatedPriceGap: snap.estimatedPriceGap ?? null,
    estimatedPriceGapPercent: snap.estimatedPriceGapPercent ?? null,
    salesText: snap.salesText ?? null,
    ratingAverage: snap.ratingAverage ?? null,
    ratingTotal: snap.ratingTotal ?? null,
    votesByStar: jsonSnippet(snap.votesByStar),
    dataQuality: jsonSnippet(snap.dataQuality)
  };
}
