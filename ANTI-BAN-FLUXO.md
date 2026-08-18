# Fluxo Anti-Ban - Resumo da Implementação

## ✅ Status: COMPLETO E VALIDADO

### Componentes Implementados

#### 1. Módulo Anti-Ban (`src/scrape/anti-ban.mjs`)
- **createAntiBanPolicy()**: Pausa humanizada durante scraping
  - Rastreia ações em janelas de tempo (90s)
  - Aumenta delays com pressão de ações/falhas
  - Multiplica por 1.8x para captcha/challenge
  
- **createRetryPolicy()**: Backoff exponencial para bloqueios
  - Começa com 5s, escalona até 60s
  - Até 4 tentativas configuráveis
  - Reseta após sucesso

- **sleepMs()**: Função de pausa compatível com políticas

#### 2. Integração em scrapeCategory.mjs
```
a) Importação das políticas
b) Inicialização no runCategoryHarvest()
c) Security check retry loop (2 tentativas com cooldown)
d) Anti-ban durante scroll/view-more (pausas humanizadas)
e) Registro de sucesso/falha em ambas as políticas
```

#### 3. Testes Validados
- ✅ `test/anti-ban.test.mjs` (4 testes)
- ✅ `test/anti-ban-integration.test.mjs` (5 testes)
- ✅ `test/scraper-validation.test.mjs` (4 testes)
- **Total**: 13 testes, 100% pass rate

#### 4. Documentação
- ✅ `docs/ANTI-BAN-INTEGRATION.md` - Guia completo

### Fluxo de Execução

#### Teste Rápido
```bash
npm run coleta:uma
# Executa uma coleta simples na categoria padrão
# Ambiente: headless por padrão
```

#### Com Interface Gráfica
```bash
$env:HEADED="1"; npm run coleta:uma
# Abre navegador Chrome visível para debug/login
```

#### Completo (com galeria PDP)
```bash
$env:PDP_GALLERY="1"; npm run coleta:uma
# Além da grelha, abre cada PDP para fotos + preço hero
```

#### Com Diagnóstico
```bash
$env:SCRAPE_DIAGNOSTIC="1"; npm run coleta:uma
# Captura snapshots intermediários para debug
```

#### Com Rede/Caça (debug)
```bash
$env:NET_LOG="1"; node src/scrapeCategory.mjs --debug
# Loga tráfego de rede e pistas de dados
```

### Comportamento Esperado Durante Execução

1. **Aquecimento** (5-10s)
   - Browser inicia
   - Cookies carregam (se existentes)
   - Conecta ao TikTok Shop

2. **Navegação** (3-5s)
   - Acessa categoria padrão
   - Detecta security check (se houver)
   
3. **Security Check (se ocorrer)**
   ```
   [anti-ban] Security check detectado. Retry 1/2. Aguardando 5234ms...
   [anti-ban] Security check detectado. Retry 2/2. Aguardando 9421ms...
   ```

4. **Scraping com Pausa Anti-Ban**
   ```
   - Scroll: pausa 2-5s (aumenta com pressão)
   - Click View More: pausa 2-5s
   - Stabilize: até 5s
   ```

5. **Extração** (2-10s)
   - Parse data do router
   - Merge com responses do XHR

6. **Saída**
   - `output/dados_produtos.json` - Lista de produtos
   - `output/dados_lojas.json` - Lista de lojas
   - `output/extra/modern_router_peek.json` - Debug data

### Monitoramento

**Console Output**:
```
[net→] GET  xhr  https://shop.tiktok.com/.../list...
[net←] 200  xhr  application/json ...
[caca] json: score=95 size=45231 url=...
[anti-ban] Security check detectado. Retry 1/2...
[modern_router] dados_produtos.json | subkeys na rota
[pdp_gallery] Concluído: 10 visitas
```

**Arquivos de Debug**:
- `output/extra/rede_ultima_execucao.log` - Tráfego
- `output/extra/caca_dados.jsonl` - Pistas de dados
- `output/extra/post_goto_diagnostic.json` - Estado intermediário

### Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| HEADED | 0 | 1=Abrir Chrome visível |
| STEALTH | 1 | 1=Ativar anti-detecção |
| PDP_GALLERY | 0 | 1=Abrir PDPs para fotos |
| PDP_GALLERY_MAX | 25 | Máximo de PDPs |
| SCRAPE_DIAGNOSTIC | 0 | 1=Capturar diagnóstico |
| NET_LOG | 0 | 1=Log de rede, verbose=tudo |
| HUNT_LOG | 0 | 1=Caçar pistas de dados |
| LOGIN_WAIT_MAX_MS | 900000 | Timeout p/ login (15min) |
| OUTPUT_DIR | output | Pasta de saída |

### Próximas Etapas (Futuro)

- [ ] Persistir estado de retry entre execuções
- [ ] Cooldown por categoria (evitar recoleta rápida)
- [ ] Integração com proxy rotativo
- [ ] ML para tuning adaptativo de delays
- [ ] Webhook para alertas de bloqueio

### Troubleshooting

**Problema**: Security check não resolve
- **Solução**: Use `HEADED=1`, resolva manualmente na janela

**Problema**: Demora muito entre ações
- **Solução**: Normal! Anti-ban desacelera propositalmente

**Problema**: "sem #__MODERN_ROUTER_DATA__"
- **Solução**: Página não carregou. Aguarde ou aumente `networkidle2` timeout

**Problema**: Poucos produtos coletados
- **Solução**: Aumentar `VIEW_MORE_MAX_CLICKS` ou esperar por mais dados do XHR

