# Arquitetura — projeto TikTok Shop (categorias)

## Objetivo

Scraper de **categoria** (grelha) no **TikTok Shop** com **Puppeteer**: interceptar `application/json` e o JSON embebido `__MODERN_ROUTER_DATA__` no HTML, **sem abrir PDP** (reduz risco de puzzle/anti‑bot na página de produto).

## Estado actual do scraper (abril 2026)

- Pipeline **estável:** coleta por categoria, normalização, merge por `product_id`, testes de regressão (`npm test`) a verde.
- **Opcional:** `PDP_GALLERY=1` abre páginas de produto para `fotos_pdp` (mais lento); ver `FLUXO.md`.
- **Saídas:** `output/dados_produtos.json` + `output/dados_lojas.json` (+ ficheiros técnicos em `output/extra/`). O **contrato** destes JSONs está na secção **Contrato dos outputs** abaixo.

## Decisão arquitetural: modelo híbrido nos JSONs (mantido)

- **`dados_produtos.json`** continua a ser um export **flat / prático**: cada item tem `product_id`, nome, preço, vendas, imagens, **`seller_id`**, **`nome_loja`** e vários campos de loja (`loja_*`, logos). Essa **desnormalização é intencional** — leitura rápida, auditoria e análise sem `join` obrigatório.
- **`output/dados_lojas.json`** é o agregado **oficial por vendedor**: **uma** entrada por **`seller_id`** (dedupe e merge de campos entre produtos da mesma loja). Serve análise de sellers e futura importação para base de dados.
- **Ligação:** `seller_id` é a **chave** comum entre um item em `itens[]` e uma linha em `lojas[]`.
- **Não** remover, por agora, campos de loja de `dados_produtos.json` — evita quebrar consumidores e mantém o uso “abrir o ficheiro e ver tudo no item”.
- **Normalização completa** (produto vs loja vs histórico no tempo) será feita no **Postgres** (tabelas separadas e snapshots), **não** obrigando o JSON actual a espelhar o esquema final da BD.

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
7. **Saídas “finais” na raiz de `output/`:** `dados_produtos.json` (PT‑BR, `itens[]`, `categoria_url`, `link_produto`, …) e `dados_lojas.json` (agregado por `seller_id`).
8. **Saída técnica e auxiliares:** `output/teste_categoria.json`, `modern_router_peek.json`, logs, `caca_*`, etc. em `output/extra/` (o agregado de lojas está na **raiz** de `output/` junto a `dados_produtos.json`).
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
- **Fonte agregada:** `output/dados_lojas.json` — uma entrada por `seller_id`, construída por `buildLojasMapBySeller` (merge de campos de loja entre produtos do mesmo vendedor). Tratar-se como **catálogo consolidado** de vendedor; o produto continua a carregar a cópia desnormalizada.
- **No código:** `normalizeSellerInfo`, `mergeLojaFromNormalized` / `extractLojaFromNormalized`, `lojaToRowFields`.

### Snapshot (estado no tempo) — ainda não implementado

- Conceito: gravar, por execução de coleta, **valores que mudam** (preço, vendas, contagem de reviews, posição, métricas de loja) sem sobrescrever o histórico.
- Ligar a uma ideia de **run** (uma corridada do scraper) e a tabelas de histórico; ver secção *Camada alvo (Postgres, futuro)* abaixo.

## Contrato dos outputs

### `output/dados_produtos.json`

- **Papel:** ficheiro de **leitura rápida, auditoria e análise** por produto (export “flat”).
- **Conteúdo:** `itens[]` com dados do **produto** (`product_id`, nome, preço, moeda, vendas, `fotos` / `fotos_pdp`, avaliações, …) **e** chave e cópia de **loja** (`seller_id`, `global_seller_id`, `nome_loja`, `loja_*`, `loja_logo_*`).
- **Não** é a representação final do modelo relacional: é **conveniência** e desnormalização intencional; o esquema canónico alvo de longo prazo é o **banco** (ver abaixo).

### `output/dados_lojas.json`

- **Papel:** ficheiro **agregado** de lojas / vendedores.
- **Conteúdo:** `lojas[]` com **uma** linha **por** `seller_id` (sem duplicar o mesmo vendedor em várias linhas).
- **Uso:** análise de vendedor, rankings de loja, e **import** onde se precisa de **um** registo por vendedor.
- Construção: merge no mapa de coleta (`buildLojasMapBySeller` no código; sem alterar este documento).

### Regra de ligação

- **`seller_id`** é a chave de ligação: cada produto com determinado `seller_id` corresponde à mesma chave no array `lojas` (e na dimensão `sellers` no futuro Postgres).

| Ficheiro | O quê | Quando preferir |
|----------|--------|-----------------|
| `dados_produtos.json` | Produto + loja desnormalizada no item | Exploração, scripts simples, inspeção linha a linha |
| `dados_lojas.json` | Loja **deduplicada** por `seller_id` | Métricas por vendedor, import `sellers`, consistência de loja |

## Futuro modelo Postgres — apenas documentado (não implementado)

Objetivo: **normalizar** entidades e **histórico** na base de dados; o JSON actual permanece a interface de saída do scraper até existir importador. **Nenhum** requisito de alterar o JSON agora.

### Tabelas de dimensão (dados “fixos” ou semi-fixos)

- **`products`**
  - Dados **estáveis** do artigo: pelo menos `product_id`, referência a vendedor (`seller_id` FK), título, URLs canónicas / identificadores que não mudam a cada scrape (definição fina no DDL).
- **`sellers`**
  - Dados **estáveis** da loja: `seller_id` (PK lógica), `nome_loja`, identidade de logo / URIs (conforme esquema), `global_seller_id` se aplicável.

### Tabelas de facto / histórico (estado no tempo, por execução)

- **`scrape_runs`**
  - Uma linha **por execução** do scraper (horário, categoria, parâmetros, notas, paths dos JSONs ou hash, status).
- **`product_snapshots`**
  - **Por run** e **por produto:** preço, vendas, avaliações, campos de imagem relevantes, ou qualquer métrica que deva ser **rastreada no tempo** (colunas a definir no DDL). FK: `scrape_runs`, `products`.
- **`seller_snapshots`**
  - **Por run** e **por loja:** vendas totais, seguidores, produtos ativos, totais de reviews, estado resumido da loja, etc. FK: `scrape_runs`, `sellers`.

### Diferença entre dado “fixo” e histórico

- Tabelas **dimensão** (`products`, `sellers`): identidade e atributos que raramente exigem histórico linha a linha no mesmo registo.
- Tabelas **snapshot**: permitem comparação entre coletas (evolução de preço, vendas, métricas de loja) sem sobrescrever o passado.

### `seller_id` na BD

- Chave de integridade entre `products` e `sellers`, alinhada ao `seller_id` nos JSONs actuais.

**Pipeline de scraping:** permanece o definido em `src/scrapeCategory.mjs`; a importação JSON → Postgres será uma **camada à parte** quando existir.

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
