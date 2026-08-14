/**
 * Regressão visual.
 *
 * Mascarar dados vivos é o que separa um teste visual útil de um alarme falso
 * diário: contadores de vendas, datas de coleta e a barra de progresso mudam a
 * cada execução do coletor, e sem máscara qualquer coleta nova "reprovaria" o
 * layout.
 */
import { test, expect } from "@playwright/test";
import { congelarAnimacoes, limparEstadoLocal } from "./_apoio.js";

/** Áreas que mudam sozinhas e não descrevem o layout. */
async function mascaras(page) {
  const alvos = [
    page.locator("table tbody"), // linhas do ranking: dados vivos
    page.locator(".barra"), // barra de progresso da coleta
    page.locator("details"), // blocos com contagens variáveis
    page.getByText(/coleta de \d|há \d|\d{2}\/\d{2}\/\d{4}|\d+ produto\(s\)/i)
  ];
  const presentes = [];
  for (const alvo of alvos) {
    if ((await alvo.count()) > 0) presentes.push(alvo);
  }
  return presentes;
}

const TELAS = [
  { caminho: "/", nome: "categorias" },
  { caminho: "/ranking", nome: "ranking" },
  { caminho: "/shortlist", nome: "shortlist" }
];

test.describe("regressão visual", () => {
  for (const tela of TELAS) {
    test(`${tela.nome} mantém o layout`, async ({ page }) => {
      await page.goto(tela.caminho);
      await page.waitForLoadState("networkidle").catch(() => {});
      await limparEstadoLocal(page);
      await page.reload();
      await page.waitForLoadState("networkidle").catch(() => {});
      await congelarAnimacoes(page);
      // Deixa assentar o que ainda esteja a montar.
      await page.waitForTimeout(600);

      await expect(page).toHaveScreenshot(`${tela.nome}.png`, {
        mask: await mascaras(page),
        maskColor: "#3a3a3a",
        fullPage: false,
        // Tolerância pequena: absorve antialiasing de texto entre execuções
        // sem deixar passar mudança real de layout.
        maxDiffPixelRatio: 0.02,
        animations: "disabled"
      });
    });
  }
});
