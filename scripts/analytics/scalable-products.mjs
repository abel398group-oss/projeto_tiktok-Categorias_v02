/**
 * Produtos para escalar — todas as linhas pontuadas do último run (getProductScoreFull), mesmo critérios de filtro.
 */
import { analyzeProduct } from "./product-decision.mjs";
import { getProductScoreFull } from "./lib/product-score.mjs";

/** @param {string | undefined | null} rating */
function parseRatingParts(rating) {
  const s = rating != null ? String(rating).trim() : "";
  if (!s) return { avg: null, avalCount: null };
  const mAvg = s.match(/^([\d.]+)/);
  const avg = mAvg ? parseFloat(mAvg[1]) : null;
  const mN = s.match(/\((\d+)\s*aval/i);
  const avalCount = mN ? parseInt(mN[1], 10) : null;
  return {
    avg: avg != null && !Number.isNaN(avg) ? avg : null,
    avalCount: avalCount != null && !Number.isNaN(avalCount) ? avalCount : null
  };
}

/** @param {{ vendas?: unknown }} item */
function parseVendasNum(item) {
  const v = item.vendas;
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return null;
  return n;
}

/** @param {unknown} preco */
function priceOk(preco) {
  if (preco == null || preco === "") return false;
  const n = Number(preco);
  return !Number.isNaN(n) && n > 0;
}

/** @param {{ preco?: unknown }} item @param {number | null} vendasNum @param {number | null} avg */
function isGloballyIgnored(item, vendasNum, avg) {
  if (!priceOk(item.preco)) return true;
  if (vendasNum != null && vendasNum > 10_000) return true;
  if (avg != null && avg < 4) return true;
  return false;
}

/** @param {number | null} vendasNum @param {number | null} avg @param {number} score */
function matchesValidated(vendasNum, avg, score) {
  if (vendasNum == null) return false;
  if (vendasNum < 300 || vendasNum > 3000) return false;
  if (avg == null || avg < 4.3) return false;
  if (score < 55) return false;
  return true;
}

/** @param {number | null} vendasNum @param {number | null} avg @param {number | null} avalCount @param {number} score */
function matchesPotential(vendasNum, avg, avalCount, score) {
  if (vendasNum == null) return false;
  if (vendasNum < 10 || vendasNum > 300) return false;
  if (avg == null || avg < 4.5) return false;
  if (avalCount == null || avalCount < 5) return false;
  if (score < 45) return false;
  return true;
}

/**
 * Monta item de saída homogéneo (UI / API).
 * @param {import("./product-decision.mjs").ProductScoreItemLike & { score: number }} item
 * @param {string} ratingStr
 */
function toRow(item, ratingStr) {
  const ap = analyzeProduct(item);
  return {
    productId: item.productId ?? "",
    nome: item.nome ?? "",
    loja: item.loja ?? "",
    score: typeof item.score === "number" ? item.score : 0,
    vendas: item.vendas ?? "",
    rating: ratingStr,
    preco: item.preco ?? null,
    delta: item.deltaVendas ?? "",
    link: item.link ?? "",
    decision: ap.decision
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getScalableProductsReport(prisma) {
  const scored = await getProductScoreFull(prisma);

  if (!scored.scrapeRun) {
    return {
      scrapeRun: null,
      previousRun: scored.previousRun ?? null,
      hasGrowthComparableRuns: scored.hasGrowthComparableRuns ?? false,
      validatedToScale: [],
      potentialBets: [],
      scoredProductsAnalyzed: 0,
      message: scored.message ?? "Sem dados: nenhum ScrapeRun."
    };
  }

  const validatedToScale = [];
  const potentialBets = [];

  const pool = scored.lines ?? [];

  for (const raw of pool) {
    /** @type {import("./product-decision.mjs").ProductScoreItemLike & { score: number }} */
    const item = raw;
    const ratingStr =
      typeof item.rating === "string" ? item.rating : String(item.rating ?? "");
    const { avg, avalCount } = parseRatingParts(ratingStr);
    const vendasNum = parseVendasNum(item);
    const score = typeof item.score === "number" && !Number.isNaN(item.score) ? item.score : 0;

    if (isGloballyIgnored(item, vendasNum, avg)) {
      continue;
    }

    if (matchesValidated(vendasNum, avg, score)) {
      validatedToScale.push(toRow(item, ratingStr));
      continue;
    }

    if (matchesPotential(vendasNum, avg, avalCount, score)) {
      potentialBets.push(toRow(item, ratingStr));
    }
  }

  return {
    scrapeRun: scored.scrapeRun,
    previousRun: scored.previousRun ?? null,
    hasGrowthComparableRuns: scored.hasGrowthComparableRuns ?? false,
    validatedToScale,
    potentialBets,
    /** Linhas pontuadas analisadas (= snapshots no último run; antes o Escalar só via o subset “top” do relatório geral — máx. 30). */
    scoredProductsAnalyzed: pool.length,
    /** Total de snapshots no último ScrapeRun (igual ao agregador de score quando há dados). */
    totalSnapshotsInLatestRun: scored.totalSnapshotsInLatestRun ?? pool.length,
    ...(scored.message && pool.length === 0 ? { message: scored.message } : {})
  };
}
