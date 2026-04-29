/**
 * Score de produto v1 — lógica partilhada CLI / API (não gravada na BD).
 */
import { getLatestAndPreviousRun } from "../_common.mjs";

const TOP_LIMIT = 30;

function pontosVendas(sc) {
  if (sc == null) return 0;
  if (sc >= 1000) return 35;
  if (sc >= 300) return 25;
  if (sc >= 100) return 15;
  if (sc >= 10) return 8;
  return 0;
}

/** @param {number | null | undefined} avg @param {number | null | undefined} tot */
function pontosAvaliacao(avg, tot) {
  if (avg == null || tot == null) return 0;
  if (avg >= 4.8 && tot >= 10) return 25;
  if (avg >= 4.5 && tot >= 5) return 18;
  if (avg >= 4.0 && tot >= 5) return 10;
  return 0;
}

/** @param {number | null | undefined} price */
function pontosPreco(price) {
  return price != null && Number(price) > 0 ? 10 : 0;
}

/** @param {boolean} hasDiscount */
function pontosDesconto(hasDiscount) {
  return hasDiscount ? 5 : 0;
}

/** @param {number | null | undefined} sc @param {number | null | undefined} avg @param {number | null | undefined} tot @param {number | null | undefined} price */
function pontosOportunidade(sc, avg, tot, price) {
  if (price == null || sc == null || avg == null || tot == null) return 0;
  if (sc >= 10 && sc <= 300 && avg >= 4.5 && tot >= 5) return 15;
  return 0;
}

/**
 * @param {number | null} delta
 * @param {boolean} podeCalcularDelta
 */
function pontosCrescimento(delta, podeCalcularDelta) {
  if (!podeCalcularDelta || delta == null) return { pts: 0, delta: null };
  if (delta > 100) return { pts: 10, delta };
  if (delta > 30) return { pts: 6, delta };
  if (delta > 0) return { pts: 3, delta };
  return { pts: 0, delta };
}

export function rotuloScore(score) {
  if (score >= 80) return "excelente";
  if (score >= 60) return "bom";
  if (score >= 40) return "observar";
  return "fraco";
}

/** @param {object} opts */
function motivosLista(opts) {
  const list = [];
  const { sc, vPts, rPts, oPts } = opts;
  if (typeof sc === "number") {
    if (vPts >= 15) list.push("vendas fortes");
    else if (vPts >= 8) list.push("tração de vendas");
  }

  if (rPts >= 18) list.push("boa avaliação");
  else if (rPts >= 10) list.push("avaliação ok");

  if (opts.pPts > 0) list.push("preço válido");
  if (opts.dPts > 0) list.push("desconto ativo");
  if (oPts === 15) list.push("oportunidade: baixa venda + boa avaliação");

  if (opts.semBaseGrowth) list.push("sem base de crescimento");
  else if (opts.gPts > 0 && opts.podeDelta) list.push("crescimento positivo");

  return list;
}

/**
 * Uma linha de score (mesma fórmula que o relatório product-score) — para reutilizar em agregações (ex.: mapa de categoria).
 *
 * @param {*} s ProductSnapshot com `product` (e `seller` opcional)
 * @param {{ prevPorRef: Map<string, number | null | undefined>, count: number, previous: { id: string } | null }} ctx
 */
export function computeProductScoreLine(s, ctx) {
  const { prevPorRef, count, previous } = ctx;
  const sc = s.salesCount;
  const avg = s.ratingAverage;
  const tot = s.ratingTotal;

  const vPts = pontosVendas(sc);
  const rPts = pontosAvaliacao(avg, tot);
  const pPts = pontosPreco(s.price);
  const dPts = pontosDesconto(s.hasDiscount);
  const oPts = pontosOportunidade(sc, avg, tot, s.price);

  const prevSale = prevPorRef.get(s.productRefId);
  const podeDelta = count >= 2 && previous != null && sc != null && prevSale != null;

  const delta = podeDelta ? sc - prevSale : null;

  let semBaseGrowth = false;
  if (count < 2 || !previous) {
    semBaseGrowth = true;
  } else if (!podeDelta) {
    semBaseGrowth = true;
  } else if (delta == null || Number.isNaN(delta)) {
    semBaseGrowth = true;
  } else {
    semBaseGrowth = false;
  }

  const { pts: gPts } = pontosCrescimento(delta ?? null, Boolean(podeDelta));

  let totalPts = vPts + rPts + pPts + dPts + oPts + gPts;
  if (totalPts > 100) totalPts = 100;

  const motivosStr = motivosLista({
    sc,
    vPts,
    rPts,
    pPts,
    dPts,
    oPts,
    gPts,
    semBaseGrowth,
    podeDelta: Boolean(podeDelta)
  }).join("; ");

  const ratingStr =
    avg != null ? `${avg}${typeof tot === "number" ? ` (${tot} aval)` : ""}` : "";

  return {
    score: totalPts,
    classific: rotuloScore(totalPts),
    nome: (s.product.name ?? "—").slice(0, 40),
    loja: (s.product.seller?.name ?? "—").slice(0, 24),
    preco: s.price ?? "",
    vendas: sc ?? "",
    rating: ratingStr,
    deltaVendas: podeDelta && delta != null ? String(delta) : "—",
    motivos: motivosStr,
    link: s.product.productUrl ?? "",
    productId: s.product.productId,
    /** @type {number | null} */
    ratingAverage: avg ?? null,
    /** @type {number | null} */
    deltaNumeric: delta,
    isOpportunityV1: oPts === 15
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getProductScoreReport(prisma) {
  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      previousRun: null,
      top: [],
      totalSnapshotsInLatestRun: 0,
      message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)."
    };
  }

  const prevPorRef = new Map();
  if (count >= 2 && previous) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: previous.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) prevPorRef.set(ps.productRefId, ps.salesCount);
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: { scrapeRunId: latest.id },
    include: {
      product: { include: { seller: true } }
    }
  });

  if (snaps.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      previousRun: previous
        ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() }
        : null,
      top: [],
      totalSnapshotsInLatestRun: 0,
      message: "Último ScrapeRun sem ProductSnapshot."
    };
  }

  const ctx = { prevPorRef, count, previous };
  const linhas = [];

  for (const s of snaps) {
    const line = computeProductScoreLine(s, ctx);
    linhas.push({
      score: line.score,
      classific: line.classific,
      nome: line.nome,
      loja: line.loja,
      preco: line.preco,
      vendas: line.vendas,
      rating: line.rating,
      deltaVendas: line.deltaVendas,
      motivos: line.motivos,
      link: line.link,
      productId: line.productId
    });
  }

  linhas.sort((a, b) => b.score - a.score);
  const top = linhas.slice(0, TOP_LIMIT);

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    previousRun: previous
      ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() }
      : null,
    hasGrowthComparableRuns: !!(count >= 2 && previous),
    top,
    totalSnapshotsInLatestRun: snaps.length,
    listedTop: top.length,
    maxListed: TOP_LIMIT,
    noteFaixas: "excelente ≥80 · bom ≥60 · observar ≥40 · fraco <40 (docs/ANALYTICS.md)."
  };
}
