/**
 * Interpretação comercial sobre itens já calculados por getProductScoreReport (camada só leitura; não altera score).
 */

/** @typedef {{ score: number, classific: string, nome: string, categoriaPrincipal?: string, subcategoria?: string, loja: string, preco?: number|string, vendas?: number|string, rating?: string, deltaVendas?: string, motivos?: string, link?: string, productId?: string }} ProductScoreItemLike */

/** @param {string|undefined|null} rating */
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

/** @param {ProductScoreItemLike} item */
function parseVendasNum(item) {
  const v = item.vendas;
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return null;
  return n;
}

/** @param {ProductScoreItemLike} item */
function parseDeltaNum(item) {
  const d = item.deltaVendas;
  if (d == null || d === "—" || String(d).trim() === "") return null;
  const n = parseInt(String(d).replace(/[^\d.-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Confiança v1: base no score + ajustes por sinais de dados (vendas, rating, delta).
 * @param {ProductScoreItemLike} item
 * @param {{ avg: number|null, avalCount: number|null }} ratingParts
 * @param {number|null} vendas
 * @param {number|null} delta
 */
function computeConfidence(item, ratingParts, vendas, delta) {
  let c = Math.round(typeof item.score === "number" ? item.score : 50);

  if (vendas != null) {
    if (vendas >= 1000) c += 10;
    else if (vendas >= 300) c += 7;
    else if (vendas >= 100) c += 4;
    else if (vendas >= 10) c += 2;
  } else {
    c -= 15;
  }

  if (ratingParts.avg != null) {
    if (ratingParts.avg >= 4.7) c += 8;
    else if (ratingParts.avg >= 4.4) c += 5;
    else if (ratingParts.avg >= 4.0) c += 2;
    else c -= 4;
  } else {
    c -= 12;
  }

  if (ratingParts.avalCount != null) {
    if (ratingParts.avalCount < 5) c -= 8;
    else if (ratingParts.avalCount >= 20) c += 3;
  }

  if (delta != null && delta > 0) {
    if (delta > 100) c += 8;
    else if (delta > 30) c += 5;
    else c += 3;
  } else if (delta === null && String(item.deltaVendas ?? "").includes("—")) {
    c -= 6;
  }

  return Math.min(100, Math.max(0, c));
}

/** @param {ProductScoreItemLike} item */
function buildDecisionFromScore(item) {
  const s =
    typeof item.score === "number" && !Number.isNaN(item.score) ? item.score : 0;
  if (s >= 70) return "comprar";
  if (s >= 55) return "testar";
  return "evitar";
}

/**
 * @param {ProductScoreItemLike} item
 */
export function analyzeProduct(item) {
  const ratingParts = parseRatingParts(
    typeof item.rating === "string" ? item.rating : String(item.rating ?? "")
  );
  const vendas = parseVendasNum(item);
  const delta = parseDeltaNum(item);

  const decision = buildDecisionFromScore(item);

  const confidence = computeConfidence(item, ratingParts, vendas, delta);

  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const risks = [];

  if (vendas != null && vendas >= 100) reasons.push("Alta ou média-alta demanda (vendas)");
  else if (vendas != null && vendas >= 10) reasons.push("Tração inicial de vendas");
  else if (vendas == null) risks.push("Vendas não disponíveis para confiar no volume");

  if (ratingParts.avg != null && ratingParts.avg >= 4.5) reasons.push("Boa avaliação média");
  else if (ratingParts.avg != null && ratingParts.avg >= 4.0) reasons.push("Avaliação aceitável");
  else risks.push("Avaliação fraca ou desconhecida");

  if (ratingParts.avalCount != null && ratingParts.avalCount < 5) {
    risks.push("Poucas avaliações (amostra pequena)");
  }

  if (delta != null && delta > 0) reasons.push("Crescimento positivo de vendas vs run anterior");
  if (delta == null || item.deltaVendas === "—") {
    risks.push("Sem dados de crescimento entre coletas");
  }

  if (item.preco != null && item.preco !== "" && Number(item.preco) > 0) {
    reasons.push("Preço válido para análise de margem");
  } else {
    risks.push("Preço ausente ou inválido no snapshot");
  }

  if (decision === "testar") {
    risks.push("Score intermédio — validar antes de escalar inventário");
  } else if (decision === "evitar") {
    risks.push("Prioridade mais baixa face a outros SKU no mesmo run");
  }

  const nomeCurto =
    typeof item.nome === "string" && item.nome.length > 0 ? item.nome.slice(0, 55) : "Produto";

  let summary =
    decision === "comprar"
      ? `${nomeCurto}: sinal forte (score alto) para priorizar entrada ou replicação`
      : decision === "testar"
        ? `${nomeCurto}: sinal médio — testar canal/creatives antes de stock alto`
        : `${nomeCurto}: sinais modestos neste snapshot — rever antes de apostar forte`;

  if (
    vendas != null &&
    vendas >= 300 &&
    ratingParts.avg != null &&
    ratingParts.avg >= 4.4
  ) {
    summary = `Produto com alta tração e boa avaliação (${String(vendas)} vendas, média ~${ratingParts.avg}); forte candidato a teste comercial escalável.`;
  }

  const analysis =
    "**Demanda:** " +
    (vendas != null
      ? `indicadores de vendas em ${String(vendas)} unidades. `
      : "volume de vendas não disponível no item. ") +
    "**Qualidade (rating):** " +
    (ratingParts.avg != null
      ? `média ~${ratingParts.avg}${ratingParts.avalCount != null ? ` (~${ratingParts.avalCount} aval). ` : ". "}`
      : "média de avaliações não disponível. ") +
    "**Potencial (delta):** " +
    (delta != null
      ? `variação de vendas entre coletas ${delta >= 0 ? "+" : ""}${delta}.`
      : "sem comparação de crescimento entre runs.") +
    " **Preço:** " +
    (item.preco != null && item.preco !== ""
      ? `valor ligado a ${String(item.preco)} no snapshot.`
      : "preço não preenchido no snapshot.");

  const opportunity =
    decision === "comprar"
      ? "Produto com perfil forte para escalar no TikTok Shop e repetir formato noutros canais quando a margem permitir."
      : decision === "testar"
        ? "Margem para testar anúncios, bundles ou cross-sell antes de grandes compras ao fornecedor."
        : "Tratar como vigilância ou prova isolada; evidência insuficiente para reposição forte.";

  return {
    decision,
    confidence,
    summary,
    analysis,
    reasons,
    risks,
    opportunity
  };
}

/**
 * @param {ProductScoreItemLike[]} items
 */
export function analyzeProducts(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    productId: item.productId ?? null,
    nome: item.nome ?? "",
    scoreSnapshot: typeof item.score === "number" ? item.score : null,
    ...analyzeProduct(item)
  }));
}
