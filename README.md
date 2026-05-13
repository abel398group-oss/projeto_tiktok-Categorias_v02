# projeto_tiktok-Categorias_v02

Scraper de categorias do TikTok Shop (Node.js, Puppeteer) com saída em `output/dados_produtos.json` e `output/dados_lojas.json`.

- Fluxo e comandos: [`FLUXO.md`](FLUXO.md)
- Tarefas e visão: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Arquitetura e contrato JSON: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Analytics (queries locais sobre a base): [`docs/ANALYTICS.md`](docs/ANALYTICS.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## Requisitos

- Node.js >= 20
- npm

### Primeira vez local (painel + API)

**Pré-requisito:** Docker Desktop (Windows/Mac) ou Docker Engine a correr para o Postgres local do repo (`npm run db:docker:*`).

```bash
npm install
(cd frontend && npm install)
npm run setup:local
npm run db:docker:bootstrap   # Postgres em Docker na porta host 5433 + migrações Prisma (primeira vez)
npm run db:check               # deve mostrar «Ligação à base OK»
```

O `.env` na raiz deve definir **`DATABASE_URL`** para a base local (`tiktok_shop_dev` na porta 5433).

Opcionalmente importa dados: `npm run db:import:output` (com `output/dados_produtos.json` já gerados).

```bash
npm run dev:all
```

Painel em **`http://localhost:5173/`** e API em **`http://127.0.0.1:3333/`**.

## CI / Testes automáticos

O GitHub Actions executa, em cada push e pull request:

- `npm test` (regressão do parser / merge),
- `npm run validate:schemas:ci` (JSON mínimos em `test/fixtures/schema-ci/` vs `schemas/*.schema.json`).

## Validação de schema dos outputs

Valida `output/dados_produtos.json` e `output/dados_lojas.json` contra `schemas/dados_produtos.schema.json` e `schemas/dados_lojas.schema.json` (AJV).

```bash
npm run validate:schemas
```

## Importar coleta para o Postgres (Prisma)

Com `DATABASE_URL` válida no `.env`, importa a **última** coleta de `output/dados_produtos.json` para a base:

```bash
npm run db:import:output
```

- **Idempotência:** evita duplicados via `input_hash` (SHA-256).
- **Product** e **Seller**: *upsert* por ID estável.
- **ProductSnapshot** e **SellerSnapshot**: histórico por run.

### Prisma Studio (consultar dados no Postgres)

```bash
npm run prisma:studio
```

Abre em **`http://localhost:5555`**.
