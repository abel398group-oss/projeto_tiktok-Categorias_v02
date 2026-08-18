# PDP Anti-Ban Integration - Enhancement Complete

## Status
✅ **IMPLEMENTADO** - A função `enrichByProductIdWithPdpGallery()` agora tem proteção anti-ban específica para PDPs.

## Problema
TikTok detecta rapidamente scraping de PDPs (Product Detail Pages). Cada PDP é uma navegação nova, acionando:
- Security checks mais agressivos
- Captchas
- Rate limiting
- IP blocks

## Solução Implementada

### 1. **Policy PDP Separada (Muito Mais Agressiva)**

#### Retry Policy PDP
```javascript
{
  baseDelayMs: 8000,      // 8s (vs 5s normal)
  maxDelayMs: 90000,      // 90s (vs 60s normal)
  maxRetries: 3,          // 3 (vs 4 normal)
  multiplier: 2.2         // 2.2x (vs 1.8x normal)
}
```

#### Anti-Ban Policy PDP
```javascript
{
  baseMinMs: 4000,        // 4s min (vs 2s normal)
  baseMaxMs: 8000,        // 8s max (vs 5s normal)
  maxDelayMs: 45000,      // Teto muito alto
  maxActionsPerWindow: 2, // MUITO restritivo (vs 6 normal)
  windowMs: 120000        // 120s janela (vs 90s normal)
}
```

### 2. **Detecção de Security Check Dupla**

```javascript
// Antes de goto PDP
let hasSecurityCheck = await detectTiktokSecurityChallenge(workerPage);
if (hasSecurityCheck) {
  // Retry com cooldown e nova página
}

// Depois de goto PDP
hasSecurityCheck = await detectTiktokSecurityChallenge(workerPage);
if (hasSecurityCheck) {
  // Retry com cooldown e nova página
}

// Depois de render (aguardar dados)
const hasSecCheckAfterRender = await detectTiktokSecurityChallenge(workerPage);
if (hasSecCheckAfterRender) {
  // Retry com cooldown
}
```

### 3. **Retry Loop Com Cooldown**

```javascript
while (attempts < maxAttempts) {
  attempts += 1;
  try {
    // Tenta acessar PDP
    // Se sucesso:
    pdpRetryPolicy.recordSuccess();
    pdpAntiBanPolicy.recordSuccess();
    return true;
  } catch (e) {
    // Se erro:
    pdpRetryPolicy.recordFailure({ status: "pdp_error" });
    pdpAntiBanPolicy.recordFailure({ reason: "pdp_error" });
    
    if (attempts < maxAttempts) {
      const cooldownMs = pdpRetryPolicy.nextRetryDelay({ status: "pdp_error" });
      await sleepMs(cooldownMs);
      // Cria nova página para tentar novamente
    }
  }
}
```

### 4. **Delay Agressivo Entre Lotes de PDPs**

```javascript
// Após processar lote (concurrency=2)
const pdpDelayMs = pdpAntiBanPolicy.nextDelay({ reason: "pdp-batch" });
const batchDelayMs = Math.max(pdpDelayMs, 3000); // Mín 3s entre lotes
await sleepMs(batchDelayMs);
pdpAntiBanPolicy.recordAction();
```

## Configuração de Ambiente

```bash
# Ativar PDP gallery
$env:PDP_GALLERY="1"

# Máximo de imagens por PDP
$env:PDP_GALLERY_MAX="5"

# Concorrência (1-2, recomendado 1 para segurança)
$env:PDP_GALLERY_CONCURRENCY="1"

# Logging detalhado
$env:NET_LOG="1"
$env:HUNT_LOG="1"
```

## Teste da Integração

```bash
# Todos os testes passando (19 testes, 100% pass rate)
node --test test/anti-ban*.test.mjs test/pdp-*.test.mjs test/scraper-*.test.mjs

# Teste específico de PDP
node --test test/pdp-protection.test.mjs

# Validação de módulo
node --test test/scraper-validation.test.mjs
```

