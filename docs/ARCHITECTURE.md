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
7. **Saída “final” para uso:** `output/dados_produtos.json` (PT‑BR, inclui `categoria_url`, `link_produto`) — único ficheiro de dados de produto na raiz de `output/`.
8. **Saída técnica e auxiliares:** `output/teste_categoria.json`, `modern_router_peek.json`, logs, `dados_lojas.json` em `output/extra/`, `caca_*`, etc. em `output/extra/`.
9. **Debug / descoberta:** `modern_router_peek.json`, `caca_dados.jsonl`, `rede_ultima_execucao.log`, `debug_responses.log`, `debug_snapshots/`, `descoberta_redes.jsonl` (quando ativo).

## Modelo de dados (conceitual)

### Produto (product)

- **Chave de negócio:** `product_id` (e dedupe/merge do mapa em memória por este id).
- **Campos típicos (export):** `categoria_url`, `link_produto`, `nome`, preço, moeda, preço original, vendas, `fotos` / `fotos_pdp`, bloco de avaliações de produto.
- **No código:** `normalizeItem` (nó grelha), `mergeProductById` + `productRowRichness` (colisão de linhas), `toDadosProdutoClean` (shape JSON final por item).

### Loja (seller)

- **Chave lógica:** `seller_id` (ligação entre produto e entidade vendedor; `global_seller_id` quando existir no feed).
- **Campos típicos:** `nome_loja`, métricas de loja (`loja_vendas_total`, `loja_produtos_ativos`, …), logos (`loja_logo_uri`, `loja_logo_urls`), etc.
- **Duplicação intencional:** o mesmo vendedor aparece em **cada** item em `dados_produtos.json` (desnormalização para leitura rápida e análise sem `join` obrigatório).
- **Fonte agregada:** `output/extra/dados_lojas.json` — uma entrada por `seller_id`, construída por `buildLojasMapBySeller` (merge de campos de loja entre produtos do mesmo vendedor). Tratar-se como **catálogo consolidado** de vendedor; o produto continua a carregar a cópia desnormalizada.
- **No código:** `normalizeSellerInfo`, `mergeLojaFromNormalized` / `extractLojaFromNormalized`, `lojaToRowFields`.

### Snapshot (estado no tempo) — ainda não implementado

- Conceito: gravar, por execução de coleta, **valores que mudam** (preço, vendas, contagem de reviews, posição, métricas de loja) sem sobrescrever o histórico.
- Ligar a uma ideia de **run** (uma corridada do scraper) e a tabelas de histórico; ver secção *Camada alvo (Postgres, futuro)* abaixo.

## Contrato entre ficheiros de saída

| Ficheiro | Conteúdo | Uso típico |
|----------|----------|------------|
| `output/dados_produtos.json` | Objeto com `itens[]`: **produto** + `seller_id` + **cópia** dos campos de loja (`nome_loja`, `loja_*`, …) | Leitura rápida, análise por produto, inspeção humana, export sem `join` |
| `output/extra/dados_lojas.json` | `lojas[]`: **uma** linha agregada por `seller_id` (campos de loja; sem atributos puramente de produto) | Fonte “oficial” de **dados de vendedor/loja**; rankings e joins por `seller_id` |

- **Ligação:** `seller_id` no item de produto corresponde ao mesmo `seller_id` na grelha de lojas.
- **Estrutura e campos** do JSON de produtos **não** foram alterados por este documento; apenas descritos.

## Camada alvo (Postgres, futuro) — sem implementação neste repositório

Estrutura de referência para evoluir o projeto; **dados ainda** saem em JSON com o pipeline actual.

- **`scrape_runs`:** metadado de cada coleta (timestamp, categoria, status, ficheiro de saída / hash opcional).
- **`products`:** atributos **estáveis** do artigo (ex.: `product_id`, título, links canónicos — conforme forem definidos no esquema).
- **`sellers`:** atributos **estáveis** do vendedor, chaveada por `seller_id` (e `global_seller_id` se necessário).
- **`product_snapshots`:** preço, vendas, contadores de review de **produto**, posição, etc. **no momento** do run; FK para `scrape_runs` e `products`.
- **`seller_snapshots`:** totais de loja (vendas, seguidores, artigos ativos, …) **no momento** do run; FK para `scrape_runs` e `sellers`.
- **Diferença fixa vs histórica:** tabelas “base” = dimensão; tabelas `*_snapshots` = factos no tempo, para gráficos e comparação entre coletas.
- **`seller_id`:** chave de integridade entre `products` / `itens` e `sellers` / linhas de loja no export actual.

**Pipeline de scraping:** o comportamento (normalização, merge, ficheiros gerados) permanece o definido em `src/scrapeCategory.mjs`; a camada SQL é **por cima** do JSON quando for implementada.

## Integridade (regressão)

- Alterações ao normalizador ou ao merge de produto/loja devem manter `npm test` a verde; ver `FLUXO.md` e `docs/ROADMAP.md`.

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

**Branches Git:** `main` (linha principal) e `backup` (cópia de segurança / referência). O desenvolvimento do utilizador pode estar em qualquer uma; confirmar com `git branch` antes de assumir a branch activa.
