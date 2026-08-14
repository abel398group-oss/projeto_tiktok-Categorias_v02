import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do painel do scraper.
 *
 * O `webServer` sobe o Vite sozinho e reaproveita um servidor já a correr
 * (`reuseExistingServer`), para o teste não competir com o dev server aberto
 * durante o desenvolvimento.
 *
 * A API (porta 3333) NÃO é gerida aqui de propósito: ela depende do Postgres e
 * do Docker. As suítes que precisam de dados reais verificam a ligação e
 * anunciam o salto em vez de falharem com erro de rede — um teste que falha
 * porque o Docker está parado não diz nada sobre o código.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Viewport fixo: snapshot visual com tamanho variável falha por motivo
    // errado (largura diferente), não por regressão real.
    viewport: { width: 1280, height: 900 }
  },

  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      testIgnore: /07-mobile-viewport/
    },
    {
      // Métricas do iPhone 13 sobre Chromium, em vez do preset completo (que
      // usa WebKit): o que estas suítes verificam é largura, toque e layout —
      // nada disso precisa de um segundo motor de render, e evita obrigar a
      // descarregar ~100 MB de browser extra para correr os testes.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true
      },
      testMatch: /07-mobile-viewport/
    }
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
