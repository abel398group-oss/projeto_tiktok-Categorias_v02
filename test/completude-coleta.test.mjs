/**
 * Completude da colheita: coleta cheia de itens vazios é falha, não sucesso.
 *
 * O cenário que isto trava: o TikTok muda o layout, a navegação continua a
 * funcionar, mas a extração (preço por tamanho de letra, campos por posição no
 * DOM) deixa de encontrar os valores. Sem esta medição, o resultado era um
 * ficheiro com centenas de itens sem preço, status "ok", categoria dada como
 * concluída e dados inúteis na base.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { medirCompletude, avaliarCompletude } from "../src/scrape/completude.mjs";

/** Item saudável, como sai de uma coleta normal. */
function itemCheio(n) {
  return {
    nome: `Produto ${n}`,
    preco: 19.9,
    link_produto: `https://shop.tiktok.com/br/pdp/x/${n}`,
    vendas: 100,
    rating: 4.8
  };
}

describe("medirCompletude", () => {
  test("coleta saudável mede 100% nos críticos", () => {
    const m = medirCompletude(Array.from({ length: 20 }, (_, i) => itemCheio(i)));
    assert.equal(m.total, 20);
    assert.equal(m.campos.nome.fracao, 1);
    assert.equal(m.campos.preco.fracao, 1);
    assert.equal(m.campos.link_produto.fracao, 1);
  });

  test("preço zero conta como presente — zero é um valor, não uma ausência", () => {
    const itens = [{ ...itemCheio(1), preco: 0 }];
    const m = medirCompletude(itens);
    assert.equal(m.campos.preco.preenchidos, 1);
  });

  test("string vazia e lista vazia contam como ausência", () => {
    const itens = [{ ...itemCheio(1), nome: "   ", fotos: [] }];
    const m = medirCompletude(itens);
    assert.equal(m.campos.nome.preenchidos, 0);
    assert.equal(m.campos.fotos.preenchidos, 0);
  });
});

describe("avaliarCompletude", () => {
  test("coleta saudável não dispara alerta", () => {
    const itens = Array.from({ length: 50 }, (_, i) => itemCheio(i));
    assert.equal(avaliarCompletude(medirCompletude(itens), itens.length), null);
  });

  test("todos os itens sem preço dispara alerta e aponta o campo", () => {
    const itens = Array.from({ length: 50 }, (_, i) => ({ ...itemCheio(i), preco: null }));
    const alerta = avaliarCompletude(medirCompletude(itens), itens.length);
    assert.ok(alerta, "50 itens sem preço tinham de disparar o alerta");
    assert.match(alerta.mensagem, /preço: 0%/);
    assert.match(alerta.mensagem, /mudou o layout/);
  });

  test("alguns itens sem preço (acima do mínimo) não dispara — variação normal", () => {
    // 80% com preço: acima do mínimo de 50%.
    const itens = Array.from({ length: 50 }, (_, i) =>
      i < 40 ? itemCheio(i) : { ...itemCheio(i), preco: null }
    );
    assert.equal(avaliarCompletude(medirCompletude(itens), itens.length), null);
  });

  test("coleta minúscula nunca dispara — 1 item vazio em 3 não é sinal de nada", () => {
    const itens = [itemCheio(1), { ...itemCheio(2), preco: null, nome: null }, itemCheio(3)];
    assert.equal(avaliarCompletude(medirCompletude(itens), itens.length), null);
  });

  test("nome abaixo de 90% dispara mesmo com preço saudável", () => {
    const itens = Array.from({ length: 50 }, (_, i) =>
      i < 40 ? itemCheio(i) : { ...itemCheio(i), nome: "" }
    );
    const alerta = avaliarCompletude(medirCompletude(itens), itens.length);
    assert.ok(alerta);
    assert.match(alerta.mensagem, /nome: 80%/);
  });
});
