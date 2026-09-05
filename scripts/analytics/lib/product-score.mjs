/**
 * Score de produto v1 — lógica partilhada CLI / API (não gravada na BD).
 *
 * Com `categoryUrl`: por produto na categoria, usa-se o snapshot cujo run tem o maior
 * `ScrapeRun.collected_at` (empate em `run.id`), como em Top Products / Opportunities;
 * o crescimento comparado ao run anterior global e `computeProductScoreLine` mantêm‑se iguais.
 */
import { getLatestAndPreviousRun, getLatestAndBaselineRun } from "../_common.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { parseCategory } from "./parse-category.mjs";
import { hasAtLeastHttpPdpImages } from "../../lib/extract-image-urls.mjs";
import { SNAPSHOT_REPORT_SELECT, SNAPSHOT_REPORT_SELECT_WITH_RUN } from "./snapshot-select.mjs";
import { restricaoLigante } from "./restricao.mjs";
import {
  FAIXAS_VENDAS,
  FAIXAS_AVALIACAO,
  FAIXAS_CRESCIMENTO,
  FAIXAS_ROTULO,
  ROTULO_MINIMO,
  corte
} from "./score-parametros.mjs";

const TOP_LIMIT = 30;

/** @param {ReturnType<typeof computeProductScoreLine>} line */
function toReportShape(line) {
  return {
    score: line.score,
    classific: line.classific,
    confianca: line.confianca,
    confiancaPct: line.confiancaPct,
    faltando: line.faltando,
    restricaoLigante: line.restricaoLigante ?? null,
    rotuloRestricao: line.rotuloRestricao ?? null,
    gatilho: line.gatilho ?? null,
    nome: line.nome,
    categoriaPrincipal: line.categoriaPrincipal ?? "—",
    subcategoria: line.subcategoria ?? "—",
    loja: line.loja,
    preco: line.preco,
    vendas: line.vendas,
    rating: line.rating,
    deltaVendas: line.deltaVendas,
    // Ritmo + janela viajam juntos: sem saber em quantas horas foi medido, o
    // "vendas/dia" não diz se é medição firme ou palpite de uma janela curta.
    vendasPorDia: line.vendasPorDia ?? null,
    janelaHoras: line.janelaHoras ?? null,
    crescimentoMedido: Boolean(line.crescimentoMedido),
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
  // A base de comparação é o run mais recente suficientemente ATRÁS do último,
  // não o run imediatamente anterior: coletas seguidas ficam a minutos umas das
  // outras e a diferença de vendas nesse intervalo é sempre zero.
  const { latest, baseline, janelaHoras } = await getLatestAndBaselineRun(prisma);

  if (!latest) {
    return { type: "no-run", message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)." };
  }

  const previous = baseline;
  const count = baseline ? 2 : 1;

  const scrapeRunPayload = {
    id: latest.id,
    collectedAt: latest.collectedAt.toISOString()
  };
  const previousPayload = previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null;
  const hasGrowthComparableRuns = Boolean(baseline);

  const prevPorRef = new Map();
  if (baseline) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: baseline.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) prevPorRef.set(ps.productRefId, ps.salesCount);
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: { scrapeRunId: latest.id, product: { hiddenAt: null } },
    select: SNAPSHOT_REPORT_SELECT
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

  const ctx = { prevPorRef, count, previous, janelaHoras };
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
    janelaHoras: janelaHoras != null ? Math.round(janelaHoras * 10) / 10 : null,
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
  // Mesmo critério de base do relatório global: run suficientemente atrás, não
  // o imediatamente anterior (ver getLatestAndBaselineRun).
  const { latest, baseline, janelaHoras } = await getLatestAndBaselineRun(prisma);

  if (!latest) {
    return {
      ok: false,
      type: "no-run",
      message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)."
    };
  }

  const previous = baseline;
  const count = baseline ? 2 : 1;

  const scrapeRun = {
    id: latest.id,
    collectedAt: latest.collectedAt.toISOString()
  };
  const previousRun = previous ? { id: previous.id, collectedAt: previous.collectedAt.toISOString() } : null;
  const hasGrowthComparableRuns = Boolean(baseline);

  const prevPorRef = new Map();
  if (baseline) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: baseline.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) prevPorRef.set(ps.productRefId, ps.salesCount);
  }

  const products = await prisma.product.findMany({
    where: { categoryUrl: { not: null }, hiddenAt: null },
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
    select: SNAPSHOT_REPORT_SELECT_WITH_RUN
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
  const ctx = { prevPorRef, count, previous, janelaHoras };

  return {
    ok: true,
    snapshots,
    ctx,
    scrapeRun,
    previousRun,
    hasGrowthComparableRuns,
    janelaHoras: janelaHoras != null ? Math.round(janelaHoras * 10) / 10 : null,
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
    janelaHoras: r.janelaHoras ?? null,
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
    // Janela sobre a qual todo o crescimento desta resposta foi medido. Quem
    // mostra "vendas/dia" precisa de a exibir junto, senão o número parece mais
    // firme do que é.
    janelaHoras: b.janelaHoras ?? null,
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
  for (const [minimo, pontos] of FAIXAS_VENDAS) {
    if (sc >= minimo) return pontos;
  }
  return 0;
}

/** @param {number | null | undefined} avg @param {number | null | undefined} tot */
function pontosAvaliacao(avg, tot) {
  if (avg == null || tot == null) return 0;
  for (const [notaMin, totalMin, pontos] of FAIXAS_AVALIACAO) {
    if (avg >= notaMin && tot >= totalMin) return pontos;
  }
  return 0;
}

/** @param {number | null | undefined} price */
function pontosPreco(price) {
  return price != null && Number(price) > 0 ? corte("pontos_preco") : 0;
}

/** @param {boolean} hasDiscount */
function pontosDesconto(hasDiscount) {
  return hasDiscount ? corte("pontos_desconto") : 0;
}

/** @param {number | null | undefined} sc @param {number | null | undefined} avg @param {number | null | undefined} tot @param {number | null | undefined} price */
function pontosOportunidade(sc, avg, tot, price) {
  if (price == null || sc == null || avg == null || tot == null) return 0;
  const dentroDaJanela =
    sc >= corte("oportunidade_vendas_min") && sc <= corte("oportunidade_vendas_max");
  const temQualidade =
    avg >= corte("oportunidade_nota_min") && tot >= corte("oportunidade_avaliacoes_min");
  return dentroDaJanela && temQualidade ? corte("pontos_oportunidade") : 0;
}

/**
 * Pontos de crescimento a partir da VELOCIDADE (vendas/dia), não do total
 * acumulado entre duas leituras.
 *
 * O delta cru não é comparável entre produtos: 50 vendas em 12 h e 50 vendas em
 * 7 dias davam a mesma pontuação, apesar de serem ritmos 14× diferentes. Como o
 * intervalo entre coletas varia (às vezes minutos, às vezes dias), pontuar o
 * delta cru premiava sobretudo quem foi medido num intervalo longo.
 *
 * @param {number | null} vendasPorDia
 * @param {boolean} podeCalcular
 */
function pontosCrescimento(vendasPorDia, podeCalcular) {
  if (!podeCalcular || vendasPorDia == null) return { pts: 0, vendasPorDia: null };
  for (const [ritmoMin, pontos] of FAIXAS_CRESCIMENTO) {
    // A última faixa tem mínimo 0 e é "qualquer ritmo acima de zero":
    // parado não é crescimento, por isso a comparação lá é estrita.
    const bate = ritmoMin === 0 ? vendasPorDia > 0 : vendasPorDia >= ritmoMin;
    if (bate) return { pts: pontos, vendasPorDia };
  }
  return { pts: 0, vendasPorDia };
}

export function rotuloScore(score) {
  for (const [minimo, rotulo] of FAIXAS_ROTULO) {
    if (score >= minimo) return rotulo;
  }
  return ROTULO_MINIMO;
}

/**
 * Teto de pontos de cada eixo — usado para medir quanto do score foi de facto
 * AVALIÁVEL, e não só quanto ele somou.
 *
 * Ver `avaliarConfianca`: sem isto, ausência de dado é indistinguível de dado
 * mau, porque as duas coisas somam zero.
 */
const TETO_POR_EIXO = { vendas: 35, avaliacao: 25, preco: 10, desconto: 5, oportunidade: 15, crescimento: 10 };

/**
 * Confiança do score: que fração dos 100 pontos possíveis pôde sequer ser
 * julgada com o dado que temos.
 *
 * O problema que isto resolve: `pontosAvaliacao(null, null)` devolve 0 — o
 * mesmo que devolve para um produto com nota 3,2. Na tabela os dois aparecem
 * com o mesmo score e ninguém consegue distinguir "é fraco" de "não sabemos".
 * Produto novo, que ainda não tem avaliação nem série, é penalizado por uma
 * lacuna do NOSSO cadastro e cai no ranking como se fosse ruim.
 *
 * Aqui o número não muda — mudar a fórmula exigiria decidir o que um campo
 * ausente vale, e essa é decisão de negócio. O que muda é que o score passa a
 * viajar com a sua própria ressalva, e quem lê decide.
 */
function avaliarConfianca({ sc, avg, tot, price, crescimentoMedido }) {
  const faltando = [];
  const temVendas = sc != null;
  const temAvaliacao = avg != null && tot != null;
  const temPreco = price != null;

  if (!temVendas) faltando.push("vendas");
  if (!temAvaliacao) faltando.push("avaliação");
  if (!temPreco) faltando.push("preço");
  if (!crescimentoMedido) faltando.push("crescimento");

  // Oportunidade depende dos quatro campos ao mesmo tempo: só é avaliável
  // quando todos existem.
  const avaliavel =
    (temVendas ? TETO_POR_EIXO.vendas : 0) +
    (temAvaliacao ? TETO_POR_EIXO.avaliacao : 0) +
    (temPreco ? TETO_POR_EIXO.preco : 0) +
    TETO_POR_EIXO.desconto + // desconto é booleano: ausente = não tem, e isso é medição
    (temVendas && temAvaliacao && temPreco ? TETO_POR_EIXO.oportunidade : 0) +
    (crescimentoMedido ? TETO_POR_EIXO.crescimento : 0);

  const fracao = avaliavel / 100;
  const nivel = fracao >= 0.85 ? "completa" : fracao >= 0.6 ? "parcial" : "fraca";
  return { confianca: nivel, confiancaPct: Math.round(fracao * 100), faltando };
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

  // Ritmo em vez de total. `janelaHoras` vem de quem montou o contexto; sem ela
  // não se sabe em quanto tempo o delta aconteceu e o número não é comparável
  // entre produtos — nesse caso o crescimento fica sem base, e diz-se isso.
  const janelaHoras = Number.isFinite(ctx.janelaHoras) ? Number(ctx.janelaHoras) : null;
  const janelaUtil = janelaHoras != null && janelaHoras > 0;
  const vendasPorDia =
    podeDelta && delta != null && janelaUtil
      ? Math.round(((delta * 24) / janelaHoras) * 10) / 10
      : null;

  let semBaseGrowth = false;
  if (count < 2 || !previous) {
    semBaseGrowth = true;
  } else if (!podeDelta) {
    semBaseGrowth = true;
  } else if (delta == null || Number.isNaN(delta)) {
    semBaseGrowth = true;
  } else if (!janelaUtil) {
    // Houve delta, mas não se sabe em quanto tempo: não é crescimento medido.
    semBaseGrowth = true;
  } else {
    semBaseGrowth = false;
  }

  const { pts: gPts } = pontosCrescimento(vendasPorDia, Boolean(podeDelta) && janelaUtil);

  let totalPts = vPts + rPts + pPts + dPts + oPts + gPts;
  if (totalPts > corte("score_maximo")) totalPts = corte("score_maximo");

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

  const { confianca, confiancaPct, faltando } = avaliarConfianca({
    sc, avg, tot, price: s.price, crescimentoMedido: !semBaseGrowth
  });

  /* O irmão do `faltando`: aquele diz o que impede MEDIR, este o que impede
     APROVAR. Ver lib/restricao.mjs. `enriched` já foi apurado acima e é a
     nossa leitura de "tem galeria utilizável". */
  const trava = restricaoLigante({
    vendas: sc, nota: avg, avaliacoes: tot, preco: s.price, temGaleria: Boolean(enriched)
  });

  return {
    score: totalPts,
    classific: rotuloScore(totalPts),
    /** "completa" | "parcial" | "fraca" — quanto do score pôde ser julgado. */
    confianca,
    confiancaPct,
    /** Que campos faltaram. Dizer QUAL falta vale mais que dizer que faltou. */
    faltando,
    /* O que impede APROVAR (o `faltando` diz o que impede MEDIR), e o que o
       destrava. Null quando nada trava. Ver lib/restricao.mjs. */
    restricaoLigante: trava.restricaoLigante,
    rotuloRestricao: trava.rotuloRestricao,
    gatilho: trava.gatilho,
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
    // Ritmo medido e a janela em que foi medido. A janela viaja junto com o
    // número de propósito: "12 vendas/dia" medido em 12 h e em 7 dias não têm
    // a mesma confiança, e quem lê tem de conseguir ver a diferença.
    /** @type {number | null} */
    vendasPorDia,
    /** @type {number | null} */
    janelaHoras: janelaUtil ? Math.round(janelaHoras * 10) / 10 : null,
    crescimentoMedido: !semBaseGrowth,
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
    janelaHoras: b.janelaHoras ?? null,
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
