import test from "node:test";
import assert from "node:assert/strict";
import { computeProductScoreLine, rotuloScore } from "../scripts/analytics/lib/product-score.mjs";

/**
 * TESTE DE CARACTERIZAÇÃO — prende o score ANTES de mexer nele.
 *
 * Os limiares do score («produto bom tem 300 vendas», «nota 4,8 vale 25
 * pontos») vivem cravados dentro de `if`s. Vão sair para um catálogo de
 * parâmetros, e a única forma honesta de fazer isso é ter, primeiro, um
 * teste que falha se QUALQUER número mudar.
 *
 * Os valores esperados aqui não são opinião sobre o que o score DEVIA dar:
 * são o que ele dá hoje, medido. Se um deles mudar de propósito amanhã,
 * muda-se aqui e o commit explica porquê — que é exactamente o controlo que
 * hoje não existe.
 *
 * Cada caso senta-se em cima de uma fronteira, porque é aí que erro de
 * extracção aparece: 300 vendas e 299 têm de continuar a dar pontos
 * diferentes.
 */

/** Snapshot mínimo aceite por `computeProductScoreLine`. */
function snap({ vendas = null, nota = null, avaliacoes = null, preco = null, desconto = false }) {
  return {
    salesCount: vendas,
    ratingAverage: nota,
    ratingTotal: avaliacoes,
    price: preco,
    hasDiscount: desconto,
    productRefId: "ref-1",
    pdpImages: null,
    dataQuality: null,
    product: { productId: "1", name: "Produto", categoryUrl: null, productUrl: "", seller: { name: "Loja" } }
  };
}

/** Contexto sem histórico: isola os eixos que não dependem de crescimento. */
const SEM_HISTORICO = { prevPorRef: new Map(), count: 1, previous: null, janelaHoras: null };

/** Contexto com baseline a 24 h, para o eixo de crescimento entrar. */
function comCrescimento(vendasAntes) {
  return {
    prevPorRef: new Map([["ref-1", vendasAntes]]),
    count: 2,
    previous: { id: "run-antigo", collectedAt: new Date() },
    janelaHoras: 24
  };
}

test("eixo vendas: as quatro faixas e as fronteiras", () => {
  const pts = (v) => computeProductScoreLine(snap({ vendas: v }), SEM_HISTORICO).score;
  assert.equal(pts(1000), 35, "1000 vendas");
  assert.equal(pts(999), 25, "999 cai para a faixa de 300");
  assert.equal(pts(300), 25, "300 vendas");
  assert.equal(pts(299), 15, "299 cai para a faixa de 100");
  assert.equal(pts(100), 15, "100 vendas");
  assert.equal(pts(99), 8, "99 cai para a faixa de 10");
  assert.equal(pts(10), 8, "10 vendas");
  assert.equal(pts(9), 0, "abaixo de 10 não pontua");
  assert.equal(pts(null), 0, "sem medição não pontua");
});

test("eixo avaliação: nota e número de avaliações andam juntos", () => {
  const pts = (nota, tot) =>
    computeProductScoreLine(snap({ nota, avaliacoes: tot }), SEM_HISTORICO).score;
  assert.equal(pts(4.8, 10), 25, "4,8 com 10 avaliações");
  assert.equal(pts(4.8, 9), 18, "4,8 com 9 cai para a faixa de baixo");
  assert.equal(pts(4.5, 5), 18, "4,5 com 5");
  assert.equal(pts(4.5, 4), 0, "4,5 com 4 não chega ao mínimo de amostra");
  assert.equal(pts(4.0, 5), 10, "4,0 com 5");
  assert.equal(pts(3.9, 5), 0, "abaixo de 4,0 não pontua");
  assert.equal(pts(null, null), 0, "sem nota não pontua");
});

test("eixo preço vale 10, e existir é o critério — não o valor", () => {
  assert.equal(computeProductScoreLine(snap({ preco: 0.01 }), SEM_HISTORICO).score, 10);
  assert.equal(computeProductScoreLine(snap({ preco: 9999 }), SEM_HISTORICO).score, 10);
  assert.equal(computeProductScoreLine(snap({ preco: 0 }), SEM_HISTORICO).score, 0);
  assert.equal(computeProductScoreLine(snap({ preco: null }), SEM_HISTORICO).score, 0);
});

test("eixo desconto vale 5", () => {
  assert.equal(computeProductScoreLine(snap({ desconto: true }), SEM_HISTORICO).score, 5);
  assert.equal(computeProductScoreLine(snap({ desconto: false }), SEM_HISTORICO).score, 0);
});

test("eixo oportunidade: janela de vendas COM qualidade, vale 15", () => {
  // 100 vendas + 4,5/5 aval + preço: 15 (vendas) + 18 (aval) + 10 (preço) + 15 (oport.)
  const dentro = computeProductScoreLine(
    snap({ vendas: 100, nota: 4.5, avaliacoes: 5, preco: 50 }), SEM_HISTORICO);
  assert.equal(dentro.score, 58);

  // 301 vendas sai da janela de oportunidade: 25 + 18 + 10, sem os 15
  const fora = computeProductScoreLine(
    snap({ vendas: 301, nota: 4.5, avaliacoes: 5, preco: 50 }), SEM_HISTORICO);
  assert.equal(fora.score, 53);
});

test("eixo crescimento pontua RITMO, não o total acumulado", () => {
  const linha = (vendasAgora, vendasAntes) =>
    computeProductScoreLine(snap({ vendas: vendasAgora }), comCrescimento(vendasAntes));

  // +50/dia numa janela de 24h => 10 pontos, sobre os 35 das 1000 vendas
  assert.equal(linha(1050, 1000).score, 45);
  // +10/dia => 6 pontos
  assert.equal(linha(1010, 1000).score, 41);
  // +1/dia => 3 pontos
  assert.equal(linha(1001, 1000).score, 38);
  // sem variação => 0
  assert.equal(linha(1000, 1000).score, 35);
});

test("o produto perfeito dá 85, não 100 — e o motivo é de desenho", () => {
  const tudo = computeProductScoreLine(
    snap({ vendas: 5000, nota: 5, avaliacoes: 500, preco: 99, desconto: true }),
    comCrescimento(0)
  );

  /*
   * 35 vendas + 25 avaliação + 10 preço + 5 desconto + 10 crescimento = 85.
   *
   * Faltam os 15 da OPORTUNIDADE, e não é defeito: esse eixo só pontua entre
   * 10 e 300 vendas, ou seja, é mutuamente exclusivo com a faixa de topo do
   * eixo de vendas. Um campeão de volume nunca é "oportunidade" — por
   * definição, já foi descoberto.
   *
   * A consequência prática, que só aparece quando se escreve o teste: o
   * `Math.min(100)` do código é decorativo, e a escala real vai a 85. Quem
   * lê "score 85" pode pensar que faltaram 15 pontos de qualidade quando
   * faltaram 15 pontos de ainda-não-ser-óbvio.
   */
  assert.equal(tudo.score, 85);
});

test("os rótulos e as suas fronteiras", () => {
  assert.equal(rotuloScore(100), "excelente");
  assert.equal(rotuloScore(80), "excelente");
  assert.equal(rotuloScore(79), "bom");
  assert.equal(rotuloScore(60), "bom");
  assert.equal(rotuloScore(59), "observar");
  assert.equal(rotuloScore(40), "observar");
  assert.equal(rotuloScore(39), "fraco");
  assert.equal(rotuloScore(0), "fraco");
});
