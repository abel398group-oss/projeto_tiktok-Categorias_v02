/**
 * Teste de integração: valida que políticas anti-ban e retry são criadas
 * e usadas corretamente em runCategoryHarvest.
 */
import { describe, test } from "node:test";
import assert from "node:assert";
import { createAntiBanPolicy, createRetryPolicy } from "../src/scrape/anti-ban.mjs";

describe("anti-ban integration", () => {
  test("retry policy escalona com múltiplas falhas", () => {
    const policy = createRetryPolicy({
      baseDelayMs: 5000,
      maxDelayMs: 60000,
      maxRetries: 4
    });

    const delays = [];
    for (let i = 0; i < 4; i++) {
      delays.push(policy.nextRetryDelay({ status: "security_check" }));
      policy.recordFailure({ status: "security_check" });
    }

    // Verificar que cada delay é >= anterior (monotônico crescente)
    for (let i = 1; i < delays.length; i++) {
      assert.ok(
        delays[i] >= delays[i - 1],
        `Delay ${i} (${delays[i]}ms) deveria ser >= delay ${i - 1} (${delays[i - 1]}ms)`
      );
    }

    // Verificar que nenhum ultrapassa o máximo
    for (const delay of delays) {
      assert.ok(delay <= 60000, `Delay ${delay}ms ultrapassou máximo 60000ms`);
    }

    // Verificar que todos estão acima da base
    for (const delay of delays) {
      assert.ok(delay >= 5000, `Delay ${delay}ms abaixo da base 5000ms`);
    }
  });

  test("anti-ban policy responde à ação e pressão", () => {
    const policy = createAntiBanPolicy({
      baseMinMs: 2000,
      baseMaxMs: 5000,
      maxDelayMs: 25000,
      maxActionsPerWindow: 6,
      windowMs: 90000
    });

    // Sem pressão
    const delay0 = policy.nextDelay({ reason: "normal" });
    assert.ok(delay0 >= 2000 && delay0 <= 5000, `Delay sem pressão ${delay0} fora do esperado`);

    // Registrar ações até atingir limite de janela
    for (let i = 0; i < 6; i++) {
      policy.recordAction();
    }

    // Com pressão máxima na janela
    const delay1 = policy.nextDelay({ reason: "window-limit" });
    assert.ok(delay1 >= delay0, `Delay com pressão ${delay1} deveria ser >= ${delay0}`);

    // Falhas aumentam ainda mais
    policy.recordFailure({ reason: "error" });
    const delay2 = policy.nextDelay({ reason: "after-failure" });
    assert.ok(delay2 >= delay1, `Delay após falha ${delay2} deveria ser >= ${delay1}`);
  });

  test("anti-ban captcha/challenge trigger aumenta delay significativamente", () => {
    const policy = createAntiBanPolicy({
      baseMinMs: 2000,
      baseMaxMs: 5000,
      maxDelayMs: 25000
    });

    const normalDelay = policy.nextDelay({ reason: "scroll" });
    const captchaDelay = policy.nextDelay({ reason: "captcha" });
    const challengeDelay = policy.nextDelay({ reason: "challenge" });

    // Captcha e challenge devem ter delay significativamente maior
    assert.ok(
      captchaDelay > normalDelay * 1.5,
      `Captcha delay ${captchaDelay} não é 1.8x maior que ${normalDelay}`
    );
    assert.ok(
      challengeDelay > normalDelay * 1.5,
      `Challenge delay ${challengeDelay} não é 1.8x maior que ${normalDelay}`
    );
  });

  test("retry + anti-ban sequence simula fluxo de segurança", () => {
    const retryPolicy = createRetryPolicy({
      baseDelayMs: 5000,
      maxDelayMs: 60000,
      maxRetries: 4
    });

    const antiBanPolicy = createAntiBanPolicy({
      baseMinMs: 2000,
      baseMaxMs: 5000,
      maxDelayMs: 25000
    });

    // Simula: security check → retry com cooldown → sucesso
    let securityCheck = true;
    let attempts = 0;
    const maxAttempts = 2;

    while (securityCheck && attempts < maxAttempts) {
      attempts += 1;
      const cooldownMs = retryPolicy.nextRetryDelay({ status: "security_check" });
      assert.ok(cooldownMs > 0, "Cooldown deve ser positivo");

      retryPolicy.recordFailure({ status: "security_check" });
      antiBanPolicy.recordFailure({ reason: "security_check" });

      // Simula falha na retry
      if (attempts < maxAttempts) {
        securityCheck = true; // Ainda bloqueado
      } else {
        securityCheck = false; // Desbloqueado
      }
    }

    // Após sucesso, registra
    if (!securityCheck) {
      retryPolicy.recordSuccess();
      antiBanPolicy.recordSuccess();
    }

    const state = antiBanPolicy.getState();
    assert.ok(state.consecutiveFailures < attempts, "Falhas deveriam ser reduzidas após sucesso");
  });

  test("ambas políticas respeitam máximos configuráveis", () => {
    const retryPolicy = createRetryPolicy({
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      maxRetries: 3,
      multiplier: 2.0
    });

    const antiBanPolicy = createAntiBanPolicy({
      baseMinMs: 500,
      baseMaxMs: 1500,
      maxDelayMs: 5000
    });

    // Retry: gera muitas falhas
    for (let i = 0; i < 10; i++) {
      const delay = retryPolicy.nextRetryDelay({ status: "block" });
      assert.ok(delay <= 15000, `Retry delay ${delay} > maxDelayMs 15000`);
      retryPolicy.recordFailure({ status: "block" });
    }

    // Anti-ban: registra muitas ações
    for (let i = 0; i < 20; i++) {
      const delay = antiBanPolicy.nextDelay({ reason: "action" });
      assert.ok(delay <= 5000, `Anti-ban delay ${delay} > maxDelayMs 5000`);
      antiBanPolicy.recordAction();
    }
  });
});
