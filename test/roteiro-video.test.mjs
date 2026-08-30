import test from "node:test";
import assert from "node:assert/strict";
import { montarRoteiro, arredondarVendasParaBaixo } from "../scripts/lib/roteiro-video.mjs";

/**
 * O roteiro é a única parte do pipeline que fala em nome do produto. O que se
 * protege aqui não é o texto bonito — é o que ele NÃO pode dizer: preço (muda
 * antes da publicação), número que envelhece, ou nota apoiada em três pessoas.
 */

test("arredonda para baixo com passo proporcional à grandeza", () => {
  assert.equal(arredondarVendasParaBaixo(140), "100");
  assert.equal(arredondarVendasParaBaixo(3250), "3 mil");
  assert.equal(arredondarVendasParaBaixo(420468), "420 mil");
});

test("dezenas de milhar não colapsam para zero", () => {
  // Regressão: uma versão anterior dividia por 100.000 e devolvia "0 mil".
  assert.equal(arredondarVendasParaBaixo(12000), "10 mil");
  assert.equal(arredondarVendasParaBaixo(99999), "90 mil");
});

test("nunca arredonda para cima — a frase tem de continuar verdade amanhã", () => {
  for (const v of [140, 999, 3250, 12000, 420468]) {
    const dito = Number(arredondarVendasParaBaixo(v).replace(" mil", "").replace(/\./g, "").replace(",", ".")) *
      (arredondarVendasParaBaixo(v).includes("mil") ? 1000 : 1);
    assert.ok(dito <= v, `${dito} > ${v}`);
  }
});

test("o roteiro nunca diz o preço", () => {
  const texto = montarRoteiro(
    { nome: "Produto", preco: 64.99, preco_original: 99.9, moeda: "BRL", avaliacao_media: 4.6, avaliacoes_total: 812 },
    3250
  );
  assert.ok(!/64|99|reais|R\$/i.test(texto), texto);
});

test("nota só entra com avaliações suficientes para a sustentar", () => {
  const poucas = montarRoteiro({ nome: "P", avaliacao_media: 5, avaliacoes_total: 2 }, 900);
  assert.ok(!poucas.includes("avaliação média"), poucas);

  const bastantes = montarRoteiro({ nome: "P", avaliacao_media: 4.6, avaliacoes_total: 812 }, 900);
  assert.ok(bastantes.includes("A avaliação média é 4,6"), bastantes);
});

test("campos em falta somem em vez de virar 'undefined'", () => {
  const texto = montarRoteiro({ nome: "Produto Solitário" }, 0);
  assert.ok(!/undefined|NaN|null/.test(texto), texto);
  assert.ok(texto.startsWith("Produto Solitário."), texto);
  assert.ok(!texto.includes("já compraram"), texto);
});

test("é longo o bastante para sustentar mais de dois clipes", () => {
  // O gerador dimensiona o vídeo pelo áudio: roteiro curto = fotos baixadas
  // e deitadas fora. Ver o comentário de `maxFotos` em send-to-money.mjs.
  const texto = montarRoteiro({ nome: "Saia Midi Feminina Alongada Em Linho", avaliacao_media: 4.6, avaliacoes_total: 812 }, 3250);
  assert.ok(texto.split(/\s+/).length >= 30, `curto demais: ${texto}`);
});
