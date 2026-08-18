function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function createAntiBanPolicy(options = {}) {
  const {
    baseMinMs = 1800,
    baseMaxMs = 4500,
    maxDelayMs = 20000,
    maxActionsPerWindow = 8,
    windowMs = 60000,
    failurePenalty = 0.35,
    successRecovery = 0.5,
  } = options;

  let consecutiveFailures = 0;
  let recentActions = [];
  let lastSuccessAt = Date.now();

  function pruneWindow(now = Date.now()) {
    recentActions = recentActions.filter((ts) => now - ts <= windowMs);
  }

  function recordAction() {
    const now = Date.now();
    pruneWindow(now);
    recentActions.push(now);
  }

  function recordFailure({ reason } = {}) {
    consecutiveFailures += 1;
    lastSuccessAt = Date.now();
    return { reason, consecutiveFailures };
  }

  function recordSuccess() {
    consecutiveFailures = Math.max(0, consecutiveFailures - 1);
    lastSuccessAt = Date.now();
  }

  function nextDelay({ reason } = {}) {
    const now = Date.now();
    pruneWindow(now);

    const actionPressure = recentActions.length / Math.max(1, maxActionsPerWindow);
    const failurePressure = consecutiveFailures * failurePenalty;
    const riskFactor = clamp(actionPressure + failurePressure, 0, 3);

    const baseDelay = baseMinMs * (1 + riskFactor * 0.9);
    const boundingDelay = baseMaxMs * (1 + riskFactor * 0.7);
    const deterministicFailureBoost = consecutiveFailures > 0 ? consecutiveFailures * baseMinMs * 0.55 : 0;
    const jitterWindow = Math.min(baseMinMs * 0.28, 450);
    const jitter = Math.random() * jitterWindow;

    let computed = baseDelay + deterministicFailureBoost + jitter;

    if (reason === "captcha" || reason === "challenge") {
      computed *= 1.8;
    }

    if (reason === "window-limit") {
      computed = Math.max(computed, baseMinMs * 2);
    }

    const cooldownFromSuccess = Math.max(0, Date.now() - lastSuccessAt);
    if (cooldownFromSuccess > 0) {
      computed *= 1 + Math.min(0.75, cooldownFromSuccess / 300000);
    }

    computed = clamp(computed, baseMinMs, maxDelayMs);
    computed = Math.min(computed, boundingDelay + deterministicFailureBoost + 2000);

    if (recentActions.length >= maxActionsPerWindow) {
      computed = Math.max(computed, baseMinMs * 2.5);
    }

    return Math.round(computed);
  }

  return {
    nextDelay,
    recordAction,
    recordFailure,
    recordSuccess,
    getState: () => ({
      consecutiveFailures,
      actionCount: recentActions.length,
      lastSuccessAt,
      maxActionsPerWindow,
      windowMs,
    }),
  };
}

export function createRetryPolicy(options = {}) {
  const {
    baseDelayMs = 3000,
    maxDelayMs = 60000,
    maxRetries = 5,
    multiplier = 1.8,
  } = options;

  let retries = 0;
  let lastFailureAt = 0;

  function recordFailure({ status } = {}) {
    retries += 1;
    lastFailureAt = Date.now();
    return { retries, status, nextDelayMs: nextRetryDelay({ status }) };
  }

  function recordSuccess() {
    retries = 0;
    lastFailureAt = 0;
  }

  function nextRetryDelay({ status } = {}) {
    const escalacao = Math.min(retries, maxRetries);
    const base = baseDelayMs * Math.pow(multiplier, escalacao);
    const bonus = status === "captcha" || status === "security_check" ? baseDelayMs * 0.75 : 0;
    const delay = Math.min(base + bonus, maxDelayMs);
    return Math.round(delay || baseDelayMs);
  }

  return {
    nextRetryDelay,
    recordFailure,
    recordSuccess,
    getState: () => ({ retries, maxRetries, lastFailureAt }),
  };
}

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function addHumanizedDelay({ minMs, maxMs, jitter = true }) {
  const a = Number(minMs) || 1000;
  const b = Number(maxMs) || a * 2;
  const delay = jitter ? randomBetween(a, b) : b;
  return Math.round(delay);
}
