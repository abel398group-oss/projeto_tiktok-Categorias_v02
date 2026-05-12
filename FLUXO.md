# Fluxo do projeto

## Execução rápida

Na **raiz do repo** (onde está `package.json`). Postgres **local** usa Docker na porta host **5433** (scripts `db:docker:*`).

### 1) Primeira vez (PC)

```bash
npm install
(cd frontend && npm install)
npm run setup:local
npm run db:docker:bootstrap
npm run db:check
```

### 2) Painel + API no dia a dia

```bash
npm run dev:all
```

Sobe **Postgres local em Docker** (ficheiro `docker-compose.postgres-local.yml`: `up -d` + espera na porta **5433**) e, em seguida, **API Fastify** + **Vite** em paralelo.

```bash
npm run dev:app
```

Painel: **http://localhost:5173/** · API: **http://127.0.0.1:3333/** (proxy do Vite encaminha `/analytics` e `/scrape` para a API).

### 3) Coletar TikTok Shop e gravar no Postgres

```bash
npm run coleta:db
```

Duas categorias, grelha rápida. **Com PDP** (mais lento): `npm run coleta:completa:db`. **Uma categoria:** `npm run coleta:uma:db` ou `npm run scrape:category`. **Login visível:** `npm run coleta:completa:login:db`.

### 4) Só importar JSON que já existe em `output/`

```bash
npm run db:import:output
```

### 5) Ver dados na base (browser)

```bash
npm run prisma:studio
```

Típico **http://localhost:5555**.

### 6) Qualidade

```bash
npm test
npm run validate:schemas
npm run validate:db-vs-json
```

---

Do zero ao `output/dados_*.json`, import Postgres, analytics e painel no browser — detalhe nas tabelas abaixo.

## Guia rápido — comandos `npm run`

**Instalação (uma vez na raiz do repo):**

```bash
npm install
npm run setup:local   # cria .env e frontend/.env a partir dos .env.example (se ainda não existirem)
```

**Postgres:** o `.env` na raiz está configurado para o Postgres **LOCAL** (Docker na porta **`5433`**, user: `tiktok_dev`, db: `tiktok_shop_dev`). Fluxo típico local: **`npm run db:docker:bootstrap`**, **`npm run db:check`**. **Prisma Studio** (`npm run prisma:studio` na raiz) liga sempre à BD da `DATABASE_URL` activa (`http://localhost:5555`).

As chaves **`ANALYTICS_API_KEY`** (raiz) e **`VITE_ANALYTICS_API_KEY`** (`frontend/.env`) vêm alinhadas nos exemplos (`uma-chave-local`).

### Coleta (duas categorias) + JSON

| Situação | Comando |
|---------|---------|
| Só grelha, rápido; gera `output/dados_*.json` | `npm run coleta` |
| Igual + **import** para Postgres (`DATABASE_URL` no `.env`) | `npm run coleta:db` |
| Grelha + **galeria PDP** (`fotos_pdp`), mais lento | `npm run coleta:completa` |
| Completa + **import** para o banco | `npm run coleta:completa:db` |
| Como `coleta:completa:db` e no fim corre **`analytics:product-score`** no terminal | `npm start` |

### Coleta — uma categoria só

| Situação | Comando |
|---------|---------|
| Uma categoria, PDP + galeria (`OUTPUT_DIR` / `CATEGORY_URL` se precisares) | `npm run coleta:uma:completa` |
| Uma categoria, só grelha + **import** | `npm run coleta:uma:db` |
| Uma categoria, PDP + **import** | `npm run coleta:uma:completa:db` |
| Atalho: uma cat., só grelha | `npm run scrape:category` |
| Atalho: uma cat., com PDP | `npm run scrape:category:pdp` |

### Coleta — login / browser visível (TikTok a bloquear ou pedir sessão)

| Situação | Comando |
|---------|---------|
| Completa com browser visível para login | `npm run coleta:completa:login` |
| Idem + **import** Postgres | `npm run coleta:completa:login:db` |
| Só abrir browser com script de categoria (`src/scrapeCategory.mjs`) | `npm run scrape:category:headed` |
| **Login / QR no PC:** com `HEADED=1` o scraper usa **Chrome instalado** (não só o Chromium embebido). Sem Chrome: `PUPPETEER_USE_BUNDLED_CHROMIUM=1`. Ver `.env` (`PUPPETEER_CHANNEL`, `PUPPETEER_EXECUTABLE_PATH`). |

