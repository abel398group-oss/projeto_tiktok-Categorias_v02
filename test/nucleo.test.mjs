import test from "node:test";
import assert from "node:assert/strict";
import {
  especieDoTitulo,
  nucleoDoTitulo,
  radical,
  rotuloCurto,
  vereditoNaCategoria
} from "../src/scrape/nucleo.mjs";

/**
 * O núcleo alimenta o prompt do Symphony e limpa as medianas de categoria.
 * Errar aqui é caro nos dois sítios: um vídeo que anuncia "kit" em vez do
 * produto, e uma mediana de preço puxada por acessório mal arquivado.
 *
 * Os títulos abaixo são reais, da base.
 */

test('"kit" nunca e nucleo — abre 19% dos titulos da base', () => {
  assert.equal(nucleoDoTitulo("Kit 15/20 Brocas Diamantadas Serra Copo para Vidro"), "broca");
  assert.equal(nucleoDoTitulo("Kit 7 Brocas De Carboneto Triangular Titânio"), "broca");
  assert.equal(nucleoDoTitulo("Kit 12 Pares Meias Sapatilha Cano Curto"), "meia");
});

test("embalagem e promocao nao nomeiam produto", () => {
  for (const t of ["Par de Luvas Térmicas", "Caixa Organizadora Dobrável", "Combo 3 Camisetas"]) {
    const n = nucleoDoTitulo(t);
    assert.ok(!["par", "caixa", "combo"].includes(n), `${t} -> ${n}`);
  }
});

test("qualificador nao e nucleo, mesmo abrindo o titulo", () => {
  assert.equal(nucleoDoTitulo("Mini Ventilador Portátil USB"), "ventilador");
  assert.equal(nucleoDoTitulo("Feminino Vestido Longo Floral"), "vestido");
});

test("material perde para o substantivo do produto", () => {
  // "neoprene" e material; o produto e a sapatilha.
  assert.equal(nucleoDoTitulo("Sapatilha Náutica Neoprene Unissex"), "sapatilha");
  assert.equal(nucleoDoTitulo("Inox Panela Pressão 4,5L"), "panela");
});

test("pronome de isca nao vira nucleo", () => {
  // Regressao: "Meu Deus! Kit de 14 bits" dava nucleo "meu".
  assert.notEqual(nucleoDoTitulo("Meu Deus! Kit de 14 bits, super barato!"), "meu");
});

test("titulo sem palavra util devolve null, sem inventar", () => {
  for (const t of ["", "   ", "123 456", null, undefined]) {
    assert.equal(nucleoDoTitulo(t), null, String(t));
  }
});

test("radical junta singular e plural, incluindo os irregulares", () => {
  assert.equal(radical("refis"), radical("refil"));
  assert.equal(radical("capsulas"), radical("capsula"));
  assert.equal(radical("pincois"), radical("pincol"));
  // curtas ficam como estao — cortar "s" de "gas" daria "ga"
  assert.equal(radical("gas"), "gas");
});

test("especie separa consumivel, acessorio e produto", () => {
  assert.equal(especieDoTitulo("Refil Filtro de Água Purificador"), "recompra");
  assert.equal(especieDoTitulo("Suporte Mesa Guidão Para Roçadeira"), "acessorio");
  assert.equal(especieDoTitulo("Vestido Longo Floral Feminino"), "produto");
});

test("rotulo curto leva os qualificadores que identificam, e para no ruido", () => {
  assert.equal(rotuloCurto("Kit 15 Brocas Diamantadas Serra Copo para Vidro"), "brocas diamantadas serra copo");
  // para no numero, que e onde comeca o ruido de anuncio
  assert.equal(rotuloCurto("Ponteiro 14mmx250mm SDS Plus - Bestfer"), "ponteiro");
});

test("rotulo curto respeita o teto de palavras", () => {
  const r = rotuloCurto("Vestido Longo Floral Elegante Casual Verão", { maxPalavras: 2 });
  assert.equal(r.split(" ").length, 2);
});

test('veredito: "fora" so com evidencia positiva de ser outra coisa', () => {
  // o nucleo da categoria aparece adiante no titulo -> e acessorio DELA
  assert.equal(vereditoNaCategoria("Suporte para Vara de Pesca Telescópica", "Varas de pesca"), "fora");
});

test('veredito: "confere" quando o nucleo bate', () => {
  assert.equal(vereditoNaCategoria("Vara de Pesca Telescópica 3m", "Varas de pesca"), "confere");
});

test('veredito: na duvida e "indefinido", nunca "fora"', () => {
  // "canico" e sinonimo de vara; a palavra da categoria nem aparece.
  // Excluir aqui apagaria produto legitimo.
  assert.equal(vereditoNaCategoria("Caniço Telescópico 3m", "Varas de pesca"), "indefinido");
});

test("veredito sem dados suficientes nao exclui", () => {
  assert.equal(vereditoNaCategoria("", "Varas de pesca"), "indefinido");
  assert.equal(vereditoNaCategoria("Vara de Pesca", ""), "indefinido");
});

test("titulo que abre com o preco nao vira produto 'preco'", () => {
  // Regressao real, apanhada no primeiro lote de curadoria: dois de tres
  // produtos vinham rotulados "preco" porque o titulo abre com
  // "(Preco de Liquidacao)".
  assert.equal(
    nucleoDoTitulo("（Preço de Liquidação）Camiseta Básica Estilosa de Caimento Solto"),
    "camiseta"
  );
  // "tenis" vira radical "tenil" pela regra is->il (fossil/fosseis). O radical
  // serve para CASAR palavras, nao para exibir — quem exibe e o rotuloCurto.
  // O que importa aqui e que nao seja "queima" nem "estoque".
  const n = nucleoDoTitulo("QUEIMA DE ESTOQUE Tênis Esportivo Masculino");
  assert.ok(!["queima", "estoque"].includes(n), n);
  assert.equal(rotuloCurto("QUEIMA DE ESTOQUE Tênis Esportivo Masculino"), "tenis esportivo masculino");
});
