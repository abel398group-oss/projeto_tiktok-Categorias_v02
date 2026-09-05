/**
 * Os cortes do score, fora dos `if`.
 *
 * ┌─ PORQUE ISTO EXISTE ─────────────────────────────────────────────────
 * │ Os limiares que decidem tudo o que sai da API — e que alimentam
 * │ também o MoneyPrinter — viviam cravados dentro de `if`s no
 * │ `product-score.mjs`. Mudar "produto bom tem 300 vendas" exigia editar
 * │ código e reiniciar o servidor.
 * │
 * │ O modelo é o do product-seeker: cada corte com VALOR, UNIDADE,
 * │ EXPLICAÇÃO e FONTE. A fonte é a parte que se esquece e a que mais
 * │ vale — sem ela, daqui a três meses ninguém sabe se 300 veio de uma
 * │ medição ou de um palpite numa tarde, e por isso ninguém se atreve a
 * │ mexer.
 * │
 * │ A regra que torna isto seguro, também deles: este objecto é a fonte
 * │ de verdade do CÓDIGO, não da operação. Quando houver tabela, ele
 * │ passa a ser o fallback — e continua a ser o que documenta o porquê.
 * └──────────────────────────────────────────────────────────────────────
 *
 * ⚠ Mexer num número aqui muda o ranking de toda a base. O
 * `test/product-score-limiares.test.mjs` prende os valores actuais: se
 * falhar depois de uma alteração, isso é o teste a fazer o trabalho dele,
 * não um estorvo. Actualize-o no mesmo commit, a dizer porquê.
 */

/**
 * @typedef {object} Corte
 * @property {string} chave
 * @property {number} valor
 * @property {string} unidade
 * @property {string} descricao
 * @property {string} fonte
 */

/** Faixas do eixo de vendas: [mínimo de vendas, pontos]. */
export const FAIXAS_VENDAS = [
  [1000, 35],
  [300, 25],
  [100, 15],
  [10, 8]
];

/** Faixas do eixo de avaliação: [nota mínima, nº mínimo de avaliações, pontos]. */
export const FAIXAS_AVALIACAO = [
  [4.8, 10, 25],
  [4.5, 5, 18],
  [4.0, 5, 10]
];

/** Faixas do eixo de crescimento: [vendas/dia mínimas, pontos]. */
export const FAIXAS_CRESCIMENTO = [
  [50, 10],
  [10, 6],
  [0, 3] // qualquer ritmo acima de zero
];

/** Faixas do rótulo: [score mínimo, rótulo]. */
export const FAIXAS_ROTULO = [
  [80, "excelente"],
  [60, "bom"],
  [40, "observar"]
];

export const ROTULO_MINIMO = "fraco";

/**
 * Cortes soltos, com a explicação de cada um.
 *
 * O formato espelha o `CATALOGO_PARAMETROS` do front (`parametrosSinais.js`)
 * de propósito: quando os dois conjuntos se juntarem numa tela só, não há
 * tradução a fazer.
 *
 * @type {Record<string, Corte>}
 */
export const CORTES = {
  pontos_preco: {
    chave: "pontos_preco",
    valor: 10,
    unidade: "pontos",
    descricao: "Ter preço legível vale isto. O VALOR do preço não pontua — um produto caro não é melhor nem pior; o que se mede aqui é se a leitura saiu completa.",
    fonte: "regra original do score v1"
  },
  pontos_desconto: {
    chave: "pontos_desconto",
    valor: 5,
    unidade: "pontos",
    descricao: "Sinal fraco de propósito: desconto é decisão do vendedor, não evidência de procura.",
    fonte: "regra original do score v1"
  },
  pontos_oportunidade: {
    chave: "pontos_oportunidade",
    valor: 15,
    unidade: "pontos",
    descricao: "Prémio para quem vende BEM sem vender MUITO — ainda não é óbvio para toda a gente.",
    fonte: "regra original do score v1"
  },
  oportunidade_vendas_min: {
    chave: "oportunidade_vendas_min",
    valor: 10,
    unidade: "vendas",
    descricao: "Abaixo disto não há evidência de que vende de todo.",
    fonte: "regra original do score v1"
  },
  oportunidade_vendas_max: {
    chave: "oportunidade_vendas_max",
    valor: 300,
    unidade: "vendas",
    descricao: "Acima disto já foi descoberto. Note-se que isto torna o eixo mutuamente exclusivo com o topo do eixo de vendas — ver o teste do produto perfeito, que dá 85 e não 100.",
    fonte: "regra original do score v1"
  },
  oportunidade_nota_min: {
    chave: "oportunidade_nota_min",
    valor: 4.5,
    unidade: "estrelas",
    descricao: "Vender pouco com nota má não é oportunidade, é produto mau.",
    fonte: "regra original do score v1"
  },
  oportunidade_avaliacoes_min: {
    chave: "oportunidade_avaliacoes_min",
    valor: 5,
    unidade: "avaliações",
    descricao: "Amostra mínima para a nota querer dizer alguma coisa.",
    fonte: "regra original do score v1"
  },
  score_maximo: {
    chave: "score_maximo",
    valor: 100,
    unidade: "pontos",
    descricao: "Tecto do score. Na prática nunca é atingido: o eixo de oportunidade exclui o topo do eixo de vendas, e o máximo real é 85.",
    fonte: "medido em 05/09/2026 pelo teste de caracterização"
  }
};

/**
 * Valores que a operação mudou, por cima do catálogo.
 *
 * Vazio = tudo no padrão, que é exactamente o comportamento anterior a
 * existirem parâmetros. Uma chave só entra aqui depois de alguém a gravar,
 * e sai quando a linha é apagada — por isso `parametros` na base é esparsa.
 *
 * @type {Map<string, number>}
 */
const emVigor = new Map();

/**
 * Substitui os valores em vigor pelos que vieram da base.
 *
 * Substitui, não funde: se uma chave desapareceu da base, ela tem de voltar
 * ao padrão. Fundir deixaria um valor apagado a viver na memória do processo
 * até ao próximo reinício — e ninguém liga um reinício a um valor que já
 * tinha apagado.
 *
 * Um valor que não seja número finito é ignorado, com aviso: parâmetro
 * corrompido não pode partir o ranking inteiro.
 *
 * @param {Record<string, unknown> | Map<string, unknown>} valores
 */
export function aplicarValores(valores) {
  emVigor.clear();
  const pares = valores instanceof Map ? [...valores.entries()] : Object.entries(valores ?? {});
  for (const [chave, bruto] of pares) {
    if (!CORTES[chave]) continue; // chave que o código não conhece: ignorada
    const n = Number(bruto);
    if (!Number.isFinite(n)) {
      console.warn(`[parametros] valor inválido para ${chave}: ${bruto} — a usar o padrão.`);
      continue;
    }
    emVigor.set(chave, n);
  }
  return emVigor.size;
}

/** O que está em vigor agora, com padrão e origem de cada corte. */
export function valoresEmVigor() {
  return Object.values(CORTES).map((c) => ({
    ...c,
    valor: emVigor.has(c.chave) ? emVigor.get(c.chave) : c.valor,
    padrao: c.valor,
    origem: emVigor.has(c.chave) ? "ajustado" : "padrão"
  }));
}

/** @param {string} chave */
export function corte(chave) {
  const c = CORTES[chave];
  if (!c) throw new Error(`corte desconhecido: ${chave}`);
  return emVigor.has(chave) ? emVigor.get(chave) : c.valor;
}
