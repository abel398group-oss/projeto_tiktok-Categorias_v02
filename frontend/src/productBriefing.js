/**
 * Briefing textual derivado apenas dos dados do workspace (sem API externa nem IA).
 */

/** @param {unknown} v */
function numFromUnknown(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\u00a0/g, " ").trim();
  if (!s) return null;
  const normalized = s.replace(/[\s.]/g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isFinite(n)) return n;
  const m = normalized.match(/^-?\d+(?:\.\d+)?/);
  if (m && Number.isFinite(Number(m[0]))) return Number(m[0]);
  const mBr = s.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?|\d+)/);
  if (!mBr) return null;
  const x = Number(mBr[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

/** Média de ratings em strings tipo "4,5 · 112 aval". */
/** @param {unknown} ratingStr */
export function ratingAverageFromWorkspace(ratingStr) {
  if (ratingStr == null) return null;
  const n = numFromUnknown(ratingStr);
  return n != null && n <= 5.5 ? n : null;
}

/** Etiqueta qualitativa do score interno 0–100. */
/** @param {unknown} score */
export function scoreQualLabel(score) {
  const n = numFromUnknown(score);
  if (n == null) return null;
  if (n >= 78) return "excelente";
  if (n >= 58) return "bom";
  if (n >= 40) return "médio";
  return "a observar";
}

/**
 * @param {Record<string, unknown>} w — payload típico de GET `/analytics/product-workspace/:id`
 */
export function buildProductBriefingFromWorkspace(w) {
  const precoRaw = w.preco;
  const precoFmt = precoRaw != null && String(precoRaw).trim() !== "" ? String(precoRaw).trim() : "preço não indicado neste snapshot";

  const vendasN = numFromUnknown(w.vendas);
  const vendasFmt = vendasN != null ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(vendasN)) : "—";

  const avg = ratingAverageFromWorkspace(w.rating);
  const ratingFmt = avg != null ? avg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";

  const deltaN =
    typeof w.deltaVendas === "number"
      ? w.deltaVendas
      : typeof w.deltaVendas === "string"
        ? numFromUnknown(w.deltaVendas.replace(/%/g, ""))
        : null;

  const scoreN = numFromUnknown(w.score);
  const sq = scoreQualLabel(w.score);

  /** @type {string[]} */
  const positivos = [];

  if (vendasN != null && vendasN >= 500) {
    positivos.push("Volume de vendas elevado neste snapshot, o que sugere tração já testada pelo mercado.");
  } else if (vendasN != null && vendasN >= 100) {
    positivos.push("Vendas já relevantes dentro da base importada.");
  }

  if (avg != null) {
    if (avg >= 4.7) positivos.push("Avaliação média forte — percepção muito positiva entre compradores.");
    else if (avg >= 4.3) positivos.push("Avaliação média alta — bom sinal de aceitação.");
  }

  if (scoreN != null && scoreN >= 65) {
    positivos.push(
      sq === "excelente"
        ? "Score interno alto no modelo da app — prioridade forte na fila exploratória."
        : "Score interno favorece análise aprofundada frente ao restante catálogo importado."
    );
  }

  if (deltaN != null && deltaN > 0) positivos.push("Variação de vendas positiva face ao período anterior comparável.");

  const motivosTxt = typeof w.motivos === "string" ? w.motivos.trim() : "";
  if (motivosTxt.length >= 12) positivos.push(`Notas do score (app): ${motivosTxt.slice(0, 220)}${motivosTxt.length > 220 ? "…" : ""}`);

  /** @type {string[]} */
  const riscos = [];
  if (avg != null && avg < 4.0) {
    riscos.push("Rating médio baixo neste snapshot — reputação pode limitar escalada.");
  }
  if (vendasN != null && vendasN < 20) {
    riscos.push("Poucas vendas registadas neste scrape — maior incerteza; teste obrigatório antes de grande aposta.");
  }
  if (deltaN != null && deltaN < 0) riscos.push("Queda nas vendas face ao período anterior — acompanhar em novas importações.");
  if (scoreN != null && scoreN < 45) {
    riscos.push("Score interno reduzido no modelo atual — combinar com outros sinais antes de priorizar.");
  }
  const classificRaw = typeof w.classific === "string" ? w.classific : "";
  if (/fraco|risco|crit|evita|dispens|alerta|cuidado/i.test(classificRaw)) {
    riscos.push(`Classificação heurística atual: "${classificRaw.trim()}" — dupla conferência aos dados crus.`);
  }

  /** Parágrafo principal */
  let tail = "";
  if (avg != null && avg >= 4.3 && vendasN != null && vendasN >= 80) {
    tail =
      "Indica boa aceitação pelo público neste momento e potencial razoável para testes criativos ou anúncios quando margem/logística permitirem.";
  } else if (avg != null && avg >= 4.0 && (vendasN == null || vendasN >= 20)) {
    tail = "Sinais médios‑positivos; pode servir como candidato entre outros do mesmo relatório para exploração controlada.";
  } else if ((avg != null && avg < 4.2) || (vendasN != null && vendasN < 50)) {
    tail = "Mistura de sinais — pesar bem custo/logística antes de escalar.";
  } else {
    tail = "Avaliar junto das restantes métricas e do relatório onde o SKU foi encontrado.";
  }

  let resumo = `Produto com ${vendasFmt} vendas, avaliação média ${ratingFmt}, preço ${precoFmt}. ${tail}`;
  /** @type {string | null} */
  let scoreSentence = null;
  if (scoreN != null && sq) {
    const clsShort =
      classificRaw.trim() !== "" ? `${classificRaw.trim().slice(0, 56)}${classificRaw.trim().length > 56 ? "…" : ""}` : "";
    scoreSentence =
      clsShort !== ""
        ? `Score atual: ${scoreN.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} (${sq}; ${clsShort}).`
        : `Score atual: ${scoreN.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} (${sq}).`;
  }

  const uniq = /** @param {string[]} arr @param {string} s */ (arr, s) => {
    const x = s.trim();
    if (!x || arr.includes(x)) return;
    arr.push(x);
  };

  /** @type {string[]} */
  const posClean = [];
  for (const p of positivos) uniq(posClean, p);
  /** @type {string[]} */
  const riscClean = [];
  for (const r of riscos) uniq(riscClean, r);

  return {
    resumo,
    scoreSentence,
    positivos: posClean,
    riscos: riscClean
  };
}