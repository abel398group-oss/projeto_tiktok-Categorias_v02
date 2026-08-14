/**
 * Estatísticas por categoria: mediana (nunca média), percentis e quadrantes
 * pelas medianas do próprio conjunto.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  mediana,
  percentil,
  calcularEstatisticas,
  classificarQuadrantes
} from "../scripts/analytics/lib/category-stats.mjs";

describe("mediana", () => {
  test("ímpar pega o do meio; par interpola", () => {
    assert.equal(mediana([3, 1, 2]), 2);
    assert.equal(mediana([1, 2, 3, 4]), 2.5);
  });

  test("lista vazia devolve null, não zero — 'não sei' ≠ 'é zero'", () => {
    assert.equal(mediana([]), null);
  });

  test("um preço absurdo não arrasta a mediana (o motivo de não usar média)", () => {
    const precos = [20, 21, 22, 23, 800];
    assert.equal(mediana(precos), 22);
    const media = precos.reduce((s, x) => s + x, 0) / precos.length;
    assert.ok(media > 170, "a média teria dito ~177 — número que não descreve produto nenhum");
  });
});

describe("percentil", () => {
  test("p25 e p75 delimitam a faixa típica", () => {
    const v = [10, 20, 30, 40, 50];
    assert.equal(percentil(v, 25), 20);
    assert.equal(percentil(v, 75), 40);
  });
});

describe("calcularEstatisticas", () => {
  const linha = (over = {}) => ({
    preco: 20,
    vendas: "100",
    vendasPorDia: 5,
    crescimentoMedido: true,
    ratingAverage: 4.8,
    loja: "Loja A",
    ...over
  });

  test("preço zero/nulo fica fora da estatística de preço", () => {
    const e = calcularEstatisticas([linha(), linha({ preco: 0 }), linha({ preco: null })]);
    assert.equal(e.preco.n, 1);
    assert.equal(e.n, 3);
  });

  test("ritmo só conta quando foi MEDIDO — palpite não entra na soma", () => {
    const e = calcularEstatisticas([
      linha({ vendasPorDia: 10 }),
      linha({ vendasPorDia: 7, crescimentoMedido: false })
    ]);
    assert.equal(e.vendasPorDia.n, 1);
    assert.equal(e.vendasPorDia.totalMedido, 10);
  });

  test("lojas distintas, ignorando o placeholder '—'", () => {
    const e = calcularEstatisticas([linha(), linha({ loja: "Loja B" }), linha({ loja: "—" })]);
    assert.equal(e.lojas, 2);
  });
});

describe("classificarQuadrantes", () => {
  const prod = (id, preco, ritmo) => ({
    productId: id,
    preco,
    vendasPorDia: ritmo,
    crescimentoMedido: true
  });

  test("amostra pequena declara-se anedota em vez de fingir análise", () => {
    const r = classificarQuadrantes([prod("a", 10, 5), prod("b", 20, 0)]);
    assert.equal(r.ok, false);
    assert.match(r.motivo, /anedota/);
  });

  test("os quatro quadrantes saem das medianas do próprio conjunto", () => {
    const r = classificarQuadrantes([
      prod("barato-girando", 10, 100),
      prod("caro-girando", 100, 90),
      prod("barato-parado", 12, 0),
      prod("caro-parado", 90, 0)
    ]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.quadrantes.porta_aberta, ["barato-girando"]);
    assert.deepEqual(r.quadrantes.vale_o_angulo, ["caro-girando"]);
    assert.deepEqual(r.quadrantes.sem_tracao, ["barato-parado"]);
    assert.deepEqual(r.quadrantes.evitar, ["caro-parado"]);
  });

  test("produto sem ritmo medido fica fora do quadrante — não se classifica palpite", () => {
    const r = classificarQuadrantes([
      prod("a", 10, 100),
      prod("b", 100, 90),
      prod("c", 12, 0),
      prod("d", 90, 0),
      { productId: "sem-medida", preco: 50, vendasPorDia: null, crescimentoMedido: false }
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.nMedidos, 4);
    const todos = Object.values(r.quadrantes).flat();
    assert.ok(!todos.includes("sem-medida"));
  });
});
