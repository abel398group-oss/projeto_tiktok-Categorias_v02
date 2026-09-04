import test from "node:test";
import assert from "node:assert/strict";
import { LIMIAR_SUSPEITA, suspeitaDeTexto } from "../scripts/lib/imagem-de-texto.mjs";

/**
 * ESTE MÓDULO AVISA, NÃO EXCLUI — e estes testes existem para que continue
 * assim.
 *
 * A tentação óbvia é apertar os cortes até a tabela de medidas ser excluída
 * automaticamente. Medido com imagens reais em 30/08/2026, isso é impossível
 * sem dano: a tabela do ténis dá 74% quase-branco / 0,086 de saturação, e uma
 * foto REAL do Pro3Magnésio dá 62% / 0,088. São indistinguíveis.
 *
 * Quem apertar o corte vai apagar fotos de produto em silêncio, e ninguém vai
 * descobrir porque o vídeo ficou com três fotos em vez de quatro.
 */

/** Fabrica um bitmap RGB de cor uniforme, para exercitar a fórmula. */
function bitmap(r, g, b, { largura = 10, altura = 10 } = {}) {
  const canais = 3;
  const data = new Uint8Array(largura * altura * canais);
  for (let i = 0; i < data.length; i += canais) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return { data, largura, altura, canais };
}

test("branco puro sem cor e o caso mais suspeito", () => {
  const r = suspeitaDeTexto(bitmap(255, 255, 255));
  assert.ok(r.suspeita >= LIMIAR_SUSPEITA, `suspeita=${r.suspeita}`);
  assert.equal(r.pctQuaseBranco, 1);
});

test("cor saturada nao levanta suspeita", () => {
  const r = suspeitaDeTexto(bitmap(200, 30, 30));
  assert.equal(r.suspeita, 0);
});

test("devolve sempre uma suspeita entre 0 e 1, nunca um veredito", () => {
  for (const c of [bitmap(255, 255, 255), bitmap(0, 0, 0), bitmap(120, 120, 120)]) {
    const r = suspeitaDeTexto(c);
    assert.ok(r.suspeita >= 0 && r.suspeita <= 1, String(r.suspeita));
    // A API não tem — e não deve ter — um campo que diga "exclua isto".
    assert.equal(r.excluir, undefined);
    assert.equal(r.eTexto, undefined);
  }
});

test("entrada invalida devolve suspeita zero, sem rebentar", () => {
  for (const c of [{}, { data: null, largura: 0, altura: 0, canais: 0 }]) {
    const r = suspeitaDeTexto(c);
    assert.equal(r.suspeita, 0);
  }
});

test("preto puro nao e suspeito de texto", () => {
  // Sem esta ressalva, "pouca cor" sozinha marcaria produto preto.
  const r = suspeitaDeTexto(bitmap(0, 0, 0));
  assert.ok(r.suspeita < LIMIAR_SUSPEITA, `suspeita=${r.suspeita}`);
});

test("o limiar deixa passar foto de catalogo em fundo claro com cor", () => {
  // Cinzento claro com cor: o caso da foto de produto sobre fundo branco.
  const r = suspeitaDeTexto(bitmap(230, 200, 160));
  assert.ok(r.suspeita < LIMIAR_SUSPEITA, `suspeita=${r.suspeita}`);
});

test("os numeros medidos ficam registados para quem for mexer nos cortes", () => {
  // Não é asserção de comportamento: é a prova, em código, de que os dois
  // casos se sobrepõem. Se alguém apertar o corte para excluir o primeiro,
  // exclui o segundo junto.
  const tabelaDeMedidas = { pctQuaseBranco: 0.74, saturacaoMedia: 0.086 };
  const fotoRealDoProduto = { pctQuaseBranco: 0.62, saturacaoMedia: 0.088 };
  assert.ok(
    Math.abs(tabelaDeMedidas.saturacaoMedia - fotoRealDoProduto.saturacaoMedia) < 0.01,
    "os dois casos reais tem saturacao praticamente igual — por isso nao se exclui"
  );
});
