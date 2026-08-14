/**
 * Persistência: o que se guarda sobrevive ao F5.
 *
 * Adaptado: não há CRUD contra a base pela interface (o painel é de leitura;
 * quem escreve é o coletor). O que existe de escrita pelo utilizador é a
 * shortlist e as notas por produto, guardadas em localStorage — e é isso que
 * se testa aqui, incluindo a limpeza no fim.
 */
import { test, expect } from "@playwright/test";
import { CHAVE_SHORTLIST, marcaE2E, limparEstadoLocal, vigiarErros } from "./_apoio.js";

/** Lê a shortlist como a app a vê. */
async function lerShortlist(page) {
  return page.evaluate((chave) => {
    try {
      return JSON.parse(localStorage.getItem(chave) ?? "[]");
    } catch {
      return null;
    }
  }, CHAVE_SHORTLIST);
}

test.describe("shortlist — grava, sobrevive ao reload, e limpa", () => {
  let marca = "";

  test.beforeEach(async ({ page }) => {
    marca = marcaE2E();
    await page.goto("/shortlist");
    await limparEstadoLocal(page);
  });

  test.afterEach(async ({ page }) => {
    // Limpeza obrigatória: sem isto, um teste contamina o seguinte e a suíte
    // passa a depender da ordem de execução.
    await limparEstadoLocal(page).catch(() => {});
  });

  test("registo guardado continua lá depois de F5", async ({ page }) => {
    const erros = vigiarErros(page);

    await page.evaluate(
      ({ chave, entrada }) => {
        localStorage.setItem(chave, JSON.stringify([entrada]));
      },
      {
        chave: CHAVE_SHORTLIST,
        entrada: { productId: marca, nome: `Produto ${marca}`, addedAt: new Date().toISOString() }
      }
    );

    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});

    const depois = await lerShortlist(page);
    expect(Array.isArray(depois), "shortlist devia ser uma lista").toBe(true);
    expect(depois.some((e) => e.productId === marca), "o registo devia sobreviver ao reload").toBe(true);

    // E aparece na tela, não só no armazenamento.
    await expect(page.locator("#root")).toContainText(marca, { timeout: 10_000 });

    expect(erros, erros.join("\n")).toEqual([]);
  });

  test("depois de limpar, o registo não volta", async ({ page }) => {
    await page.evaluate(
      ({ chave, id }) => localStorage.setItem(chave, JSON.stringify([{ productId: id, nome: id }])),
      { chave: CHAVE_SHORTLIST, id: marca }
    );
    await limparEstadoLocal(page);
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});

    const depois = await lerShortlist(page);
    expect(depois ?? []).toEqual([]);
  });

  test("shortlist corrompida não parte a página", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.evaluate(
      (chave) => localStorage.setItem(chave, "{isto não é json válido"),
      CHAVE_SHORTLIST
    );
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});

    // A app tem de degradar para lista vazia, não para tela branca.
    const texto = await page.locator("#root").innerText();
    expect(texto.trim().length, "página em branco com armazenamento corrompido").toBeGreaterThan(10);
    expect(erros, erros.join("\n")).toEqual([]);
  });
});
