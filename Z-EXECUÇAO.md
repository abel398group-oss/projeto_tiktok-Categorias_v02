# Comandos de execução

Na pasta do projeto (`npm install` já feito). **Dados reais (produtos):** só `output/dados_produtos.json`. Técnica, lojas, caça, debug, rede, snapshots e `teste_categoria.json` → `output/extra/`.

---

## Principal — coleta de categoria (headless, rápido)

```bash
npm run scrape:category
```

Equivale a `node src/scrapeCategory.mjs`. Usa `CATEGORY_URL` se definir; senão a URL padrão no código (categoria de exemplo no `scrapeCategory.mjs`).

Outra categoria:

```bash
set CATEGORY_URL=https://shop.tiktok.com/br/c/SEU_ID/... && npm run scrape:category
```

*(Em Git Bash / Linux use `export CATEGORY_URL=...`.)*

---

## Principal — categoria + fotos do PDP (demora mais)

Abre até **25** páginas de produto e preenche `fotos_pdp` / `images_pdp`.

```bash
npm run scrape:category:pdp
```

Ajustar quantos PDPs (ex.: 10):

```bash
cross-env PDP_GALLERY=1 PDP_GALLERY_MAX=10 node src/scrapeCategory.mjs
```

---

## Login / browser visível

Se a sessão cair fora de `shop.tiktok.com` em headless:

```bash
npm run scrape:category:headed
```

Espera login conforme `LOGIN_WAIT_MAX_MS` (só com headed).

Sessão limpa (não reutilizar perfil):

```bash
cross-env FRESH_SESSION=1 node src/scrapeCategory.mjs
```

Perfil de login (padrão do projeto, se existir): `.chrome-tiktok-profile` — ou defina `CHROME_USER_DATA`.

---

## Testes (regressão do parser)

```bash
npm test
```

---

## Outros scripts (npm)

| Comando | Uso resumido |
|--------|---------------|
| `npm run scrape:category:debug` | `--debug` (log e rede conforme regras do script) |
| `npm run scrape:category:longlogin` | Navegador visível + timeout longo de login |
| `npm run scrape:category:snap` | Snapshots JSON de debug (JSON_SNAPSHOT) |
| `npm run scrape:category:discover` | Modo descoberta de URLs (DISCOVER) |
| `npm run scrape:category:caca` | Caça a dados (HUNT, rede) — investigação |
| `npm run scrape:category:peek` | Amostra maior do router (`ROUTER_PEEK_LEN`) |

---

## Variáveis de ambiente úteis

| Variável | Efeito |
|----------|--------|
| `CATEGORY_URL` | URL da categoria TikTok Shop a raspar (substitui o default) |
| `HEADED=1` | Abre o Chrome (não headless) |
| `PDP_GALLERY=1` / `true` | Após a grelha, visita PDPs e preenche `fotos_pdp` |
| `PDP_GALLERY_MAX` | Máx. de produtos com PDP (1–500; default 25 com o script pdp) |
| `FRESH_SESSION=1` | Não reutilizar `CHROME_USER_DATA` / perfil padrão |
| `CHROME_USER_DATA` | Caminho do perfil do Chrome a usar |
| `NET_LOG=0` | Desliga log de rede quando `--debug` estiver ativo |
| `ROUTER_PEEK_LEN` | Tamanho da amostra em `output/extra/modern_router_peek.json` (0 = sem amostra) |

Detalhe fino: ver comentários no topo de `src/scrapeCategory.mjs` e `docs/ARCHITECTURE.md` (se existir).
