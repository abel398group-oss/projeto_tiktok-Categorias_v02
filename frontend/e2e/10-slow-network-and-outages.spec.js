/**
 * Rede lenta e API em falha.
 *
 * O caso que mais dói na prática: o botão de coletar dispara um trabalho de
 * minutos. Se ele não bloquear enquanto o pedido está a caminho, o duplo clique
 * lança duas coletas — dois Chrome a bater no TikTok pelo mesmo IP, que é
 * receita de captcha.
 */
import { test, expect } from "@playwright/test";
import { vigiarErros, limparEstadoLocal } from "./_apoio.js";

test.describe("rede lenta", () => {
  test("botão de coleta não aceita duplo clique enquanto trabalha", async ({ page }) => {
    let pedidos = 0;

    // Segura o arranque da coleta: simula o servidor a demorar a responder.
    await page.route("**/scrape/all/start", async (rota) => {
      pedidos++;
      await new Promise((r) => setTimeout(r, 3000));
      await rota.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, running: true })
      });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await limparEstadoLocal(page);

    const botao = page.getByRole("button", { name: /Coletar TODAS|Continuar coleta/i }).first();
    test.skip((await botao.count()) === 0, "botão de coleta não está nesta tela");

    // Rajada real de cliques: um humano nervoso clica 4 vezes em menos de meio
    // segundo. Usar `locator.click()` em sequência não serve — cada chamada
    // espera o elemento ficar acionável e os cliques espalham-se por segundos,
    // tempo em que a trava já teria libertado legitimamente.
    await botao.evaluate((el) => {
      for (let i = 0; i < 5; i++) el.click();
    });

    await page.waitForTimeout(4000);

    expect(
      pedidos,
      `a rajada de cliques disparou ${pedidos} coletas — duas coletas ao mesmo tempo levam a captcha`
    ).toBe(1);
  });

  test("resposta lenta não deixa a tela vazia sem sinal de vida", async ({ page }) => {
    await page.route("**/analytics/**", async (rota) => {
      await new Promise((r) => setTimeout(r, 2500));
      await rota.continue();
    });

    await page.goto("/ranking");
    // Enquanto os dados não chegam, tem de haver algo na tela.
    const texto = await page.locator("#root").innerText();
    expect(texto.trim().length, "tela vazia durante o carregamento").toBeGreaterThan(5);
    expect(texto).toMatch(/Ranking|carregar/i);
  });
});

test.describe("API em falha", () => {
  for (const status of [500, 502, 503]) {
    test(`erro ${status} vira aviso legível, não tela branca`, async ({ page }) => {
      const erros = vigiarErros(page);
      await page.route("**/analytics/**", (rota) =>
        rota.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: `falha simulada ${status}` })
        })
      );

      await page.goto("/ranking");
      await page.waitForLoadState("networkidle").catch(() => {});

      const texto = await page.locator("#root").innerText();
      expect(texto.trim().length, `tela em branco no ${status}`).toBeGreaterThan(10);
      expect(texto).toMatch(/Ranking/i);

      const quebras = erros.filter((e) => /Cannot read|undefined is not|Minified React/i.test(e));
      expect(quebras, `exceção de React no ${status}:\n${quebras.join("\n")}`).toEqual([]);
    });
  }

  test("resposta com JSON inválido não parte a app", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.route("**/analytics/**", (rota) =>
      rota.fulfill({ status: 200, contentType: "application/json", body: "{ isto não é json" })
    );

    await page.goto("/ranking");
    await page.waitForLoadState("networkidle").catch(() => {});

    const texto = await page.locator("#root").innerText();
    expect(texto.trim().length, "tela em branco com JSON inválido").toBeGreaterThan(10);

    const quebras = erros.filter((e) => /Cannot read|undefined is not|Minified React/i.test(e));
    expect(quebras, quebras.join("\n")).toEqual([]);
  });

  test("resposta vazia (204) não parte a app", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.route("**/analytics/**", (rota) => rota.fulfill({ status: 204, body: "" }));

    await page.goto("/ranking");
    await page.waitForLoadState("networkidle").catch(() => {});

    const texto = await page.locator("#root").innerText();
    expect(texto.trim().length, "tela em branco com resposta vazia").toBeGreaterThan(10);

    const quebras = erros.filter((e) => /Cannot read|undefined is not|Minified React/i.test(e));
    expect(quebras, quebras.join("\n")).toEqual([]);
  });
});
