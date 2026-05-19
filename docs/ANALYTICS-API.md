# Analytics API v1

Servidor HTTP expõe os mesmos relatórios em **GET** que os comandos CLI em `npm run analytics:*`, **GET por produto** para a página «workspace». A lógica de relatórios partilha `scripts/analytics/lib/` com os scripts de linha de comando.

## Pré-requisitos

- `DATABASE_URL` no `.env` (Postgres já importado com `npm run db:import:output`).
- **`ANALYTICS_API_KEY` obrigatória como variável activa** (valor não pode estar apenas comentado no `.env`). Os comandos `analytics:*` em CLI só precisam de `DATABASE_URL`; **`npm run analytics:api`** aborta imediatamente sem chave definida — ver `.env`.

## Arranque

```bash
npm run analytics:api
```

Ou directamente:

```bash
node --import ./scripts/load-root-env.mjs scripts/analytics/server.mjs
```

Por defeito escuta em **`127.0.0.1:3333`**. Sobrescrever:

- **`ANALYTICS_API_HOST`** — ex.: `0.0.0.0` (atenção aos riscos de rede).
- **`ANALYTICS_API_PORT`** — ex.: `8080`.

## Autenticação

Em todos os endpoints **exceto** `GET /health`, incluir a chave com **um** dos formatos:

- Cabeçalho `Authorization: Bearer <ANALYTICS_API_KEY>`
- Cabeçalho `x-api-key: <ANALYTICS_API_KEY>`

Pedidos sem chave válida obtêm **`401`** com corpo JSON `{"error":"unauthorized",...}`.

## Endpoints

| Método | Caminho | Notas |
|--------|---------|-------|
| GET | `/health` | Estado do serviço (sem chave, sem base). |
| GET | `/analytics/top-products` | Query opcional: `categoryUrl`, `limit` (1–10000, defeito 20). Equiv. CLI sem query. |
| GET | `/analytics/opportunities` | `categoryUrl`, `limit` (1–10000, defeito 20), **`mode`** opcional: `classic` \| `low_sales` \| `no_sales` \| `below_median` (defeito `classic`). Meta no JSON: `ruleNote`, `opportunityMode`. |
| GET | `/analytics/product-score` | Equiv. `npm run analytics:product-score` |
| GET | `/analytics/new-products` | Equiv. `npm run analytics:new-products` |
| GET | `/analytics/growth` | Equiv. `npm run analytics:growth` |
| GET | `/analytics/scalable-products` | Equiv. `npm run analytics:scalable` |
| GET | `/analytics/category-map` | Equiv. `npm run analytics:category-map` |
| GET | `/analytics/categories` | Grelha do painel `/`: categorias derivadas da BD (`scripts/analytics/lib/categories-catalog.mjs`). Inclui métricas operacionais por cartão: `operationalHealth`, `storedUrlVariantCount`, metadados do último `ScrapeRun` (`lastRunStatus`, `lastRunJsonTotal`, `lastRunInputHashPreview`, …), heurística `lastRunNewProductsApprox` / `lastRunUpdatedProductsApprox`, `jsonRunCoveragePercent` quando o run é multi-categoria. |
| GET | `/analytics/product-workspace/:productId` | Detalhe do produto: **preferência** por snapshot no **último** `ScrapeRun` global (alinhado a `product-score`); se não existir aí, **fallback** ao snapshot mais recente desse produto na BD. Ver secção GET abaixo. |
| POST | `/analytics/product-workspace/:productId/images-zip` | **`application/zip`** — fotos do snapshot. Corpo `{}` = todas; `{ "urls": ["…"] }` = subconjunto válido das `imageUrls` do workspace. Ver secção abaixo. |
| POST | `/analytics/export-local` | Exporta um produto para uma pasta local (imagens + `metadata.json`) e gera prompts (antigo + structured). |
| POST | `/analytics/pdp-enrich` | Arranca em background **`npm run pdp:enrich`** com lista de **`productIds`** (`scripts/analytics/pdp-enrich-route.mjs`). Requer máquina com browser. |
| POST | `/scrape/run` | Corpo JSON `{ "categoryUrl": "https://shop.tiktok.com/…" }` — corre **`node src/scrapeCategory.mjs`** com `CATEGORY_URL` e **`OUTPUT_DIR`** em `output/categorias/…` quando a URL corresponde às duas categorias do repo (como `scrape-both`); em seguida **`consolidate-category-outputs.mjs`** para actualizar `output/dados_*.json` antes do import. **409** se busy. Em sucesso inclui **`outputDir`** (relativo ao repo, separador `/`) e **`consolidated`** (`true` quando correu consolidate após subpasta `categorias/`). Ver `scripts/analytics/scrape-run-route.mjs`. |
| POST | `/scrape/run-both` | Corpo `{}` — **`node scripts/scrape-both.mjs`** (duas categorias, pastas em `output/categorias/…`) e em seguida **`node scripts/consolidate-category-outputs.mjs`**. Partilha o mesmo mutex **busy** que `/scrape/run`. Em sucesso inclui **`outputDir`** (`output`) e **`consolidated`: true**. |
| POST | `/analytics/import-output` | Corpo `{}` — corre **`npm run db:import:output`** (JSON em `output/` → Postgres) à espera do fim. Resposta **`200`** com **`skipped: true`** quando o importador detecta o mesmo **`input_hash`** que um `ScrapeRun` já existente (nada é escrito na BD). Opcionalmente **`detail`**: se `skipped`, `existingScrapeRunId` e `inputHash` (parse do log); se importou, `scrapeRunId` do bloco «Resumo importação». O painel **Scrapear** em `/` mostra estas linhas. Ver `scripts/analytics/import-output-route.mjs`. |
| POST | `/scrape/import-remote` | Importação **in-process** com o mesmo núcleo que o CLI (`scripts/lib/import-output-core.mjs`). Destinado ao **worker local** (`npm run scraper:worker`): envia o conteúdo textual de `dados_produtos.json` / `dados_lojas.json`. Auth: mesma **`ANALYTICS_API_KEY`** (`Authorization: Bearer` ou **`x-api-key`**). Limite de corpo configurável: **`IMPORT_REMOTE_BODY_LIMIT_BYTES`** (defeito 100 MiB, máx. 512 MiB). |

