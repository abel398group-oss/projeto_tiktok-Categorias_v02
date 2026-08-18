/**
 * Teste de validação: verifica se scrapeCategory.mjs carrega corretamente
 * com as políticas anti-ban integradas sem erros de sintaxe/importação.
 */
import { describe, test } from "node:test";
import assert from "node:assert";

describe("scraper module validation", () => {
  test("scrapeCategory.mjs pode ser importado sem erros", async () => {
    let module = null;
    let error = null;

    try {
      // Tenta importar o módulo
      module = await import("../src/scrapeCategory.mjs");
    } catch (e) {
      error = e;
    }

    assert.strictEqual(error, null, `Erro ao importar scrapeCategory.mjs: ${error?.message || error}`);
    assert.ok(module, "Módulo scrapeCategory.mjs deveria ser carregado");
  });

  test("anti-ban.mjs exporta ambas as políticas", async () => {
    const { createAntiBanPolicy, createRetryPolicy, sleepMs } = await import(
      "../src/scrape/anti-ban.mjs"
    );

    assert.ok(typeof createAntiBanPolicy === "function", "createAntiBanPolicy deveria ser função");
    assert.ok(typeof createRetryPolicy === "function", "createRetryPolicy deveria ser função");
    assert.ok(typeof sleepMs === "function", "sleepMs deveria ser função");

    // Valida que as políticas podem ser criadas
    const antiBan = createAntiBanPolicy();
    const retry = createRetryPolicy();

    assert.ok(antiBan.nextDelay, "Anti-ban deveria ter método nextDelay");
    assert.ok(antiBan.recordAction, "Anti-ban deveria ter método recordAction");
    assert.ok(antiBan.recordFailure, "Anti-ban deveria ter método recordFailure");
    assert.ok(antiBan.recordSuccess, "Anti-ban deveria ter método recordSuccess");

    assert.ok(retry.nextRetryDelay, "Retry deveria ter método nextRetryDelay");
    assert.ok(retry.recordFailure, "Retry deveria ter método recordFailure");
    assert.ok(retry.recordSuccess, "Retry deveria ter método recordSuccess");
  });

  test("políticas funcionam com valores padrão", async () => {
    const { createAntiBanPolicy, createRetryPolicy } = await import(
      "../src/scrape/anti-ban.mjs"
    );

    const antiBan = createAntiBanPolicy();
    const retry = createRetryPolicy();

    // Testa anti-ban
    const delay1 = antiBan.nextDelay();
    assert.ok(delay1 > 0, `Anti-ban delay ${delay1} deveria ser positivo`);
    assert.ok(delay1 <= 20000, `Anti-ban delay ${delay1} deveria estar dentro do limite padrão`);

    antiBan.recordAction();
    const delay2 = antiBan.nextDelay({ reason: "test" });
    assert.ok(delay2 > 0, "Delay após ação deveria ser positivo");

    // Testa retry
    const retryDelay1 = retry.nextRetryDelay();
    assert.ok(retryDelay1 > 0, `Retry delay ${retryDelay1} deveria ser positivo`);
    assert.ok(retryDelay1 <= 60000, `Retry delay ${retryDelay1} deveria estar dentro do limite padrão`);

    retry.recordFailure({ status: "test" });
    const retryDelay2 = retry.nextRetryDelay({ status: "test" });
    assert.ok(retryDelay2 > 0, "Retry delay após falha deveria ser positivo");
  });

  test("getState() retorna estado válido", async () => {
    const { createAntiBanPolicy, createRetryPolicy } = await import(
      "../src/scrape/anti-ban.mjs"
    );

    const antiBan = createAntiBanPolicy();
    const state1 = antiBan.getState();
    assert.ok(state1.consecutiveFailures >= 0, "Falhas deveriam ser >= 0");
    assert.ok(state1.actionCount >= 0, "Ações deveriam ser >= 0");
    assert.ok(state1.lastSuccessAt > 0, "Última execução deveria ter timestamp");

    const retry = createRetryPolicy();
    const state2 = retry.getState();
    assert.strictEqual(state2.retries, 0, "Inicialmente retries deveriam ser 0");
    assert.ok(state2.maxRetries > 0, "maxRetries deveria ser configurado");
  });
});
