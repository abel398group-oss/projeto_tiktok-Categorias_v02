# Arquitetura — projeto TikTok Shop (categorias)

## Objetivo

Scraper de **categoria** (grelha) no **TikTok Shop** com **Puppeteer**: interceptar `application/json` e o JSON embebido `__MODERN_ROUTER_DATA__` no HTML, **sem abrir PDP** (reduz risco de puzzle/anti‑bot na página de produto).

## Stack

- **Node.js** (ES modules), **Puppeteer** + `puppeteer-extra` + **Stealth**
- `setRequestInterception(true)` com `request.continue()` em todos os pedidos
- `page.on('response')` para ler corpos de respostas alvo

## Ponto de entrada

| Ficheiro | Papel |
|----------|--------|
| `src/scrapeCategory.mjs` | Único script principal: launch browser, `goto` categoria, scroll, coleta, escrita `output/` |

## Fluxo de dados (resumo)

1. Navegação para `CATEGORY_URL` (ou `DEFAULT_URL` no código).
2. Sessão persistente: diretório de perfil Chrome (`.chrome-tiktok-profile` por defeito; override `CHROME_USER_DATA="..."`; limpar com `FRESH_SESSION=1`).
3. Relevante para login interativo: `HEADED=1`, `LOGIN_WAIT_MAX_MS` (aumenta se necessário) até `shop.tiktok.com`.
4. Heurísticas em respostas JSON (URLs com `oec`, `list`, `shop.tiktok`, etc.), filtrando **telemetria** (MCS, Slardar, monitor, batch 204, …).
5. Dados iniciais no DOM: leitura de `#__MODERN_ROUTER_DATA__` → `loaderData` (rota `…/c/…/page`) fundido no mesmo mapa de produtos.
6. Normalização: `normalizeItem` (preço, desconto %, `seo_url` → `product_url`, imagens, etc.).
7. **Saída “final” para uso:** `output/dados_produtos.json` (PT‑BR, inclui `categoria_url`, `link_produto`).
8. **Saída técnica:** `output/teste_categoria.json` (mapa `products` com mais campos internos).
9. **Debug / descoberta:** `modern_router_peek.json`, `caca_dados.jsonl`, `rede_ultima_execucao.log`, `debug_responses.log`, `debug_snapshots/`, `descoberta_redes.jsonl` (quando ativo).

A pasta `output/*` **não** deve ser commitada (ver `.gitignore`); mantém-se `output/.gitkeep`.

## Variáveis de ambiente (principais)

| Variável | Efeito |
|----------|--------|
| `CATEGORY_URL` | URL da categoria a abrir |
| `HEADED=1` | Browser visível (login) |
| `CHROME_USER_DATA` | Perfil alternativo |
| `FRESH_SESSION=1` | Não reutilizar perfil local padrão |
| `NET_LOG=0` / `1` / `verbose` | Log de rede resumido ou completo |
| `HUNT_LOG=0` | Desligar ficheiros “caça” com `--debug` |
| `DISCOVER=1` | `descoberta_redes.jsonl` |
| `JSON_SNAPSHOT=1` | `debug_snapshots/` |
| `ROUTER_PEEK_LEN` | Tamanho da amostra em `modern_router_peek.json` (0 = só resumo) |

## Scripts `npm` (ver `package.json`)

- `scrape:category` — execução básica
- `scrape:category:debug` / `headed` / `peek` / `caca` / `discover` / `snap` — atalhos com `cross-env` no Windows

## Limitações conhecidas

- Grelha pode misturar nós de **review** com cartões; podem existir **duplicados** por `product_id` e linhas com poucos campos até haver filtro dedicado.
- Dados pessoais / tokens podem aparecer em **amostras** de debug do router — não versionar `output/`.

## Tarefas e decisões

- **Roadmap (fonte única):** [`docs/ROADMAP.md`](ROADMAP.md) (metodologia: estados de tarefa, sem ficheiros de checklist paralelos).
- **ADRs:** [`docs/adr/README.md`](adr/README.md).

## Repositório remoto

Organização: **abel398group-oss** — [projeto_tiktok-Categorias_v02](https://github.com/abel398group-oss/projeto_tiktok-Categorias_v02).