### POST `/scrape/import-remote`

- **Corpo JSON** (`application/json`):
  - **`dados_produtos_text`** (string, recomendado): conteúdo **byte-a-byte** do ficheiro `dados_produtos.json` (UTF-8), para o **`input_hash`** coincidir com `npm run db:import:output`.
  - **`dados_lojas_text`** (string, opcional): conteúdo de `dados_lojas.json`; se omitido, usa-se o mesmo sentinel que o CLI quando o ficheiro não existe.
  - Alternativa: **`dados_produtos`** / **`dados_lojas`** como **object** — o servidor faz `JSON.stringify`; o hash pode **diferir** do CLI nos mesmos dados (ordem de chaves).
  - **`import_run_type`**: `quick_scrape` | `pdp_enrich` | `unknown` (opcional).
  - **`raw_payload_extra`**: object opcional — fundido em **`worker_extra`** dentro do envelope `RawPayload` (metadados / diagnósticos leves).
- **200** `ok: true`, **`skipped: true|false`**, **`message`**, **`detail`** (`scrapeRunId`, `inputHash`, contagens quando importou; `existingScrapeRunId` quando saltou).
- **400** JSON inválido, campos em falta, ou erro de importação (ex.: `coletado_em` inválido).

### POST `/analytics/export-local`

