import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createAntiBanPolicy, createRetryPolicy } from "../src/scrape/anti-ban.mjs";

describe("anti-ban policy", () => {
  test("aumenta o delay após falhas consecutivas", () => {
    const policy = createAntiBanPolicy({
      baseMinMs: 1000,
      baseMaxMs: 2000,
      maxDelayMs: 10000,
    });

    const first = policy.nextDelay({ reason: "soft-fail" });
    policy.recordFailure({ reason: "soft-fail" });
    const second = policy.nextDelay({ reason: "soft-fail" });

    assert.ok(second >= first, "delay precisa crescer com falhas consecutivas");
    assert.ok(second <= 10000, "delay não pode ultrapassar o limite");
  });

  test("reseta a pressão após sucesso", () => {
    const policy = createAntiBanPolicy({ baseMinMs: 500, baseMaxMs: 800 });

    policy.recordFailure({ reason: "captcha" });
    policy.recordFailure({ reason: "captcha" });
    const afterFailure = policy.nextDelay({ reason: "captcha" });

    policy.recordSuccess();
    const afterSuccess = policy.nextDelay({ reason: "success" });

    assert.ok(afterSuccess < afterFailure, "sucesso deve reduzir o risco de banimento");
  });

  test("mantém o fluxo dentro do limite por janela", () => {
    const policy = createAntiBanPolicy({
      baseMinMs: 150,
      baseMaxMs: 300,
      maxActionsPerWindow: 3,
      windowMs: 1000,
    });

    policy.recordAction();
    policy.recordAction();
    policy.recordAction();

    const delay = policy.nextDelay({ reason: "window-limit" });

    assert.ok(delay >= 150, "deve aplicar espera mínima antes de continuar");
    assert.ok(delay <= 2000, "delay deve respeitar o teto esperável");
  });

  test("retry escalona cooldown para bloqueios consecutivos", () => {
    const policy = createRetryPolicy({
      baseDelayMs: 2000,
      maxDelayMs: 20000,
      maxRetries: 4,
    });

    const first = policy.nextRetryDelay({ status: "captcha" });
    policy.recordFailure({ status: "captcha" });
    const second = policy.nextRetryDelay({ status: "captcha" });

    assert.ok(second > first, "retry deve aumentar o cooldown após falha repetida");
    assert.ok(second <= 20000, "retry não deve extrapolar o teto");
  });
});
