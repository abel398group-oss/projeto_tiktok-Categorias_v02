# projeto_tiktok-Categorias_v02

Scraper de categorias do TikTok Shop (Node.js, Puppeteer) com saída em `output/dados_produtos.json` e `output/dados_lojas.json`.

- Fluxo e comandos: [`FLUXO.md`](FLUXO.md)
- **Deploy Droplet simples:** [`docs/DEPLOY-DROPLET-SIMPLES.md`](docs/DEPLOY-DROPLET-SIMPLES.md) (`deploy/*.example`)
- Tarefas e visão: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Arquitetura e contrato JSON: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Analytics (queries locais sobre a base): [`docs/ANALYTICS.md`](docs/ANALYTICS.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## Requisitos

- Node.js >= 20
- npm

## CI / Testes automáticos

O GitHub Actions executa npm test em push e pull request.  
Merge só deve ocorrer com testes a verde.  
Protege módulos críticos: preço, vendas, merge e loja.

A validação de **schema** dos JSON de saída (`npm run validate:schemas`) é **local** — não corre no CI, para não falhar quando `output/` não existe no clone (ex.: GitHub Actions). No futuro pode integrar-se com ficheiros de fixture.

## Validação de schema dos outputs

Valida `output/dados_produtos.json` e `output/dados_lojas.json` contra `schemas/dados_produtos.schema.json` e `schemas/dados_lojas.schema.json` (AJV). Protege o **contrato** de tipos e chaves definidos; campos extra no JSON **não** são rejeitados.

```bash
npm run validate:schemas
```

Correr **depois** de uma coleta que tenha gerado os dois ficheiros na raiz de `output/`, por exemplo após `npm run coleta` ou `npm run coleta:completa`.

## Importar coleta para o Postgres (Prisma)

Com `DATABASE_URL` válida no `.env` (ver `.env.example`), importa a **última** coleta de `output/dados_produtos.json` (e `dados_lojas.json` se existir) para a base:

```bash
npm run db:import:output
```

- **Idempotência:** o comando calcula um **SHA-256** do texto completo desses ficheiros (produtos + lojas, com marcador se `dados_lojas.json` não existir) e grava em `ScrapeRun.input_hash`. Se correres **duas vezes** com o **mesmo** conteúdo consolidado, a segunda vez **não** cria novo `ScrapeRun`, snapshots nem `RawPayload` — apenas mostra que a importação foi ignorada (código de saída 0).
- **Product** e **Seller**: *upsert* por `product_id` / `seller_id` (identidade estável).
- **ProductSnapshot** e **SellerSnapshot**: **sempre novas linhas** por importação (histórico por run); nada é sobrescrito no passado.
- **RawPayload**: um registo `consolidated_output` com envelope JSON (auditoria / dados frios).

Não altera o scraper nem recalcula preço ou vendas — apenas persiste o que está no JSON.

Para **validar** que os snapshots da base batem com o JSON actual (mesmo `input_hash` que no import):

```bash
npm run validate:db-vs-json
```

**Atalhos (coleta + banco de seguida):** com `DATABASE_URL` configurada, podes usar `npm run coleta:db` (duas categorias, grelha + consolidado + import), `npm run coleta:completa:db` (com PDP + import), `npm run coleta:completa:login:db`, `npm run coleta:uma:db` ou `npm run coleta:uma:completa:db` (uma categoria). Para correr **`coleta:completa:db`** e em seguida **`analytics:product-score`**, usa **`npm start`**. Detalhe em [`FLUXO.md`](FLUXO.md).

### Prisma Studio (consultar dados no Postgres)

Com `DATABASE_URL` no `.env` (copiar de `.env.example`):

```bash
npm run prisma:studio
```

Abre o **browser** numa página local (normalmente **`http://localhost:5555`**) onde podes navegar pelas tabelas (`Product`, `Seller`, `ScrapeRun`, snapshots, etc.). O terminal fica com o servidor ativo até fechares (**Ctrl+C**).

Outros atalhos úteis: `npm run prisma:generate` (gerar cliente após mudar `prisma/schema.prisma`), `npm run prisma:format` (formatar o schema).

## Analytics v1 (Postgres)

Usa apenas dados **já importados** (não faz coleta nem escrita na base). Convém ter corrido antes:

```bash
npm run db:import:output
```

Com `DATABASE_URL` definida:

| Comando | Descrição |
|---------|-----------|
| `npm run analytics:top-products` | Maior `sales_count` no último `ScrapeRun` (até 20) |
| `npm run analytics:new-products` | Produtos novos no último import (critérios em `docs/ANALYTICS.md`) |
| `npm run analytics:growth` | Crescimento de vendas último vs run anterior (até 20; ≥2 runs necessários) |
| `npm run analytics:opportunities` | Heurística simples de “oportunidade” no último run (até 20) |
| `npm run analytics:product-score` | Score 0–100 (heurística v1, não gravado) sobre o último run — ver `docs/ANALYTICS.md` |
| `npm run analytics:decision` | Interpretação rápida do score já calculado (CLI; ver `scripts/analytics/product-decision-cli.mjs`) |
| `npm run analytics:scalable` | Listas «validados» e «potenciais apostas» a partir do mesmo universo pontuado do último run — ver `docs/ANALYTICS.md` |
| `npm run analytics:category-map` | Mapa de categorias (último run) — ver `docs/ANALYTICS.md` |
| `npm run analytics:api` | Servidor HTTP read-only com os mesmos relatórios (chave `ANALYTICS_API_KEY`) — ver **[`docs/ANALYTICS-API.md`](docs/ANALYTICS-API.md)** |

Detalhes, limitações e contrato com `DATA_POLICY`: **[`docs/ANALYTICS.md`](docs/ANALYTICS.md)**.

## Desenvolvimento rápido

Um único comando para subir **API (Fastify)** + **frontend (Vite)** ao mesmo tempo, no **mesmo terminal**, com cores por processo (`concurrently`):

```bash
npm install
npm run dev:all
```

- **API** → por defeito **`http://127.0.0.1:3333`** (`npm run analytics:api` atrás de `api:dev`).
- **Frontend** → normalmente **`http://localhost:5173/`** (Vite tenta abrir o browser; se **5173** estiver ocupada, o Vite pode arrancar em **outra porta** — vê o URL no terminal, ex. `http://localhost:5174/`).

**Pré-requisitos**

- `.env` na **raiz** com **`DATABASE_URL`** e **`ANALYTICS_API_KEY`**.
- **`frontend/.env`** com **`VITE_ANALYTICS_API_KEY`** igual ao valor da API (mesmo Bearer).

Detalhes de endpoints e proxy: [`docs/ANALYTICS-API.md`](docs/ANALYTICS-API.md) · rotas e painel (categorias, analytics global/filtrado, carregamento automático das abas): [`FLUXO.md`](FLUXO.md) §9 e [`frontend/README.md`](frontend/README.md) · dois terminais (API + Vite): [`FLUXO.md`](FLUXO.md) §5.

Script individual útil para debug: **`npm run api:dev`** só API · **`npm run frontend:dev`** só frontend.

Para parar os dois processos: **Ctrl+C** no terminal onde correu `dev:all`.

## Desenvolvimento

```bash
npm install
npm test
```

Correr a coleta: ver [`FLUXO.md`](FLUXO.md).

## Aviso

Este projeto realiza coleta de dados públicos.  
Respeite os termos de uso das plataformas.  
Uso por conta e risco.

## Tag de release (v0.1.0)

Depois de rever e commitar as alterações pretendidas:

```bash
git tag v0.1.0
git push origin v0.1.0
```
