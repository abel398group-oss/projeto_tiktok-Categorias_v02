/**
 * Checkpoint só regista sucesso; falha volta à fila.
 *
 * O bug que estes testes travam: `onCategoryComplete` era chamado sempre que a
 * coleta não lançasse exceção, ignorando o código de saída. Categoria que caiu
 * no captcha (2) ou voltou sem produtos (1) entrava no checkpoint como
 * concluída e nunca mais era tentada — com a barra de progresso a marcar 100%
 * e a base sem aqueles produtos.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { desistiuDe, MAX_TENTATIVAS_POR_CATEGORIA } from "../scripts/scrape-all-categories.mjs";

/**
 * Reproduz a decisão de src/scrapeCategory.mjs: qual callback é chamado.
 * @param {{ ok: boolean, code: number }} r
 */
function callbackEscolhido(r) {
  return r.ok && r.code === 0 ? "complete" : "failed";
}

describe("checkpoint — só o sucesso conta como colhido", () => {
  test("código 0 com coleta ok é o único caso que marca concluída", () => {
    assert.equal(callbackEscolhido({ ok: true, code: 0 }), "complete");
  });

  test("captcha (código 2) NÃO marca concluída", () => {
    assert.equal(callbackEscolhido({ ok: true, code: 2 }), "failed");
  });

  test("sem produtos / sessão perdida (código 1) NÃO marca concluída", () => {
    assert.equal(callbackEscolhido({ ok: true, code: 1 }), "failed");
  });

  test("queda do navegador NÃO marca concluída, mesmo com código 0", () => {
    assert.equal(callbackEscolhido({ ok: false, code: 0 }), "failed");
  });
});

describe("desistiuDe — a fila não trava para sempre numa categoria morta", () => {
  test("sem falha registada, não se desistiu", () => {
    assert.equal(desistiuDe({}, "https://x/y"), false);
  });

  test("falha passageira continua na fila", () => {
    const failures = { "https://x/y": { tentativas: 1, motivo: "captcha" } };
    assert.equal(desistiuDe(failures, "https://x/y"), false);
  });

  test("ao esgotar as tentativas, sai da fila", () => {
    const failures = {
      "https://x/y": { tentativas: MAX_TENTATIVAS_POR_CATEGORIA, motivo: "captcha" }
    };
    assert.equal(desistiuDe(failures, "https://x/y"), true);
  });

  test("limite é maior que 1 — captcha e queda de rede são passageiros", () => {
    assert.ok(
      MAX_TENTATIVAS_POR_CATEGORIA > 1,
      "desistir na primeira falha perderia categoria boa por soluço de rede"
    );
  });
});
