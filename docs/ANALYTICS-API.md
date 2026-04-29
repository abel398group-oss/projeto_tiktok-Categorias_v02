# Analytics API v1 (read-only)

Servidor HTTP **read-only** expõe os mesmos dados que os comandos CLI em `npm run analytics:*`. A lógica partilha ficheiros em `scripts/analytics/lib/` com os scripts de linha de comando.

## Pré-requisitos

- `DATABASE_URL` no `.env` (Postgres já importado com `npm run db:import:output`).
- **`ANALYTICS_API_KEY` obrigatória como variável activa** (valor não pode estar apenas comentado no `.env`). Os comandos `analytics:*` em CLI só precisam de `DATABASE_URL`; **`npm run analytics:api`** aborta imediatamente sem chave definida — ver `.env.example`.

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

| Método | Caminho | Equivalente CLI |
|--------|---------|----------------|
| GET | `/health` | Estado do serviço (sem chave, sem base). |
| GET | `/analytics/top-products` | `npm run analytics:top-products` |
| GET | `/analytics/opportunities` | `npm run analytics:opportunities` |
| GET | `/analytics/product-score` | `npm run analytics:product-score` |
| GET | `/analytics/new-products` | `npm run analytics:new-products` |
| GET | `/analytics/growth` | `npm run analytics:growth` |
| GET | `/analytics/scalable-products` | `npm run analytics:scalable` |

## Formato de resposta

- **Sucesso com dados:** objecto JSON alinhado ao relatório (ex.: `items`, `scrapeRun`, `top` no score, etc.). Ver `scripts/analytics/lib/*.mjs` para campos exactos.
- **Sem dados / vazio:** normalmente HTTP **200** com `items: []` ou `top: []` e `message` explicativa (igual às mensagens da CLI).
- Definições de métricas e limites (top 20, score top 30, etc.): **`docs/ANALYTICS.md`**.

## Exemplo (curl)

```bash
curl -s -H "Authorization: Bearer SUA_CHAVE" http://127.0.0.1:3333/analytics/top-products
```

## Segurança

- Não expor a API à Internet sem **TLS** (reverse proxy) e política de rede.
- Tratar `ANALYTICS_API_KEY` como segredo; rotação periódica recomendada.
- A API **não** escreve na base; ainda assim expõe dados comerciais agregados.

