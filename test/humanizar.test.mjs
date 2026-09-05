import test from "node:test";
import assert from "node:assert/strict";
import {
  atrasoDeTecla,
  escolherTermo,
  planoDeRolagem,
  proximoIntervalo,
  tocaPausaLonga,
  pareceMuroDeBot
} from "../src/scrape/humanizar.mjs";

/**
 * Estas funções decidem o disfarce. Um defeito aqui não parte nada — faz
 * pior: deixa a coleta a correr com um padrão reconhecível, e ninguém vê
 * até o site responder com desafio.
 *
 * O gerador aleatório é injectado em todos os testes, porque o que
 * interessa não é o número que sai, é a FORMA da distribuição.
 */

/** Gerador que devolve a sequência dada, e depois repete o último valor. */
function rndFixo(...valores) {
  let i = 0;
  return () => valores[Math.min(i++, valores.length - 1)];
}

test("a rolagem volta para cima em ~15% dos passos — sem isso é monotónica", () => {
  // rnd < 0.15 => sobe. Primeiro valor escolhe o nº de passos.
  const sobe = planoDeRolagem(rndFixo(0, 0.10, 0.5));
  assert.ok(sobe[0].dy < 0, "com rnd 0.10 o passo devia subir");

  const desce = planoDeRolagem(rndFixo(0, 0.90, 0.5));
  assert.ok(desce[0].dy > 0, "com rnd 0.90 o passo devia descer");
});

test("a rolagem tem entre 3 e 6 passos — nunca zero, nunca cinquenta", () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const n = planoDeRolagem(rndFixo(r)).length;
    assert.ok(n >= 3 && n <= 6, `com rnd ${r} deu ${n} passos`);
  }
});

test("nenhum passo de rolagem é instantâneo", () => {
  for (const passo of planoDeRolagem(rndFixo(0.5))) {
    assert.ok(passo.esperaMs >= 700, `espera curta demais: ${passo.esperaMs}ms`);
  }
});

test("digitação nunca é instantânea — é o sinal mais barato de detectar", () => {
  assert.ok(atrasoDeTecla(rndFixo(0)) >= 90);
  assert.ok(atrasoDeTecla(rndFixo(0.999)) <= 210);
});

test("a pausa longa tem período, mas o período varia", () => {
  // rnd 0 => periodo 6. A leitura 6 toca, a 5 não.
  assert.equal(tocaPausaLonga(6, rndFixo(0)), true);
  assert.equal(tocaPausaLonga(5, rndFixo(0)), false);

  // rnd 0.99 => periodo 9. A leitura 6 já não toca — é isto que impede
  // que o intervalo entre pausas seja ele próprio uma assinatura.
  assert.equal(tocaPausaLonga(6, rndFixo(0.99)), false);
  assert.equal(tocaPausaLonga(9, rndFixo(0.99)), true);
});

test("a primeira leitura nunca leva pausa longa", () => {
  assert.equal(tocaPausaLonga(0, rndFixo(0)), false);
});

test("a pausa longa é de dezenas de segundos; a normal, não", () => {
  const longa = proximoIntervalo(3000, 6, rndFixo(0));
  assert.equal(longa.longa, true);
  assert.ok(longa.ms >= 15000, `pausa longa curta demais: ${longa.ms}ms`);

  const normal = proximoIntervalo(3000, 1, rndFixo(0.5));
  assert.equal(normal.longa, false);
  assert.ok(normal.ms < 15000);
});

test("o intervalo normal varia à volta da base — não é constante", () => {
  const baixo = proximoIntervalo(3000, 1, rndFixo(0.5, 0)).ms;
  const alto = proximoIntervalo(3000, 1, rndFixo(0.5, 0.99)).ms;
  assert.notEqual(baixo, alto, "dois sorteios deram o mesmo intervalo");
  assert.ok(baixo >= 3000 * 0.4, "abaixo do piso de 40% da base");
});

test("o termo de busca sai da lista de quem chamou", () => {
  assert.equal(escolherTermo(["vara de pesca"], rndFixo(0)), "vara de pesca");
});

test("termo vazio ou lixo cai num fallback genérico, não em string vazia", () => {
  assert.equal(escolherTermo([], rndFixo(0)), "ofertas do dia");
  assert.equal(escolherTermo(["", "  ", "ab"], rndFixo(0)), "ofertas do dia");
});

test("termo absurdamente longo é descartado — não se cola um título de 120 caracteres na busca", () => {
  const titulo = "Kit 15 Brocas Diamantadas Serra Copo Para Vidro Porcelanato ".repeat(3);
  assert.equal(escolherTermo([titulo], rndFixo(0)), "ofertas do dia");
});

test("reconhece o muro de anti-automação — sem isto o aquecimento sujava o Referer", () => {
  // Medido cá em 05/09/2026: é para aqui que o Google manda quem digita.
  assert.equal(pareceMuroDeBot("https://www.google.com/sorry/index?continue=https://x"), true);
  assert.equal(pareceMuroDeBot("https://www.mercadolivre.com.br/suspicious-traffic"), true);
  assert.equal(pareceMuroDeBot("https://www.google.com/search?q=ofertas"), false);
  assert.equal(pareceMuroDeBot("https://shop.tiktok.com/br/c"), false);
  assert.equal(pareceMuroDeBot(null), false);
});