- **Corpo JSON** (`application/json`): `{ "productId": "1732593847560123456" }` (apenas dígitos).
- **Efeito:** exporta para a pasta **Documentos/Scraper-TikTok-Produtos/** (no PC do operador) e escreve `imagens/` + `metadata/metadata.json` (path oficial; compatibilidade temporária com `metadata.json` legado pode existir em exportações antigas).
- **Prompts (best-effort):**
  - **Legacy:** `legacy-prompts/` (`commercial-prompt.txt`, `negative-prompt.txt`, `storyboard.json`).
  - **Structured:** `structured-prompts/` (`structured-commercial-prompt.txt`, `structured-negative-prompt.txt`, `structured-storyboard.txt`, `structured-prompt-debug.json`).
  - **Runway/Protective:** quando disponíveis, variantes por modo em `runway-prompts/` e `protective-prompts/`.
- **Pode rodar enrich/import:** se não houver imagens suficientes, pode executar `pdp:enrich` e depois `db:import:output` antes de exportar.
- **Resposta (200):** `{ ok: true, productId, dir, imagesSaved, imagesFailed, link, promptGeneration }`.
- **Erros típicos:** `400 bad_request`, `404 not_found/no_snapshot`, `409 no_images`, `502 pdp_enrich_failed/import_failed`, `503 no_run`.

#### Checklist técnico (export-local)

- `metadata/metadata.json` é o path oficial do metadata no `productDir` (fallback legado `metadata.json` pode existir em exportações antigas).
- Prompts structured são gravados em subpastas (`structured-prompts/`, `runway-prompts/`, `protective-prompts/`).
- Prompts legacy continuam a existir em paralelo (compatibilidade backward) e são gravados em `legacy-prompts/`.
- Falhas no export structured/artefatos adicionais não devem quebrar o fluxo principal do export (best-effort com warning).
- `npm test` deve permanecer verde.

#### Nota: `scripts/prompts/`

`scripts/prompts/` contém textos de referência/templates manuais para takes. Os prompts exportados por produto ficam no `productDir/*-prompts/` e são os artefatos runtime gerados por exportação.

### GET `/analytics/categories`

- **`operationalHealth`:** `ok` \| `partial_run` (estado do JSON do run ≠ `ok`) \| `stale_collection` (última coleta há mais de 72 h) \| `mixed_urls` (mais de uma `category_url` bruta no mesmo bucket).
- **`lastRunNewProductsApprox` / `lastRunUpdatedProductsApprox`:** aproximação alinhada ao importador (`first_seen_at` próximo de `collected_at` do run ≈ produto novo nesta coleta).
- **`jsonRunCoveragePercent`:** só quando `ScrapeRun.category_url` indica import multi (`multiple` / `multi`): percentagem aproximada do total JSON (`total_products`) representada pelos snapshots **deste** cartão.

### GET product-workspace

- **200** com corpo completo: métricas alinhadas ao score; **`scrapeRun`** corresponde à **coleta do snapshot efectivamente usado**; **`globalLatestScrapeRun`** é o último run global na BD (útil quando o fallback não é o mesmíssimo run); **`snapshotFromLatestGlobalRun`** (boolean): `false` quando os dados vêm de um snapshot **mais recente do produto** mas **fora** do último import global (Δ vendas entre runs não comparado nesse modo); **`nome`**, **`nomeLista`**, **`categorySlug`**, preços extra, **`imageUrls`**, **`deltaHint`**, etc. Ver `scripts/analytics/lib/product-workspace.mjs`.
- **404** `not_found` — produto inexistente.
- **404** `no_snapshot` — produto sem **nenhum** `ProductSnapshot` na base.
- **200** com `{ "error": "no_run", "message": "…" }` se não houver `ScrapeRun`.
- **400** se the segmento do path estiver vazio após trim.

### POST product-workspace … / images-zip

- Resposta **binary** `application/zip` (`Content-Disposition: attachment`). Cabeçalhos **`X-Zip-Downloaded`** e **`X-Zip-Failed`** (contagens).
- Corpo JSON: **`{}`** ou omitir `urls` → empacota todas as `imageUrls` do workspace (por ordem); **`{ "urls": [ "https://…", … ] }`** → só essas URLs, na ordem enviada (cada uma tem de existir exactamente nas `imageUrls` do produto).
- O servidor faz o download das imagens (evita CORS no browser). Se algumas falharem, o ZIP inclui as que correram bem e, quando há falhas, o ficheiro **`_falhas-download.txt`** dentro do ZIP.
- **400** `no_images` | **400** `invalid_urls` | **404** / **503** alinhados ao GET workspace | **502** `zip_failed`.
- Env opcional: **`WORKSPACE_IMAGE_ZIP_MAX_BYTES`**, **`WORKSPACE_IMAGE_ZIP_TIMEOUT_MS`** — ver `scripts/analytics/lib/product-images-zip.mjs`.

## Formato de resposta (GET relatórios)

- **Sucesso com dados:** objecto JSON alinhado ao relatório (ex.: `items`, `scrapeRun`, `top` no score, etc.). Ver `scripts/analytics/lib/*.mjs` para campos exactos.
- **Escalar** (`scalable-products`): inclui **`validatedToScale`**, **`potentialBets`** e contagens opcionais como **`scoredProductsAnalyzed`** (linhas pontuadas no último run consideradas antes dos cortes dos dois grupos). Ver `scripts/analytics/scalable-products.mjs`.
- **Sem dados / vazio:** normalmente HTTP **200** com `items: []` ou `top: []` e `message` explicativa (igual às mensagens da CLI).
- Definições de métricas e limites (Top / Opportunities com `limit`, score top 30, etc.): **`docs/ANALYTICS.md`** e **`docs/ANALYTICS-RELATORIOS-REGRAS.md`**.

## Exemplo (curl)

```bash
curl -s -H "Authorization: Bearer SUA_CHAVE" http://127.0.0.1:3333/analytics/top-products
```

```bash
curl -s -H "Authorization: Bearer SUA_CHAVE" \
  http://127.0.0.1:3333/analytics/product-workspace/1732593847560123456
```

## Segurança

- Não expor a API à Internet sem **TLS** (reverse proxy) e política de rede.
- Tratar `ANALYTICS_API_KEY` como segredo; rotação periódica recomendada.
- A API **não** altera Postgres.
