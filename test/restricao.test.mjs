import test from "node:test";
import assert from "node:assert/strict";
import { restricaoLigante, CHAVES_RESTRICAO } from "../scripts/analytics/lib/restricao.mjs";

/**
 * A restrição diz o que fazer a seguir. Se ela apontar para o sítio errado,
 * manda alguém trabalhar no problema errado — pior que não dizer nada.
 */

const OK = { vendas: 500, nota: 4.7, avaliacoes: 40, preco: 99, temGaleria: true };

test("produto sem nada a travá-lo não inventa restrição", () => {
  const r = restricaoLigante(OK);
  assert.equal(r.restricaoLigante, null);
  assert.equal(r.gatilho, null);
});

test("sem leitura de vendas morde primeiro — sem isso nenhum juízo tem base", () => {
  // Este produto também não tem galeria; a de vendas é que devia sair.
  const r = restricaoLigante({ ...OK, vendas: null, temGaleria: false });
  assert.equal(r.restricaoLigante, "sem_vendas_medidas");
});

test("falta de galeria trava o passo seguinte do fluxo: sem fotos não há vídeo", () => {
  const r = restricaoLigante({ ...OK, temGaleria: false });
  assert.equal(r.restricaoLigante, "sem_galeria");
  assert.match(r.gatilho, /pdp:enrich/);
});

test("nota fraca com amostra suficiente é do mercado, e o gatilho diz isso", () => {
  const r = restricaoLigante({ ...OK, nota: 3.2, avaliacoes: 40 });
  assert.equal(r.restricaoLigante, "nota_fraca");
  assert.match(r.gatilho, /mercado/);
});

test("nota fraca com amostra curta é amostra curta, não nota fraca", () => {
  // 3,2 com 2 avaliações não é veredito sobre o produto — é falta de amostra.
  const r = restricaoLigante({ ...OK, nota: 3.2, avaliacoes: 2 });
  assert.equal(r.restricaoLigante, "amostra_curta");
});

test("vendas abaixo do piso", () => {
  const r = restricaoLigante({ ...OK, vendas: 3 });
  assert.equal(r.restricaoLigante, "giro_baixo");
});

test("preço ausente ou zero trava, e o gatilho diz que o problema é a leitura", () => {
  assert.equal(restricaoLigante({ ...OK, preco: null }).restricaoLigante, "sem_preco");
  assert.equal(restricaoLigante({ ...OK, preco: 0 }).restricaoLigante, "sem_preco");
  assert.match(restricaoLigante({ ...OK, preco: null }).gatilho, /recoletar/i);
});

test("devolve UMA restrição, não uma lista — escolher é o que isto evita", () => {
  const tudoMal = { vendas: null, nota: null, avaliacoes: null, preco: null, temGaleria: false };
  const r = restricaoLigante(tudoMal);
  assert.equal(typeof r.restricaoLigante, "string");
  assert.ok(CHAVES_RESTRICAO.includes(r.restricaoLigante));
});

test("toda restrição tem gatilho — apontar o problema sem a saída é metade do trabalho", () => {
  const casos = [
    { ...OK, vendas: null },
    { ...OK, temGaleria: false },
    { ...OK, nota: 3.2, avaliacoes: 40 },
    { ...OK, nota: 4.9, avaliacoes: 1 },
    { ...OK, vendas: 3 },
    { ...OK, preco: null }
  ];
  for (const c of casos) {
    const r = restricaoLigante(c);
    assert.ok(r.restricaoLigante, "devia ter travado");
    assert.ok(r.gatilho && r.gatilho.length > 10, `gatilho fraco em ${r.restricaoLigante}`);
    assert.ok(r.rotuloRestricao, `sem rótulo em ${r.restricaoLigante}`);
  }
});
