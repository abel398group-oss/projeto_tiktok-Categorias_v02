# Anti-Ban Integration Guide

## Overview

The anti-ban system is a three-layer defense against TikTok Shop's bot detection:

1. **Retry Policy** (`createRetryPolicy`): Manages exponential backoff when facing security checks or rate limits
2. **Anti-Ban Policy** (`createAntiBanPolicy`): Humanizes delays during active scraping to avoid patterns
3. **Integration Points** in `runCategoryHarvest`: Applies policies to real-world scraping scenarios

## How It Works

### Layer 1: Retry Policy

**Triggered by**: Security checks, captchas, or persistent blocks
**Response**: Exponential cooldown between retries

```javascript
const retryPolicy = createRetryPolicy({
  baseDelayMs: 5000,      // Start with 5s
  maxDelayMs: 60000,      // Cap at 60s
  maxRetries: 4           // Try up to 4 times
});

// Each failure escalates: 5s → 9s → 16.2s → 29.16s → 60s (capped)
const cooldownMs = retryPolicy.nextRetryDelay({ status: "security_check" });
await sleepMs(cooldownMs);
retryPolicy.recordFailure({ status: "security_check" });
```

**Behavior**:
- Records success to reset escalation (`recordSuccess()`)
- Each failure multiplies delay by ~1.8x until maxRetries
- Bonus 75% delay added for captcha/security_check status

### Layer 2: Anti-Ban Policy

**Triggered during**: Active scraping (scrolling, clicking "View More", loading PDPs)
**Response**: Variable humanized pauses based on activity pressure

```javascript
const antiBanPolicy = createAntiBanPolicy({
  baseMinMs: 2000,              // Minimum pause
  baseMaxMs: 5000,              // Maximum base pause
  maxDelayMs: 25000,            // Hard cap
  maxActionsPerWindow: 6,       // Max 6 actions per 90s window
  windowMs: 90000               // Time window for rate limiting
});

// Track actions
antiBanPolicy.recordAction();
await scrollToLoadGrid(page);

// Calculate pressure-aware delay
const delay = antiBanPolicy.nextDelay({ reason: "scroll" });
await sleepMs(delay);
```

**Factors affecting delay**:
- **Action Pressure**: How many actions in current time window
- **Failure Pressure**: Consecutive failures accumulate (35% penalty each)
- **Special Cases**: Captcha/challenge triggers 1.8x multiplier
- **Recovery**: Success reduces pressure gradually

### Layer 3: Integration in runCategoryHarvest

#### Security Check Flow

```
1. Detect security challenge
2. If detected and < 2 attempts:
   - Calculate retry cooldown
   - Log attempt
   - Sleep with exponential backoff
   - Retry detection
3. If persists after retries:
   - Log as "security_check_persistent"
   - Return status: "tiktok_security_check"
4. If cleared:
   - Record success in both policies
   - Continue to scraping
```

#### Scraping Flow

```
1. Initial pause (500-1500ms)
2. Gentle mouse jiggle + record action
3. Scroll grid
   - Calculate anti-ban delay
   - Sleep (2-5s typically, higher if pressure)
   - Record action
4. Click "View More" while needed
   - Calculate anti-ban delay
   - Sleep
   - Record action
5. Stabilize feed
6. Extract router data
```

## Configuration

Environment variables can override defaults:

- `STEALTH=0`: Disable puppeteer-extra stealth (for manual login)
- `HEADED=1`: Run with visible Chrome for debugging
- `LOGIN_WAIT_MAX_MS`: Max time to wait for login/security challenge (default: 15min)

## Monitoring

### Console Output

```
[anti-ban] Security check detectado. Retry 1/2. Aguardando 5234ms...
[anti-ban] Security check detectado. Retry 2/2. Aguardando 9421ms...
```

### Policy State

Both policies expose `getState()` for debugging:

```javascript
console.log("Retry state:", retryPolicy.getState());
// { retries: 2, maxRetries: 4, lastFailureAt: 1724000000000 }

console.log("Anti-ban state:", antiBanPolicy.getState());
// {
//   consecutiveFailures: 1,
//   actionCount: 3,
//   lastSuccessAt: 1724000000000,
//   maxActionsPerWindow: 6,
//   windowMs: 90000
// }
```

## Testing

Unit tests validate core behavior:

```bash
node --test test/anti-ban.test.mjs
```

Tests cover:
- ✅ Delay grows after consecutive failures
- ✅ Pressure resets after success
- ✅ Window-based action limiting
- ✅ Retry escalation for captcha/security checks

## Best Practices

1. **Always use `sleepMs()` from anti-ban.mjs**
   - Replaces bare `setTimeout` 
   - Ensures timing is trackable

2. **Record actions around intensive operations**
   ```javascript
   antiBanPolicy.recordAction();
   await clickViewMoreWhileNeeded(page, () => byProductId.size);
   antiBanPolicy.recordAction();
   ```

3. **Check policy state if debugging unexpected delays**
   ```javascript
   if (antiBanPolicy.getState().consecutiveFailures > 2) {
     console.log("High failure pressure - slowdown expected");
   }
   ```

4. **Retry policy focuses on fatal errors**
   - Use for security checks, captchas, IP blocks
   - Not for transient network issues (those are in response handlers)

5. **Leave defaults unless you know what you're doing**
   - Current config tuned for TikTok Shop behavior
   - Changing multipliers can make detection likely or wasted time

## Future Improvements

- [ ] Persistent state across restarts (store retry/pressure history)
- [ ] Category-level cooldown tracking (e.g., "category X blocked for 2h")
- [ ] Integration with rotating proxy managers
- [ ] Machine learning on TikTok's response patterns
- [ ] Adaptive delays based on observed TikTok latency

## References

- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [src/scrape/anti-ban.mjs](../src/scrape/anti-ban.mjs) - Core implementation
- [test/anti-ban.test.mjs](../test/anti-ban.test.mjs) - Test suite
