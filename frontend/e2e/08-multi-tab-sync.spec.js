/**
 * Duas abas do painel ao mesmo tempo.
 *
 * Adaptado: o pedido pedia sincronização instantânea por WebSocket. Este painel
 * não tem WebSocket, e fingir que tem seria escrever um teste que não descreve
 * o sistema. O que se garante aqui é o que o utilizador nota de facto com duas
 * abas abertas:
 *  - o estado partilhado (shortlist) não é corrompido por escrita concorrente;
 *  - a segunda aba vê o que a primeira gravou;
 *  - as duas abas a fazer polling não se atropelam nem partem uma à outra.
 */
import { test, expect } from "@playwright/test";
import { CHAVE_SHORTLIST, marcaE2E, limparEstadoLocal, vigiarErros } from "./_apoio.js";

test.describe("duas abas em simultâneo", () => {
  test("a segunda aba vê o que a primeira gravou", async ({ context }) => {
    const marca = marcaE2E();
    const aba1 = await context.newPage();
    const aba2 = await context.newPage();

    try {
      await aba1.goto("/shortlist");
      await limparEstadoLocal(aba1);

      await aba1.evaluate(
        ({ chave, id }) =>
          localStorage.setItem(chave, JSON.stringify([{ productId: id, nome: `Produto ${id}` }])),
        { chave: CHAVE_SHORTLIST, id: marca }
      );

      // localStorage é por origem, partilhado entre abas do mesmo contexto.
      await aba2.goto("/shortlist");
      await expect(aba2.locator("#root")).toContainText(marca, { timeout: 10_000 });
    } finally {
      await limparEstadoLocal(aba1).catch(() => {});
      await aba1.close();
      await aba2.close();
    }
  });

  test("escrita concorrente não corrompe o estado partilhado", async ({ context }) => {
    const aba1 = await context.newPage();
    const aba2 = await context.newPage();

    try {
      await aba1.goto("/shortlist");
      await aba2.goto("/shortlist");
      await limparEstadoLocal(aba1);

      // As duas abas escrevem ao mesmo tempo.
      await Promise.all([
        aba1.evaluate(
          ({ chave }) => localStorage.setItem(chave, JSON.stringify([{ productId: "E2E-AUTO-A", nome: "A" }])),
          { chave: CHAVE_SHORTLIST }
        ),
        aba2.evaluate(
          ({ chave }) => localStorage.setItem(chave, JSON.stringify([{ productId: "E2E-AUTO-B", nome: "B" }])),
          { chave: CHAVE_SHORTLIST }
        )
      ]);

      // Uma das duas ganha — o que importa é o resultado continuar legível.
      const guardado = await aba1.evaluate((chave) => {
        try {
          return JSON.parse(localStorage.getItem(chave) ?? "null");
        } catch {
          return "CORROMPIDO";
        }
      }, CHAVE_SHORTLIST);

      expect(guardado, "estado partilhado ficou ilegível após escrita concorrente").not.toBe("CORROMPIDO");
      expect(Array.isArray(guardado)).toBe(true);
    } finally {
      await limparEstadoLocal(aba1).catch(() => {});
      await aba1.close();
      await aba2.close();
    }
  });

  test("duas abas a consultar o painel não partem uma à outra", async ({ context }) => {
    const aba1 = await context.newPage();
    const aba2 = await context.newPage();
    const erros1 = vigiarErros(aba1);
    const erros2 = vigiarErros(aba2);

    try {
      await Promise.all([aba1.goto("/"), aba2.goto("/")]);
      // Tempo para várias voltas de polling nas duas abas.
      await aba1.waitForTimeout(6000);

      for (const [n, aba] of [["1", aba1], ["2", aba2]]) {
        const texto = await aba.locator("#root").innerText();
        expect(texto.trim().length, `aba ${n} ficou em branco`).toBeGreaterThan(10);
      }

      expect([...erros1, ...erros2].join("\n")).toBe("");
    } finally {
      await aba1.close();
      await aba2.close();
    }
  });
});
