/**
 * Telemóvel (iPhone 13, 390px).
 *
 * A regra dura aqui é a rolagem horizontal: numa tabela larga como a do
 * ranking, é o defeito mais fácil de introduzir e o mais irritante de usar.
 */
import { test, expect } from "@playwright/test";
import { ROTAS, vigiarErros, limparEstadoLocal } from "./_apoio.js";

test.describe("mobile — 390px", () => {
  for (const rota of ROTAS.filter((r) => !r.redirecionaPara)) {
    test(`${rota.nome} não gera rolagem horizontal`, async ({ page }) => {
      const erros = vigiarErros(page);
      await page.goto(rota.caminho);
      await page.waitForLoadState("networkidle").catch(() => {});
      await limparEstadoLocal(page);

      const medida = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        cliente: document.documentElement.clientWidth
      }));

      // Tabela larga pode (e deve) rolar dentro do seu próprio contentor; o que
      // não pode é empurrar a PÁGINA para os lados.
      expect(
        medida.scroll - medida.cliente,
        `${rota.caminho}: página com ${medida.scroll - medida.cliente}px de rolagem horizontal ` +
          `(documento ${medida.scroll}px vs janela ${medida.cliente}px)`
      ).toBeLessThanOrEqual(2);

      expect(erros, erros.join("\n")).toEqual([]);
    });
  }

  test("a navegação continua alcançável e clicável no telemóvel", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Os links do menu têm de estar visíveis e não tapados por outro elemento:
    // `click` do Playwright falha sozinho se algo estiver por cima.
    const linkRanking = page.getByRole("link", { name: /ranking/i }).first();
    await expect(linkRanking).toBeVisible();
    await linkRanking.click({ timeout: 8000 });
    await expect(page).toHaveURL(/\/ranking/);
  });

  test("alvos de toque têm tamanho utilizável", async ({ page }) => {
    await page.goto("/ranking");
    await page.waitForLoadState("networkidle").catch(() => {});

    const botoes = page.getByRole("button");
    const total = Math.min(await botoes.count(), 6);
    test.skip(total === 0, "sem botões nesta tela");

    const pequenos = [];
    for (let i = 0; i < total; i++) {
      const b = botoes.nth(i);
      if (!(await b.isVisible())) continue;
      const caixa = await b.boundingBox();
      if (caixa && caixa.height < 24) {
        pequenos.push(`${(await b.innerText()).slice(0, 24)} (${Math.round(caixa.height)}px)`);
      }
    }
    expect(pequenos, `botões baixos demais para o dedo: ${pequenos.join(", ")}`).toEqual([]);
  });
});
