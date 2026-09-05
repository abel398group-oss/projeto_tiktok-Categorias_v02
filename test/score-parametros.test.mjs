import test from "node:test";
import assert from "node:assert/strict";
import { aplicarValores, valoresEmVigor, corte, CORTES } from "../scripts/analytics/lib/score-parametros.mjs";

/**
 * Estes cortes decidem o que a API devolve a toda a gente, incluindo ao
 * MoneyPrinter. Um defeito aqui muda o ranking inteiro em silêncio.
 */

test("sem nada gravado, tudo fica no padrão do código", () => {
  aplicarValores({});
  assert.equal(corte("oportunidade_vendas_max"), CORTES.oportunidade_vendas_max.valor);
  assert.ok(valoresEmVigor().every((c) => c.origem === "padrão"));
});

test("um valor gravado passa a valer, e diz que foi ajustado", () => {
  aplicarValores({ oportunidade_vendas_max: 1000 });
  assert.equal(corte("oportunidade_vendas_max"), 1000);
  const c = valoresEmVigor().find((x) => x.chave === "oportunidade_vendas_max");
  assert.equal(c.origem, "ajustado");
  assert.equal(c.padrao, CORTES.oportunidade_vendas_max.valor, "o padrão tem de continuar visível");
});

test("aplicar SUBSTITUI — uma chave que saiu da base volta ao padrão", () => {
  aplicarValores({ oportunidade_vendas_max: 1000 });
  aplicarValores({ pontos_preco: 20 });
  // Se isto fundisse, o 1000 apagado continuaria vivo até ao próximo reinício.
  assert.equal(corte("oportunidade_vendas_max"), CORTES.oportunidade_vendas_max.valor);
  assert.equal(corte("pontos_preco"), 20);
  aplicarValores({});
});

test("chave que o código não conhece é ignorada, não rebenta", () => {
  const n = aplicarValores({ chave_que_nao_existe: 5, pontos_preco: 12 });
  assert.equal(n, 1);
  assert.equal(corte("pontos_preco"), 12);
  aplicarValores({});
});

test("valor corrompido cai no padrão em vez de partir o ranking", () => {
  aplicarValores({ pontos_preco: "abc" });
  assert.equal(corte("pontos_preco"), CORTES.pontos_preco.valor);
  aplicarValores({ pontos_preco: NaN });
  assert.equal(corte("pontos_preco"), CORTES.pontos_preco.valor);
  aplicarValores({});
});

test("todo corte do catálogo tem unidade, descrição e fonte", () => {
  for (const c of Object.values(CORTES)) {
    assert.ok(c.unidade, `${c.chave} sem unidade`);
    assert.ok(c.descricao && c.descricao.length > 20, `${c.chave} sem descrição útil`);
    assert.ok(c.fonte, `${c.chave} sem fonte — é a coluna que mais vale`);
  }
});

test("pedir um corte inexistente é erro, não undefined em silêncio", () => {
  assert.throws(() => corte("nao_existe"), /corte desconhecido/);
});
