/**
 * Teste de proteção PDP: valida que a política de PDP está integrada
 * e funciona com delays mais agressivos que o anti-ban normal.
 */
import { describe, test } from "node:test";
import assert from "node:assert";
import { createAntiBanPolicy, createRetryPolicy } from "../src/scrape/anti-ban.mjs";

describe("pdp-anti-ban protection", () => {
  test("pdp retry policy tem delays muito maiores que normal", () => {
    // Policy normal
    const normalRetry = createRetryPolicy({
      baseDelayMs: 5000,
      maxDelayMs: 60000,
      maxRetries: 4
    });

    // Policy PDP (muito mais agressiva)
    const pdpRetry = createRetryPolicy({
      baseDelayMs: 8000,
      maxDelayMs: 90000,
      maxRetries: 3,
      multiplier: 2.2
    });

    const normalDelay = normalRetry.nextRetryDelay({ status: "test" });
    const pdpDelay = pdpRetry.nextRetryDelay({ status: "pdp_security_check" });

    assert.ok(pdpDelay > normalDelay, `PDP delay ${pdpDelay} deveria ser > normal ${normalDelay}`);
    assert.ok(pdpDelay >= 8000, `PDP base delay deveria ser >= 8000`);
    assert.ok(pdpDelay <= 90000, `PDP max delay deveria ser <= 90000`);
  });

  test("pdp anti-ban policy tem window muito mais restritivo", () => {
    // Policy normal
    const normalAntiBan = createAntiBanPolicy({
      baseMinMs: 2000,
      baseMaxMs: 5000,
      maxActionsPerWindow: 6,
      windowMs: 90000
    });

    // Policy PDP (muito restritiva)
    const pdpAntiBan = createAntiBanPolicy({
      baseMinMs: 4000,
      baseMaxMs: 8000,
      maxActionsPerWindow: 2, // Bem restritivo!
      windowMs: 120000
    });

    const normalState = normalAntiBan.getState();
    const pdpState = pdpAntiBan.getState();

    assert.ok(pdpState.maxActionsPerWindow <= normalState.maxActionsPerWindow, 
      `PDP actions (${pdpState.maxActionsPerWindow}) deveria ser <= normal (${normalState.maxActionsPerWindow})`);
    assert.ok(pdpState.windowMs >= normalState.windowMs,
      `PDP window (${pdpState.windowMs}ms) deveria ser >= normal (${normalState.windowMs}ms)`);
  });

  test("pdp policy escala muito mais rápido que normal", () => {
    const normalRetry = createRetryPolicy({
      baseDelayMs: 5000,
      maxDelayMs: 60000,
      multiplier: 1.8
    });

    const pdpRetry = createRetryPolicy({
      baseDelayMs: 8000,
      maxDelayMs: 90000,
      multiplier: 2.2
    });

    const delays1Normal = [];
    const delays1Pdp = [];

    for (let i = 0; i < 3; i++) {
      delays1Normal.push(normalRetry.nextRetryDelay({ status: "test" }));
      normalRetry.recordFailure({ status: "test" });
      
      delays1Pdp.push(pdpRetry.nextRetryDelay({ status: "pdp_error" }));
      pdpRetry.recordFailure({ status: "pdp_error" });
    }

    // PDP deve escalar mais rápido
    const normalGrowth = delays1Normal[2] / delays1Normal[0];
    const pdpGrowth = delays1Pdp[2] / delays1Pdp[0];

    assert.ok(pdpGrowth > normalGrowth, 
      `PDP growth ${pdpGrowth.toFixed(2)} deveria ser > normal ${normalGrowth.toFixed(2)}`);
  });

  test("pdp anti-ban tem muito mais delay para captcha/challenge", () => {
    const pdpAntiBan = createAntiBanPolicy({
      baseMinMs: 4000,
      baseMaxMs: 8000,
      maxDelayMs: 45000
    });

    const normalDelay = pdpAntiBan.nextDelay({ reason: "scroll" });
    const captchaDelay = pdpAntiBan.nextDelay({ reason: "captcha" });
    const challengeDelay = pdpAntiBan.nextDelay({ reason: "challenge" });

    // Em PDP, captcha/challenge deve ser muito mais agressivo
    const captchaMultiplier = captchaDelay / normalDelay;
    const challengeMultiplier = challengeDelay / normalDelay;

    assert.ok(captchaMultiplier > 1.5, `Captcha multiplier ${captchaMultiplier.toFixed(2)} > 1.5`);
    assert.ok(challengeMultiplier > 1.5, `Challenge multiplier ${challengeMultiplier.toFixed(2)} > 1.5`);
  });

  test("pdp anti-ban pressão de ação + falha é acumulativa", () => {
    const pdpAntiBan = createAntiBanPolicy({
      baseMinMs: 4000,
      baseMaxMs: 8000,
      maxActionsPerWindow: 2,
      windowMs: 120000
    });

    // Registra ações
    pdpAntiBan.recordAction();
    pdpAntiBan.recordAction();

    const delayWithActions = pdpAntiBan.nextDelay({ reason: "window-limit" });

    // Adiciona falhas
    pdpAntiBan.recordFailure({ reason: "error" });
    pdpAntiBan.recordFailure({ reason: "error" });

    const delayWithActionsAndFailures = pdpAntiBan.nextDelay({ reason: "error" });

    assert.ok(delayWithActionsAndFailures > delayWithActions,
      `Delay com falhas ${delayWithActionsAndFailures} > com ações ${delayWithActions}`);
  });

  test("pdp retry tem limite de 3 tentativas vs 4 normal", () => {
    const normalRetry = createRetryPolicy({
      baseDelayMs: 5000,
      maxDelayMs: 60000,
      maxRetries: 4
    });

    const pdpRetry = createRetryPolicy({
      baseDelayMs: 8000,
      maxDelayMs: 90000,
      maxRetries: 3
    });

    const normalState = normalRetry.getState();
    const pdpState = pdpRetry.getState();

    assert.strictEqual(normalState.maxRetries, 4, "Normal deveria ter 4 retries");
    assert.strictEqual(pdpState.maxRetries, 3, "PDP deveria ter apenas 3 retries");
  });
});
