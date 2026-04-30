# Analytics API v1

Servidor HTTP expõe os mesmos relatórios em **GET** que os comandos CLI em `npm run analytics:*`, **GET por produto** para a página «workspace», e **POST** opcional para exportar um produto para DigitalOcean Spaces. A lógica de relatórios partilha `scripts/analytics/lib/` com os scripts de linha de comando; o núcleo de export partilha `scripts/lib/export-product-to-spaces-core.mjs` com `npm run export:product-spaces`.

## Pré-requisitos

- `DATABASE_URL` no `.env` (Postgres já importado com `npm run db:import:output`).
- **`ANALYTICS_API_KEY` obrigatória como variável activa** (valor não pode estar apenas comentado no `.env`). Os comandos `analytics:*` em CLI só precisam de `DATABASE_URL`; **`npm run analytics:api`** aborta imediatamente sem chave definida — ver `.env.example`.
- **`POST /analytics/export-product-to-spaces`** exige no **servidor** as variáveis **SPACES_\*** configuradas (`SPACES_ENDPOINT`, `SPACES_REGION`, bucket, keys). Sem elas o endpoint responde **503** (`spaces_unconfigured`). Ver também `EXPORT_IMAGE_*` e `SPACES_OBJECTS_PUBLIC_READ` em `.env.example`.

## Arranque

```bash
npm run analytics:api
```

Ou directamente:

```bash
node --env-file=.env scripts/analytics/server.mjs
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
| GET | `/analytics/top-products` | Equiv. `npm run analytics:top-products` |
| GET | `/analytics/opportunities` | Equiv. `npm run analytics:opportunities` |
| GET | `/analytics/product-score` | Equiv. `npm run analytics:product-score` |
| GET | `/analytics/new-products` | Equiv. `npm run analytics:new-products` |
| GET | `/analytics/growth` | Equiv. `npm run analytics:growth` |
| GET | `/analytics/scalable-products` | Equiv. `npm run analytics:scalable` |
| GET | `/analytics/category-map` | Equiv. `npm run analytics:category-map` |
| GET | `/analytics/product-workspace/:productId` | Detalhe de um produto no **último** ScrapeRun (score alinhado a `product-score`, URLs de imagens do snapshot, etc.). `productId` = ID TikTok (URL-encoded se necessário). |
| POST | `/analytics/product-workspace/:productId/images-zip` | **`application/zip`** — fotos do snapshot. Corpo `{}` = todas; `{ "urls": ["…"] }` = subconjunto válido das `imageUrls` do workspace. Ver secção abaixo. |
| POST | `/analytics/export-product-to-spaces` | Grava **`produto.json`** + imagens no Space (último snapshot). JSON: `{ "productId": "<id TikTok>", "skipImages"?: boolean }`. |

### GET product-workspace

- **200** com corpo completo: campos de métricas/resumo do score; **`nome`** (nome na base) e **`nomeLista`** (truncado como na tabela); **`categorySlug`**, **`exportPrefix`** (pastas do export Space, com `SPACES_EXPORT_*` do servidor); preços extra (**`originalPrice`**, **`estimatedShowcasePrice`**, gaps), **`salesText`**, **`currency`**, **`sellerId`**, **`snapshotCapturedAt`**, **`firstSeenAt`** / **`lastSeenAt`**, **`votesByStar`** e **`dataQuality`** (JSON quando existir), **`deltaHint`** quando Δ não se aplica, **`imageUrls`**. Ver `scripts/analytics/lib/product-workspace.mjs`.
- **404** se o produto não existir ou não tiver snapshot no último run.
- **200** com `{ "error": "no_run", "message": "…" }` se não houver ScrapeRun (sem base importada).
- **400** se o segmento do path estiver vazio após trim.

### POST product-workspace … / images-zip

- Resposta **binary** `application/zip` (`Content-Disposition: attachment`). Cabeçalhos **`X-Zip-Downloaded`** e **`X-Zip-Failed`** (contagens).
- Corpo JSON: **`{}`** ou omitir `urls` → empacota todas as `imageUrls` do workspace (por ordem); **`{ "urls": [ "https://…", … ] }`** → só essas URLs, na ordem enviada (cada uma tem de existir exactamente nas `imageUrls` do produto).
- O servidor faz o download das imagens (evita CORS no browser). Se algumas falharem, o ZIP inclui as que correram bem e, quando há falhas, o ficheiro **`_falhas-download.txt`** dentro do ZIP.
- **400** `no_images` | **400** `invalid_urls` | **404** / **503** alinhados ao GET workspace | **502** `zip_failed`.
- Env opcional: **`WORKSPACE_IMAGE_ZIP_MAX_BYTES`**, **`WORKSPACE_IMAGE_ZIP_TIMEOUT_MS`** — ver `scripts/analytics/lib/product-images-zip.mjs`.

### POST export-product-to-spaces

- **`productId`**: obrigatório, string igual ao **`Product.productId`** (ID TikTok na base).
- **`skipImages`**: opcional; se `true`, só envia `produto.json` (sem downloads de imagens).

**Respostas típicas (200)** incluem `prefix`, `bucket`, `jsonKey`, contagens `imagesUploaded`, `imagesDiscovered`, `imagesFailed`, lista truncada `failures`; se **`SPACES_PUBLIC_BASE_URL`** estiver definido, também `publicUrls` com URLs CDN sugeridas.

| HTTP | Situação |
|------|-----------|
| 400 | `productId` em falta ou inválido no corpo. |
| 404 | Produto inexistente ou sem `ProductSnapshot`. |
| 401 | API key incorrecta. |
| 503 | Variável Spaces em falta no `.env` do processo (`… em falta no .env`). |
| 500 | Outro erro de export (ex.: falha rede/S3 não mapeada). |

Equivale conceitualmente a `npm run export:product-spaces -- --product-id <id>`; ver `scripts/export-product-to-spaces.mjs`.

## Formato de resposta (GET relatórios)

- **Sucesso com dados:** objecto JSON alinhado ao relatório (ex.: `items`, `scrapeRun`, `top` no score, etc.). Ver `scripts/analytics/lib/*.mjs` para campos exactos.
- **Escalar** (`scalable-products`): inclui **`validatedToScale`**, **`potentialBets`** e contagens opcionais como **`scoredProductsAnalyzed`** (linhas pontuadas no último run consideradas antes dos cortes dos dois grupos). Ver `scripts/analytics/scalable-products.mjs`.
- **Sem dados / vazio:** normalmente HTTP **200** com `items: []` ou `top: []` e `message` explicativa (igual às mensagens da CLI).
- Definições de métricas e limites (top 20, score top 30, etc.): **`docs/ANALYTICS.md`**.

## Exemplo (curl)

```bash
curl -s -H "Authorization: Bearer SUA_CHAVE" http://127.0.0.1:3333/analytics/top-products
```

```bash
curl -s -H "Authorization: Bearer SUA_CHAVE" \
  http://127.0.0.1:3333/analytics/product-workspace/1732593847560123456
```

Export (POST):

```bash
curl -s -X POST -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"productId":"1732593847560123456"}' \
  http://127.0.0.1:3333/analytics/export-product-to-spaces
```

## Segurança

- Não expor a API à Internet sem **TLS** (reverse proxy) e política de rede.
- Tratar `ANALYTICS_API_KEY` como segredo; rotação periódica recomendada.
- **Quem tem a mesma API key pode disparar uploads para o Space** configurado no servidor; não coloque chaves `SPACES_*` no frontend nem em `VITE_*`.
- A API **não** altera Postgres; **escreve** apenas objectos no **DigitalOcean Spaces** quando usa o POST de export.