### Testes Adicionados (test/pdp-protection.test.mjs)
- ✅ PDP retry tem delays muito maiores que normal
- ✅ PDP anti-ban tem window muito mais restritivo
- ✅ PDP policy escala muito mais rápido que normal
- ✅ PDP anti-ban tem muito mais delay para captcha/challenge
- ✅ PDP anti-ban pressão de ação + falha é acumulativa
- ✅ PDP retry tem limite de 3 tentativas vs 4 normal

## Diferenças: Categoria vs PDP

| Aspecto | Categoria | PDP |
|---------|-----------|-----|
| Base Retry Delay | 5s | 8s (+60%) |
| Max Retry Delay | 60s | 90s (+50%) |
| Max Retries | 4 | 3 |
| Retry Multiplier | 1.8x | 2.2x (+22%) |
| Min Action Delay | 2s | 4s (+100%) |
| Max Action Delay | 5s | 8s (+60%) |
| Max Delay Cap | 25s | 45s (+80%) |
| Actions/Window | 6 | 2 (-67%) |
| Window Duration | 90s | 120s (+33%) |
| Entre-Lotes Delay | 250-700ms | 3s+ (10x+) |

## Fluxo Seguro de PDP

```
1. Detecta security check PRÉ-goto
   └─> Sim: Cooldown 8-16s, retry com nova página

2. Goto PDP + sync browser context
   └─> Detecta security check PÓS-goto
       └─> Sim: Cooldown 8-16s, retry com nova página

3. Aguarda render (headline + router data)
   └─> Detecta security check PÓS-render
       └─> Sim: Cooldown 8-16s, continua retry

4. Coleta dados (imagens, preços, reviews)
   └─> Registra ações na policy de PDP
   └─> Delay 4-8s entre operações

5. Sucesso registrado
   └─> pdpRetryPolicy.recordSuccess()
   └─> pdpAntiBanPolicy.recordSuccess()

6. Próximo lote de PDPs
   └─> Delay 3s+ (calculado pela policy)
   └─> Volta ao passo 1
```

## Cenários de Proteção

### Scenario 1: Security Check Detectado
```
Tentativa 1: Detecta challenge → Cooldown 8s → Retry
Tentativa 2: Detecta challenge → Cooldown 18s (8*2.2) → Retry
Tentativa 3: Detecta challenge → Cooldown 40s (18*2.2) → Falha
Resultado: Salta PDP, continua próximo
```

### Scenario 2: Sucesso Na Primeira
```
Tentativa 1: Sucesso
Resultado: Registra em ambas policies, próximo lote com delay 3-8s
```

### Scenario 3: Taxa de Ação Alta
```
Ação 1: Registra, delay 4-8s
Ação 2: Registra, delay 4-8s
Ação 3: Aguarda janela? Sim → Teto 45s
```

## Monitoramento

Logs mostram:
```
[pdp-anti-ban] product_123: Security check antes de goto. Cooldown 8000ms...
[pdp-anti-ban] product_123: Security check detectado em PDP. Retry 1/3. Cooldown 8000ms...
[pdp-anti-ban] product_123: Erro na tentativa 2/3. Cooldown 17600ms...
[pdp-anti-ban] Pausa entre lotes: 5200ms...
[pdp_gallery] product_123 → 8 url(s) (router:6 dom:2)
[pdp_gallery] product_123 preço: 29.99, "de" DOM: 49.99
```

## Recomendações de Uso

1. **Começar com PDP_GALLERY_CONCURRENCY=1** (não usar paralelo)
2. **Monitorar logs** - Procure por "security check" repetido
3. **Se houver blocks** - Aumentar delays manualmente com env vars
4. **Testar pequeno primeiro** - 5-10 PDPs antes de rodar full
5. **Validar output** - Verificar presença de images_pdp e preços

## Próximas Melhorias

- [ ] Proxy rotation ao detectar pattern de blocks
- [ ] Persistência de estado entre execuções
- [ ] Cooldown global entre coletas (1-2h)
- [ ] Configuração dinâmica por categoria
- [ ] Detecção de IP block permanente