### Banco e Prisma

| Situação | Comando |
|---------|---------|
| Subir **Postgres só local** (Docker, porta host **5433**) | `npm run db:docker:up` |
| Esperar porta 5433 (diagnóstico) | `npm run db:docker:wait` |
| Postgres local **+ migrações** + generate (primeira vez) | `npm run db:docker:bootstrap` |
| Parar Postgres local Docker | `npm run db:docker:down` |
| Importar `output/dados_*.json` → Postgres (isolado) | `npm run db:import:output` |
| Testar ligação Postgres / `DATABASE_URL` (diagnóstico) | `npm run db:check` |
| Aplicar migrações pendentes (Postgres já acessível; **sem Docker** ou diagnóstico manual) | `npm run db:migrate:deploy` |
| Interface web para ver dados (`localhost:5555` típico) | `npm run prisma:studio` |
| Gerar cliente Prisma | `npm run prisma:generate` |

- **Import opcional:** variável **`IMPORT_RUN_TYPE`** (no `.env` ou na mesma linha do comando): por defeito o import **grava** **`quick_scrape`** em `ScrapeRun.run_type`; usar **`IMPORT_RUN_TYPE=pdp_enrich`** para marcar *enrich* (não altera `input_hash` nem idempotência).

**`npm run db:docker:bootstrap`** corrige automaticamente **`DATABASE_URL`** se ainda for o placeholder **`HOST:5432`**, depois faz *up* Docker + migrações + `generate`. **Erro EPERM** no Windows ao `generate`: fecha `dev:all`, apaga a pasta **`node_modules/.prisma`** e corre `npx prisma generate` outra vez (OneDrive ou antivírus bloqueiam o `.dll`).

### Analytics no terminal (CLI, precisa `DATABASE_URL` + `.env`)

| Relatório | Comando |
|-----------|---------|
| Top produtos | `npm run analytics:top-products` |
| Oportunidades | `npm run analytics:opportunities` |
| Product score | `npm run analytics:product-score` |
| Crescimento | `npm run analytics:growth` |
| Novos produtos | `npm run analytics:new-products` |
| Decisão / interpretação (score) | `npm run analytics:decision` |
| Escalar (validados + apostas) | `npm run analytics:scalable` |
| Mapa de categorias | `npm run analytics:category-map` |

### API HTTP + frontend (painel no browser)

| Situação | Comando |
|---------|---------|
| Só API Fastify (`127.0.0.1:3333` por defeito). Env: `DATABASE_URL`, **`ANALYTICS_API_KEY`** | `npm run analytics:api` |
| Só Vite (precisa `cd frontend` + `npm install` na primeira vez) | `cd frontend` → `npm run dev` |
| **Postgres Docker local** (up + espera **5433**) + **API + Vite** no mesmo terminal (`API` / `FRONT` nos logs). API com `node --watch`. | `npm run dev:all` |
| **Só API + Vite** (sem subir Docker) | `npm run dev:app` |

- Chave no browser: `frontend/.env` → **`VITE_ANALYTICS_API_KEY`** igual a **`ANALYTICS_API_KEY`** na raiz. Ver `frontend/README.md`, `.env` na raiz.
- Rota **`/produto/<id TikTok>`** para a página de trabalho do produto (link no nome do Product Score).
- Sem API a correr na porta certa, o proxy do Vite pode dar **ECONNREFUSED**.

### Qualidade / schemas

| Situação | Comando |
|---------|---------|
| Testes de regressão do scrape | `npm test` |
| Validar outputs contra schema (precisa `output/dados_*.json`) | `npm run validate:schemas` |
| Mesmo check de schema que o CI (fixtures, sem `output/`) | `npm run validate:schemas:ci` |
| Comparar DB vs JSON | `npm run validate:db-vs-json` |

---

## Onde estão os dados

- **JSON (análise rápida):** `output/dados_produtos.json` e `output/dados_lojas.json` na raiz de `output/`.
- **Apoio / debug:** `output/extra/`.
- **Modelo canónico Postgres:** `docs/ARCHITECTURE.md` (contrato, modelo híbrido, Prisma).
