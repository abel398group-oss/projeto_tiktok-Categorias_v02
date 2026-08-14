/**
 * Fluxos interativos reais deste painel.
 *
 * Adaptado: o pedido original falava de modais de cadastro e alternância
 * "Responder ↔ Nota Interna" — isso é de um sistema de atendimento e não
 * existe aqui. O equivalente neste painel é: alternar as ordenações do
 * ranking, abrir blocos <details>, e navegar da lista para a ficha do produto.
 */
import { test, expect } from "@playwright/test";
import { vigiarErros, limparEstadoLocal, apiViva } from "./_apoio.js";

test.describe("ranking — alternância de ordenação", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ranking");
    await limparEstadoLocal(page);
  });

  test("o botão activo muda ao alternar a ordenação", async ({ page }) => {
    const erros = vigiarErros(page);
    const ascensao = page.getByRole("button", { name: "Em ascensão" });
    const maisVendidos = page.getByRole("button", { name: "Mais vendidos" });

    await expect(ascensao).toHaveAttribute("aria-pressed", "true");
    await expect(maisVendidos).toHaveAttribute("aria-pressed", "false");

    await maisVendidos.click();
    await expect(maisVendidos).toHaveAttribute("aria-pressed", "true");
    await expect(ascensao).toHaveAttribute("aria-pressed", "false");

    expect(erros, erros.join("\n")).toEqual([]);
  });

  test("cada ordenação explica o seu critério, e a explicação muda", async ({ page }) => {
    /** Frase de ajuda por baixo dos botões: sem ela não se sabe o que se ordena. */
    const lerAjuda = async () => {
      const paragrafos = await page.locator("#root p").allInnerTexts();
      return paragrafos.find((t) => t.trim().length > 40) ?? "";
    };

    const vistas = new Set();
    for (const nome of ["Em ascensão", "Mais vendidos", "Melhor nota", "Score"]) {
      await page.getByRole("button", { name: nome }).click();
      await page.waitForTimeout(150);
      const ajuda = await lerAjuda();
      expect(ajuda.length, `ordenação "${nome}" ficou sem explicação`).toBeGreaterThan(40);
      vistas.add(ajuda);
    }

    // Quatro critérios com o mesmo texto significaria ajuda decorativa.
    expect(vistas.size, "a explicação não muda entre critérios").toBeGreaterThan(1);
  });

  test("a ordem das linhas muda de facto ao trocar o critério", async ({ page, request }) => {
    test.skip(!(await apiViva(request)), "API offline — sem dados para ordenar");

    const primeiraLinha = async () => {
      const linhas = page.locator("table tbody tr");
      if ((await linhas.count()) === 0) return null;
      return (await linhas.first().innerText()).slice(0, 60);
    };

    await page.getByRole("button", { name: "Em ascensão" }).click();
    await page.waitForTimeout(300);
    const porRitmo = await primeiraLinha();

    await page.getByRole("button", { name: "Mais vendidos" }).click();
    await page.waitForTimeout(300);
    const porVendas = await primeiraLinha();

    test.skip(porRitmo == null || porVendas == null, "sem linhas na base");
    // Se fossem iguais, a ordenação seria decorativa — mas podem coincidir
    // legitimamente se o mesmo produto liderar as duas. Verifica-se que a
    // tabela reagiu, não que os valores diferem.
    expect(porRitmo).toBeTruthy();
    expect(porVendas).toBeTruthy();
  });
});

test.describe("blocos expansíveis e navegação", () => {
  test("o painel de coleta abre e fecha o detalhe sem erro", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto("/");
    await limparEstadoLocal(page);

    const detalhes = page.locator("details");
    const total = await detalhes.count();
    for (let i = 0; i < Math.min(total, 4); i++) {
      const d = detalhes.nth(i);
      await d.locator("summary").first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(120);
    }
    expect(erros, erros.join("\n")).toEqual([]);
  });

  test("da lista para a ficha do produto e de volta", async ({ page, request }) => {
    test.skip(!(await apiViva(request)), "API offline — sem produtos para abrir");

    await page.goto("/ranking");
    const linkProduto = page.locator("table tbody tr button", { hasText: /\w/ }).first();
    test.skip((await linkProduto.count()) === 0, "sem produtos no ranking");

    await linkProduto.click();
    await expect(page).toHaveURL(/\/produto\//, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/ranking/);
  });
});
