/**
 * Disjuntor de captcha: bloqueio de sessão não pode banir categoria boa.
 *
 * O cenário que isto trava, acontecido de verdade na madrugada de 21→22/08/2026:
 * o TikTok começou a servir captcha às 02:44 e a corrida seguiu queimando
 * categoria atrás de categoria contra uma sessão já bloqueada — sete seguidas,
 * uma a cada ~17 min, 75 captchas no log daquela noite. Cada uma gastou uma das
 * 3 tentativas, e três tentativas põem a categoria FORA até um `--reset`. Ou
 * seja: uma hora de bloqueio bania permanentemente ~12 categorias saudáveis, e
 * o buraco fica invisível porque a barra de progresso continua a subir.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decidirFalha, CODIGO_CAPTCHA, MAX_TENTATIVAS_POR_CATEGORIA } from "../scripts/scrape-all-categories.mjs";

const CODIGO_SEM_PRODUTOS = 1;
const CODIGO_LAYOUT = 3;

describe("decidirFalha — captcha não gasta tentativa", () => {
  test("captcha mantém as tentativas e conta como bloqueio", () => {
    const d = decidirFalha({ code: CODIGO_CAPTCHA, anterior: { tentativas: 2 }, captchasSeguidos: 0 });
    assert.equal(d.ehBloqueioDeSessao, true);
    assert.equal(d.tentativas, 2, "captcha não pode consumir tentativa");
    assert.equal(d.bloqueios, 1);
    assert.equal(d.desistiu, false);
  });

  test("categoria com 2 tentativas gastas sobrevive a 10 captchas seguidos", () => {
    let anterior = { tentativas: 2, bloqueios: 0 };
    for (let i = 0; i < 10; i++) {
      const d = decidirFalha({ code: CODIGO_CAPTCHA, anterior, captchasSeguidos: 0 });
      anterior = { tentativas: d.tentativas, bloqueios: d.bloqueios };
    }
    assert.equal(anterior.tentativas, 2, "dez bloqueios não podem somar uma tentativa sequer");
    assert.equal(anterior.bloqueios, 10);
  });

  test("falha real da categoria continua a gastar tentativa e a desistir na terceira", () => {
    const d1 = decidirFalha({ code: CODIGO_SEM_PRODUTOS, anterior: null, captchasSeguidos: 0 });
    assert.equal(d1.tentativas, 1);
    assert.equal(d1.desistiu, false);

    const d3 = decidirFalha({ code: CODIGO_LAYOUT, anterior: { tentativas: 2 }, captchasSeguidos: 0 });
    assert.equal(d3.tentativas, MAX_TENTATIVAS_POR_CATEGORIA);
    assert.equal(d3.desistiu, true, "3 falhas reais põem a categoria de fora");
  });
});

describe("decidirFalha — disjuntor da corrida", () => {
  test("para na terceira seguida, não antes", () => {
    assert.equal(decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: 0 }).deveParar, false);
    assert.equal(decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: 1 }).deveParar, false);
    assert.equal(decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: 2 }).deveParar, true);
  });

  test("a noite de 22/08 teria parado na 3.ª em vez de queimar 7 categorias", () => {
    let seguidos = 0;
    let ate = 0;
    for (let i = 1; i <= 7; i++) {
      const d = decidirFalha({ code: CODIGO_CAPTCHA, anterior: null, captchasSeguidos: seguidos });
      seguidos = d.captchasSeguidos;
      ate = i;
      if (d.deveParar) break;
    }
    assert.equal(ate, 3, "devia ter parado na terceira categoria, não seguido até a sétima");
  });

  test("falha comum NÃO zera o contador — bloqueio também sai como código 1", () => {
    // 2 captchas, depois um "sem produtos" (que costuma SER o mesmo bloqueio
    // visto de outro ângulo), depois outro captcha: tem de parar.
    let s = decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: 0 }).captchasSeguidos;
    s = decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: s }).captchasSeguidos;
    const meio = decidirFalha({ code: CODIGO_SEM_PRODUTOS, captchasSeguidos: s });
    assert.equal(meio.captchasSeguidos, 2, "falha comum não pode apagar o rasto do bloqueio");
    assert.equal(meio.deveParar, false, "2 de 3 ainda não é motivo para parar");

    // O terceiro captcha depois da falha comum tem de disparar: se a falha
    // comum tivesse zerado o contador, este passaria despercebido e a corrida
    // seguiria contra a sessão bloqueada.
    const terceiro = decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: meio.captchasSeguidos });
    assert.equal(terceiro.deveParar, true, "o rasto sobreviveu à falha comum e o disjuntor disparou");
  });

  test("limiar configurável (CAPTCHAS_ATE_PARAR)", () => {
    assert.equal(decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: 0, captchasAteParar: 1 }).deveParar, true);
    assert.equal(decidirFalha({ code: CODIGO_CAPTCHA, captchasSeguidos: 3, captchasAteParar: 10 }).deveParar, false);
  });
});
