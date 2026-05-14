/**
 * Score de produto v1 — lógica partilhada CLI / API (não gravada na BD).
 *
 * Com `categoryUrl`: por produto na categoria, usa-se o snapshot cujo run tem o maior
 * `ScrapeRun.collected_at` (empate em `run.id`), como em Top Products / Opportunities;
 * o crescimento comparado ao run anterior global e `computeProductScoreLine` mantêm‑se iguais.
 */
import { getLatestAndPreviousRun } from "../_common.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { parseCategory } from "./parse-category.mjs";
import { hasAtLeastHttpPdpImages } from "../../lib/extract-image-urls.mjs";

const TOP_LIMIT = 30;

/** @param {ReturnType<typeof computeProductScoreLine>} line */
function toReportShape(line) {
  return {
    score: line.score,
    classific: line.classific,
    nome: line.nome,
    categoriaPrincipal: line.categoriaPrincipal ?? "—",
    subcategoria: line.subcategoria ?? "—",
    loja: line.loja,
    preco: line.preco,
    vendas: line.vendas,
    rating: line.rating,
    deltaVendas: line.deltaVendas,
    motivos: line.motivos,
    link: line.link,
    enriched: Boolean(line.enriched),
    productId: line.productId
  };
}

/**
 * Todas as linhas de score do último run (ordenado score descendente), antes do TOP_LIMIT do relatório geral.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 */
async function buildLatestRunScoreRows(prisma) {
  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return { type: "no-run", message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)." };
  }

  const scrapeRunPayload = {
    id: latest.id,
    collectedAt: latest.collectedAt.toISOString()
  };
  const previousPayload = previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null;
  const hasGrowthComparableRuns = !!(count >= 2 && previous);

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
      type: "empty-snaps",
      scrapeRun: scrapeRunPayload,
      previousRun: previousPayload,
      hasGrowthComparableRuns,
      message: "Último ScrapeRun sem ProductSnapshot."
    };
  }

  const ctx = { prevPorRef, count, previous };
  const linhas = [];
  for (const s of snaps) {
    linhas.push(toReportShape(computeProductScoreLine(s, ctx)));
  }
  linhas.sort((a, b) => b.score - a.score);

  return {
    type: "ok",
    scrapeRun: scrapeRunPayload,
    previousRun: previousPayload,
    hasGrowthComparableRuns,
    lines: linhas,
    totalSnapshotsInLatestRun: snaps.length
  };
}

/**
 * @param {Array<import("@prisma/client").ProductSnapshot & { scrapeRun?: { id: string, collectedAt: Date } | null }>} snaps
 * @returns {Map<string, (typeof snaps)[number]>}
 */
function pickLatestSnapshotPerProductRef(snaps) {
  /** @type {Map<string, (typeof snaps)[number]>} */
  const bestByProductRef = new Map();
  for (const s of snaps) {
    const ct = s.scrapeRun?.collectedAt ? new Date(s.scrapeRun.collectedAt).getTime() : 0;
    const rid = s.scrapeRun?.id ?? "";
    const prev = bestByProductRef.get(s.productRefId);
    if (!prev) {
      bestByProductRef.set(s.productRefId, s);
      continue;
    }
    const pCt = prev.scrapeRun?.collectedAt ? new Date(prev.scrapeRun.collectedAt).getTime() : 0;
    const pRid = prev.scrapeRun?.id ?? "";
    if (ct > pCt || (ct === pCt && rid && pRid && rid.localeCompare(pRid) < 0)) {
      bestByProductRef.set(s.productRefId, s);
    }
  }
  return bestByProductRef;
}

/**
 * Snapshots mais recentes por produto (`ScrapeRun.collected_at`; empate em `run.id`) numa categoria já normalizada —
 * mesmo critério que Product Score/Escalar por `categoryUrl`. Consumidores chamam `computeProductScoreLine(s, ctx)`.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} filterKey — `normalizeCategoryKey` já aplicado
 */
