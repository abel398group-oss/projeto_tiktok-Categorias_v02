/**
 * Detalhe de produto para a página «workspace».
 * Preferência: snapshot no **último** ScrapeRun global (alinha ao product-score na faixa principal).
 * Se não existir nesse run (produto aparece só noutras importações ou em visão por categoria), usa o
 * **snapshot mais recente** do mesmo produto.
 */
import { extractOrderedImageUrls, hasAtLeastHttpPdpImages } from "../../lib/extract-image-urls.mjs";
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

  /** @type {import("@prisma/client").ProductSnapshot | null} */
  let snap = product.snapshots[0] ?? null;
  /** Coleta a que o `snap` pertence (para metadados da resposta). */
  let effectiveScrapeRun = latest;
  let snapshotFromLatestGlobalRun = true;

  if (!snap) {
    const fb = await prisma.productSnapshot.findFirst({
      where: { productRefId: product.id },
      orderBy: [{ scrapeRun: { collectedAt: "desc" } }, { capturedAt: "desc" }],
      include: {
        scrapeRun: { select: { id: true, collectedAt: true } }
      }
    });

    if (!fb) {
      return {
        error: "no_snapshot",
        message: "Este produto não tem nenhum snapshot na base (importe dados primeiro)."
      };
    }

    snap = fb;
    effectiveScrapeRun = fb.scrapeRun;
    snapshotFromLatestGlobalRun = false;
  }

  const prevPorRef = new Map();
  if (snapshotFromLatestGlobalRun && count >= 2 && previous) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: previous.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) {
      prevPorRef.set(ps.productRefId, ps.salesCount);
    }
  }

  const ctx = snapshotFromLatestGlobalRun
    ? { prevPorRef, count, previous }
    : { prevPorRef: new Map(), count: 0, previous: null };

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
  const hasPdpImages = (() => {
    const b = snap?.pdpImages;
    if (typeof b === "string") {
      return b.trim().startsWith("http");
    }
    if (Array.isArray(b)) {
      return b.some((x) => {
        if (typeof x === "string") return x.trim().startsWith("http");
        if (x && typeof x === "object" && typeof x.url === "string") return x.url.trim().startsWith("http");
        return false;
      });
    }
    return false;
  })();
  const enriched =
    snap?.dataQuality &&
    typeof snap.dataQuality === "object" &&
    snap.dataQuality.enrichment &&
    typeof snap.dataQuality.enrichment === "object" &&
    snap.dataQuality.enrichment.status === "enriched"
      ? true
      : hasAtLeastHttpPdpImages(snap, 3);

  /** @type {string | null} */
  let deltaHint = null;
  if (!snapshotFromLatestGlobalRun) {
    deltaHint =
      "Dados da coleta mais recente deste produto na base (neste momento não há snapshot dele no último import global). Δ vendas entre runs não aplicável.";
  } else if (line.deltaVendas === "—") {
    if (count < 2 || previous == null) {
      deltaHint = "Δ vendas: são precisos pelo menos dois ScrapeRuns e vendas registadas nos dois para comparar.";
    } else {
      deltaHint =
        "Δ vendas indisponível: vendas em falta no run anterior para este produto (ou apenas neste snapshot).";
    }
  }

  /** @param {unknown} j */
  const jsonSnippet = (j) => (j != null && typeof j === "object" ? j : null);

  const effCollected =
    effectiveScrapeRun.collectedAt instanceof Date
      ? effectiveScrapeRun.collectedAt.toISOString()
      : String(effectiveScrapeRun.collectedAt ?? "");

  return {
    scrapeRun: { id: effectiveScrapeRun.id, collectedAt: effCollected },
    globalLatestScrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    snapshotFromLatestGlobalRun,
    previousRun:
      snapshotFromLatestGlobalRun && previous != null
        ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() }
        : null,
    hasGrowthComparableRuns: snapshotFromLatestGlobalRun && count >= 2 && previous != null,
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
    imageUrls,
    hasPdpImages,
    enriched,

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
