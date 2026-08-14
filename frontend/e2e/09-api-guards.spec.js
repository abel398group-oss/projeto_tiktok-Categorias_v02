/**
 * Proteção da API.
 *
 * Adaptado: o pedido falava de RBAC e de utilizadores com papéis diferentes.
 * Este sistema não tem utilizadores nem sessão — a API é protegida por uma
 * chave estática (`x-api-key` / `Authorization: Bearer`) e o painel é de uso
 * pessoal. Testar "operador vs administrador" seria testar algo inexistente.
 *
 * O que existe e importa proteger é: a chave é mesmo exigida, uma chave errada
 * não passa, e o painel reage a 401/403 sem mentir sucesso nem ficar em branco.
 */
import { test, expect } from "@playwright/test";
import { vigiarErros, apiViva } from "./_apoio.js";

const API = "http://127.0.0.1:3333";

test.describe("chave de API", () => {
  test("sem chave, a API recusa", async ({ request }) => {
    test.skip(!(await apiViva(request)), "API offline");
    const r = await request.get(`${API}/analytics/product-score`, { failOnStatusCode: false });
    expect([401, 403], `esperava recusa, veio ${r.status()}`).toContain(r.status());
  });

  test("com chave errada, a API recusa", async ({ request }) => {
    test.skip(!(await apiViva(request)), "API offline");
    const r = await request.get(`${API}/analytics/product-score`, {
      headers: { "x-api-key": "chave-errada-de-proposito" },
      failOnStatusCode: false
    });
    expect([401, 403], `chave inválida devia ser recusada, veio ${r.status()}`).toContain(r.status());
  });

  test("a recusa não devolve dados nem detalhes internos", async ({ request }) => {
    test.skip(!(await apiViva(request)), "API offline");
    const r = await request.get(`${API}/analytics/product-score`, { failOnStatusCode: false });
    const corpo = await r.text();

    // Mensagem de erro não deve vazar caminho de ficheiro, SQL nem stack trace.
    expect(corpo, "a resposta de recusa traz stack trace").not.toMatch(/at \w+ \(.*:\d+:\d+\)/);
    expect(corpo, "a resposta de recusa traz caminho do servidor").not.toMatch(/[A-Z]:\\Users\\/i);
    expect(corpo, "a resposta de recusa traz SQL").not.toMatch(/SELECT .* FROM/i);
    // E não traz a lista de produtos.
    expect(corpo).not.toMatch(/"productId"/);
  });

  test("o painel reage a 401 sem ficar em branco nem fingir sucesso", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.route("**/analytics/**", (rota) =>
      rota.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "chave inválida" })
      })
    );

    await page.goto("/ranking");
    await page.waitForLoadState("networkidle").catch(() => {});

    const texto = await page.locator("#root").innerText();
    expect(texto.trim().length, "tela em branco perante 401").toBeGreaterThan(10);

    // Não pode anunciar produtos que não recebeu (zero é honesto; N>0 seria mentira).
    const anunciados = texto.match(/(\d+) produto\(s\)/);
    if (anunciados) {
      expect(Number(anunciados[1]), "a app listou produtos que a API recusou dar").toBe(0);
    }

    // E tem de dizer que algo correu mal — senão o utilizador lê "0 produtos"
    // como "a base está vazia" e vai coletar de novo sem necessidade, quando o
    // problema era a chave de acesso.
    const avisa = /erro|falhou|falha|inválid|não foi possível|401|sem acesso|recus/i.test(texto);
    expect(avisa, `perante 401 a app não avisa de nada. Texto:\n${texto.slice(0, 400)}`).toBe(true);

    const quebras = erros.filter((e) => /Cannot read|undefined is not|Minified React/i.test(e));
    expect(quebras, quebras.join("\n")).toEqual([]);
  });
});