export async function fetchSnapshotsWithScoreCtxForNormalizedCategory(prisma, filterKey) {
  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      ok: false,
      type: "no-run",
      message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)."
    };
  }

  const scrapeRun = {
    id: latest.id,
    collectedAt: latest.collectedAt.toISOString()
  };
  const previousRun = previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null;
  const hasGrowthComparableRuns = !!(count >= 2 && previous);

  const prevPorRef = new Map();
  if (count >= 2 && previous) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: previous.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) prevPorRef.set(ps.productRefId, ps.salesCount);
  }

  const products = await prisma.product.findMany({
    where: { categoryUrl: { not: null } },
    select: { id: true, categoryUrl: true }
  });
  const inCategoryIds = products
    .filter((p) => p.categoryUrl != null && normalizeCategoryKey(p.categoryUrl) === filterKey)
    .map((p) => p.id);

  if (inCategoryIds.length === 0) {
    return {
      ok: false,
      type: "empty-category",
      scrapeRun,
      previousRun,
      hasGrowthComparableRuns,
      categoryUrlFilter: filterKey,
      message: `Nenhum produto encontrado para categoria (${filterKey}).`
    };
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: { productRefId: { in: inCategoryIds } },
    include: {
      product: { include: { seller: true } },
      scrapeRun: { select: { id: true, collectedAt: true } }
    }
  });

  if (snaps.length === 0) {
    return {
      ok: false,
      type: "empty-snaps-category",
      scrapeRun,
      previousRun,
      hasGrowthComparableRuns,
      categoryUrlFilter: filterKey,
      message: `Nenhum snapshot para produtos desta categoria (${filterKey}).`
    };
  }

  const bestByProductRef = pickLatestSnapshotPerProductRef(snaps);
  const snapshots = [...bestByProductRef.values()];
  const ctx = { prevPorRef, count, previous };

  return {
    ok: true,
    snapshots,
    ctx,
    scrapeRun,
    previousRun,
    hasGrowthComparableRuns,
    categoryUrlFilter: filterKey
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} filterKey — `normalizeCategoryKey` já aplicado
 */
async function buildCategoryScoreRows(prisma, filterKey) {
  const r = await fetchSnapshotsWithScoreCtxForNormalizedCategory(prisma, filterKey);
  if (!r.ok) {
    if (r.type === "no-run") {
      return { type: "no-run", message: r.message };
    }
    if (r.type === "empty-category") {
      return {
        type: "empty-category",
        scrapeRun: r.scrapeRun,
        previousRun: r.previousRun,
        hasGrowthComparableRuns: r.hasGrowthComparableRuns,
        categoryUrlFilter: r.categoryUrlFilter,
        message: r.message
      };
    }
    return {
      type: "empty-snaps-category",
      scrapeRun: r.scrapeRun,
      previousRun: r.previousRun,
      hasGrowthComparableRuns: r.hasGrowthComparableRuns,
      categoryUrlFilter: r.categoryUrlFilter,
      message: r.message
    };
  }

  const linhas = [];
  for (const s of r.snapshots) {
    linhas.push(toReportShape(computeProductScoreLine(s, r.ctx)));
  }
  linhas.sort((a, b) => b.score - a.score);

  return {
    type: "ok",
    scrapeRun: r.scrapeRun,
    previousRun: r.previousRun,
    hasGrowthComparableRuns: r.hasGrowthComparableRuns,
    lines: linhas,
    totalSnapshotsInLatestRun: linhas.length,
    categoryUrlFilter: r.categoryUrlFilter
  };
}

/**
 * Todas as linhas pontuadas (score v1; sem limite 30 — ex.: relatório Escalar).
 * Sem opts: último ScrapeRun global. Com `{ categoryUrl }`: mesmo universo e snapshot mais recente
 * por produto que Product Score por categoria (`buildCategoryScoreRows`).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string }} [opts]
 */
