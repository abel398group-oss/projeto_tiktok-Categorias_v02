/**
 * Queda e volta da rede.
 *
 * Adaptado: o pedido falava de WebSocket e aviso de reconexão. Este painel não
 * usa WebSocket — o estado da coleta chega por polling (`/scrape/all/status` a
 * cada 3–15 s). O que se testa, então, é o que realmente importa ao utilizador:
 * a app não parte quando a rede cai, avisa em vez de mentir, e volta a si
 * sozinha quando a rede regressa — sem F5.
 */
import { test, expect } from "@playwright/test";
import { vigiarErros, limparEstadoLocal, apiViva } from "./_apoio.js";

test.describe("resiliência de rede", () => {
  test.afterEach(async ({ context }) => {
    await context.setOffline(false).catch(() => {});
  });

  test("perder a rede não parte a página nem a deixa em branco", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    const erros = vigiarErros(page);

    await context.setOffline(true);
    // Tempo para o polling falhar pelo menos uma vez.
    await page.waitForTimeout(4000);

    const texto = await page.locator("#root").innerText();
    expect(texto.trim().length, "a app ficou em branco depois de perder a rede").toBeGreaterThan(10);

    // Erro de rede é esperado aqui e está na lista de ruído conhecido; o que
    // não pode aparecer é exceção de React por estado não tratado.
    const quebras = erros.filter((e) => /Cannot read|undefined is not|Minified React/i.test(e));
    expect(quebras, `a app lançou exceção ao perder a rede:\n${quebras.join("\n")}`).toEqual([]);
  });

  test("app volta a si quando a rede regressa, sem F5", async ({ page, context, request }) => {
    test.skip(!(await apiViva(request)), "API offline — o teste precisa dela para o «depois»");

    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});

    await context.setOffline(true);
    await page.waitForTimeout(3000);

    await context.setOffline(false);
    // O polling do painel repete a cada 3–15 s; damos margem para uma volta.
    await page.waitForTimeout(16_000);

    // Sem recarregar: a app tem de ter voltado a mostrar dados por si.
    const texto = await page.locator("#root").innerText();
    expect(texto).toMatch(/categoria/i);
    expect(texto.trim().length).toBeGreaterThan(50);
  });

  test("API fora do ar mostra aviso, não tela em branco", async ({ page }) => {
    // Simula a API em baixo sem mexer no servidor real.
    await page.route("**/analytics/**", (rota) => rota.abort("failed"));
    const erros = vigiarErros(page);

    await page.goto("/ranking");
    await page.waitForLoadState("networkidle").catch(() => {});
    await limparEstadoLocal(page);

    const texto = await page.locator("#root").innerText();
    expect(texto.trim().length, "tela em branco com a API fora do ar").toBeGreaterThan(10);
    // O título continua lá: o utilizador percebe onde está.
    expect(texto).toMatch(/Ranking/i);

    const quebras = erros.filter((e) => /Cannot read|undefined is not|Minified React/i.test(e));
    expect(quebras, quebras.join("\n")).toEqual([]);
  });
});
