/**
 * Varredura de rotas: nenhuma tela em branco, nenhum crash de React.
 *
 * Inclui um guardião que lê o App.jsx e falha se aparecer uma rota nova que
 * não esteja na lista testada — senão a cobertura degrada sozinha à medida que
 * a app cresce, e ninguém repara.
 */
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROTAS, vigiarErros, temConteudoRenderizado, limparEstadoLocal } from "./_apoio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe("smoke — todas as rotas respondem e renderizam", () => {
  for (const rota of ROTAS) {
    test(`${rota.nome} (${rota.caminho}) renderiza sem erro`, async ({ page }) => {
      const erros = vigiarErros(page);

      const resposta = await page.goto(rota.caminho, { waitUntil: "domcontentloaded" });
      expect(resposta?.status(), `HTTP de ${rota.caminho}`).toBeLessThan(400);

      await page.waitForLoadState("networkidle").catch(() => {});
      await limparEstadoLocal(page);

      const render = await temConteudoRenderizado(page);
      expect(render.ok, `${rota.caminho}: ${render.motivo}`).toBe(true);

      if (rota.redirecionaPara) {
        const url = new URL(page.url());
        expect(url.pathname, `${rota.caminho} devia redirecionar`).toBe(rota.redirecionaPara);
      }

      await expect(page.locator("#root")).toContainText(rota.esperaTexto, { timeout: 15_000 });

      expect(erros, `erros de consola em ${rota.caminho}:\n${erros.join("\n")}`).toEqual([]);
    });
  }

  test("rota inexistente não deixa a app em branco", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto("/rota-que-nao-existe-" + Date.now(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Numa SPA o servidor devolve o index; o que importa é a app não morrer.
    const render = await temConteudoRenderizado(page);
    expect(render.ok, `404: ${render.motivo}`).toBe(true);
    expect(erros, `erros de consola no 404:\n${erros.join("\n")}`).toEqual([]);
  });

  test("guardião: toda rota do App.jsx está coberta por esta suíte", async () => {
    const appJsx = await readFile(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

    // `path="x"` dentro de <Route>. Ficam de fora:
    //  - o index (não tem `path`);
    //  - rotas com parâmetro (`:id`), que precisam de um id real e são cobertas
    //    pela suíte de fluxos;
    //  - o catch-all `*`, coberto pelo teste de rota inexistente acima.
    const encontradas = [...appJsx.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
    const semParametro = encontradas.filter((p) => !p.includes(":") && p !== "*");
    const cobertas = new Set(ROTAS.map((r) => r.caminho.replace(/^\//, "")));

    const descobertas = semParametro.filter((p) => !cobertas.has(p.replace(/^\//, "")));
    expect(
      descobertas,
      `Rotas novas em App.jsx sem teste de smoke: ${descobertas.join(", ")}. ` +
        "Acrescente-as a ROTAS em e2e/_apoio.js."
    ).toEqual([]);
  });
});