export async function getProductScoreFull(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";

  let b;

  if (!rawCat) {
    b = await buildLatestRunScoreRows(prisma);
  } else {
    const filterKey = normalizeCategoryKey(rawCat);
    const { latest, previous, count } = await getLatestAndPreviousRun(prisma);
    if (!filterKey) {
      return {
        scrapeRun: latest
          ? { id: latest.id, collectedAt: latest.collectedAt.toISOString() }
          : null,
        previousRun: previous
          ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() }
          : null,
        hasGrowthComparableRuns: !!(count >= 2 && previous),
        lines: [],
        totalSnapshotsInLatestRun: 0,
        categoryUrlFilter: filterKey,
        message: "categoryUrl normalizado ficou vazio — confirme a URL da categoria."
      };
    }
    b = await buildCategoryScoreRows(prisma, filterKey);
  }

  if (b.type === "no-run") {
    return {
      scrapeRun: null,
      previousRun: null,
      hasGrowthComparableRuns: false,
      lines: [],
      totalSnapshotsInLatestRun: 0,
      message: b.message
    };
  }
  if (b.type === "empty-snaps") {
    return {
      scrapeRun: b.scrapeRun,
      previousRun: b.previousRun,
      hasGrowthComparableRuns: b.hasGrowthComparableRuns,
      lines: [],
      totalSnapshotsInLatestRun: 0,
      message: b.message
    };
  }
  if (b.type === "empty-category") {
    return {
      scrapeRun: b.scrapeRun,
      previousRun: b.previousRun,
      hasGrowthComparableRuns: b.hasGrowthComparableRuns,
      lines: [],
      totalSnapshotsInLatestRun: 0,
      categoryUrlFilter: b.categoryUrlFilter,
      message: b.message
    };
  }
  if (b.type === "empty-snaps-category") {
    return {
      scrapeRun: b.scrapeRun,
      previousRun: b.previousRun,
      hasGrowthComparableRuns: b.hasGrowthComparableRuns,
      lines: [],
      totalSnapshotsInLatestRun: 0,
      categoryUrlFilter: b.categoryUrlFilter,
      message: b.message
    };
  }
  const base = {
    scrapeRun: b.scrapeRun,
    previousRun: b.previousRun,
    hasGrowthComparableRuns: b.hasGrowthComparableRuns,
    lines: b.lines,
    totalSnapshotsInLatestRun: b.totalSnapshotsInLatestRun,
    scoredCount: b.lines.length
  };
  if (b.categoryUrlFilter != null) {
    base.categoryUrlFilter = b.categoryUrlFilter;
  }
  return base;
}

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

  const { masterCategory: categoriaPrincipal, subcategory: subcategoria } = parseCategory(s.product?.categoryUrl);
  const enriched =
    s?.dataQuality &&
    typeof s.dataQuality === "object" &&
    s.dataQuality.enrichment &&
    typeof s.dataQuality.enrichment === "object" &&
    s.dataQuality.enrichment.status === "enriched"
      ? true
      : hasAtLeastHttpPdpImages(s, 3);

  return {
    score: totalPts,
    classific: rotuloScore(totalPts),
    nome: (s.product.name ?? "—").slice(0, 40),
    categoriaPrincipal,
    subcategoria,
    loja: (s.product.seller?.name ?? "—").slice(0, 24),
    preco: s.price ?? "",
    vendas: sc ?? "",
    rating: ratingStr,
    deltaVendas: podeDelta && delta != null ? String(delta) : "—",
    motivos: motivosStr,
    link: s.product.productUrl ?? "",
    enriched,
    productId: s.product.productId,
    /** @type {number | null} */
    ratingAverage: avg ?? null,
    /** @type {number | null} */
    deltaNumeric: delta,
    isOpportunityV1: oPts === 15
  };
}

/**
 * Product Score (lista “top”) — formato HTTP/CLI habitual; até TOP_LIMIT produtos ordenados por score descendente.
 * Internamente reutiliza o mesmo conjunto de linhas que `getProductScoreFull` (todas antes do slice).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string }} [opts]
 */
export async function getProductScoreReport(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";

  let b;

  if (!rawCat) {
    b = await buildLatestRunScoreRows(prisma);
  } else {
    const filterKey = normalizeCategoryKey(rawCat);
    const { latest, previous } = await getLatestAndPreviousRun(prisma);
    if (!filterKey) {
      return {
        scrapeRun: latest
          ? { id: latest.id, collectedAt: latest.collectedAt.toISOString() }
          : null,
        previousRun: previous
          ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() }
          : null,
        top: [],
        totalSnapshotsInLatestRun: 0,
        categoryUrlFilter: filterKey,
        message: "categoryUrl normalizado ficou vazio — confirme a URL da categoria."
      };
    }
    b = await buildCategoryScoreRows(prisma, filterKey);
  }

  if (b.type === "no-run") {
    return {
      scrapeRun: null,
      previousRun: null,
      top: [],
      totalSnapshotsInLatestRun: 0,
      message: b.message
    };
  }
  if (b.type === "empty-snaps") {
    return {
      scrapeRun: b.scrapeRun,
      previousRun: b.previousRun,
      top: [],
      totalSnapshotsInLatestRun: 0,
      message: b.message
    };
  }
  if (b.type === "empty-category") {
    return {
      scrapeRun: b.scrapeRun,
      previousRun: b.previousRun,
      top: [],
      totalSnapshotsInLatestRun: 0,
      categoryUrlFilter: b.categoryUrlFilter,
      message: b.message
    };
  }
  if (b.type === "empty-snaps-category") {
    return {
      scrapeRun: b.scrapeRun,
      previousRun: b.previousRun,
      top: [],
      totalSnapshotsInLatestRun: 0,
      categoryUrlFilter: b.categoryUrlFilter,
      message: b.message
    };
  }
  const top = b.lines.slice(0, TOP_LIMIT);
  const base = {
    scrapeRun: b.scrapeRun,
    previousRun: b.previousRun,
    hasGrowthComparableRuns: b.hasGrowthComparableRuns,
    top,
    totalSnapshotsInLatestRun: b.totalSnapshotsInLatestRun,
    listedTop: top.length,
    maxListed: TOP_LIMIT,
    noteFaixas: "excelente ≥80 · bom ≥60 · observar ≥40 · fraco <40 (docs/ANALYTICS.md)."
  };
  if (b.categoryUrlFilter != null) {
    base.categoryUrlFilter = b.categoryUrlFilter;
  }
  return base;
}
