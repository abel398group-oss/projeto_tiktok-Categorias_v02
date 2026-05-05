# Fluxo do projeto

## Execução rápida

Na **raiz do repo** (onde está `package.json`). Postgres **local** usa Docker na porta host **5433** (scripts `db:docker:*`). Se usas **Postgres remoto**, mete só `DATABASE_URL` no `.env` e ignora os passos Docker.

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

Painel: **http://localhost:5173/** · API: **http://127.0.0.1:3333/** (proxy do Vite encaminha `/analytics` para a API).

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

### 7) Produção (Docker no servidor)

Com `.env` na raiz do clone (ver `.env.example`):

```bash
docker compose up -d --build
```

Painel no host por defeito em **`http://<IP-do-servidor>:8080/`** (ver §10).

---

Do zero ao `output/dados_*.json`, import Postgres, analytics e painel no browser — detalhe nas tabelas abaixo.

## Guia rápido — comandos `npm run`

**Instalação (uma vez na raiz do repo):**

```bash
npm install
npm run setup:local   # cria .env e frontend/.env a partir dos .env.example (se ainda não existirem)
```

**Postgres:** o modelo actual do `.env.example` usa Postgres **Docker** local na porta **`5433`** (`tiktok_dev` / `tiktok_shop_dev`). Depois do `setup:local`, fluxo típico: **`npm run db:docker:bootstrap`**, **`npm run db:check`**. Para Postgres remoto (ex. DigitalOcean), comenta a `DATABASE_URL` local e põe a URI certa (**`sslmode=require`**, porta **25060**).

As chaves **`ANALYTICS_API_KEY`** (raiz) e **`VITE_ANALYTICS_API_KEY`** (`frontend/.env`) vêm alinhadas nos exemplos (`uma-chave-local`). Se `.env` ainda tinha **`...@HOST:5432`** (modelo antigo), atualiza só a línea **`DATABASE_URL=`** conforme `.env.example` actual.

### Coleta (duas categorias) + JSON

| Situação | Comando |
|---------|---------|
| Só grelha, rápido; gera `output/dados_*.json` | `npm run coleta` |
| Igual + **import** para Postgres (`DATABASE_URL` no `.env`) | `npm run coleta:db` |
| Grelha + **galeria PDP** (`fotos_pdp`), mais lento | `npm run coleta:completa` |
| Completa + **import** para o banco | `npm run coleta:completa:db` |
| Como `coleta:completa:db` e no fim corre **`analytics:product-score`** no terminal | `npm start` |

*(O `scrape-both` propaga env, p.ex. `PDP_GALLERY`. Não precisas de dois comandos em fila para grelha + PDP na mesma corrida completa.)*

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
| Migrações com **Docker no Droplet** | Automáticas: **a** cada arranque do contentor **`api`** corre `prisma migrate deploy` (`deploy/docker-api-entrypoint.sh`); não é preciso comando extra só por causa do Studio |
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
| **API + Vite** no mesmo terminal (`API` / `FRONT` nos logs). A parte **API** usa `node --watch` e reinicia ao alterar `server.mjs`. | `npm run dev:all` |

- Chave no browser: `frontend/.env` → **`VITE_ANALYTICS_API_KEY`** igual a **`ANALYTICS_API_KEY`** na raiz. Ver `frontend/README.md`, `.env.example` na raiz e `frontend/.env.example`.
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

---

## Detalhes (quando usar cada fluxo)

### 1. Primeira vez

Terminal na pasta do projeto, **Node ≥ 20**, `npm install`.

### 2. Coleta “normal” vs “completa”

- **`coleta`** / **`coleta:db`** — duas categorias, **sem** PDP galeria (mais rápido).
- **`coleta:completa`** / **`…:db`** — duas categorias **com** visita aos PDPs (URLs em `fotos_pdp` quando a extracção funcionar).

Comandos com sufixo **`:db`** acrescentam **`import-output-to-db`** depois dos JSON já existentes. Sem `:db`, não tocas no Postgres.

### 3. Mudar categoria / pasta de saída

Define **`CATEGORY_URL`** (e se precisares **`OUTPUT_DIR`**) **antes** do comando.

**Windows (cmd):**

```bat
set CATEGORY_URL=https://shop.tiktok.com/br/c/...
npm run coleta
```

**Git Bash / Mac / Linux:**

```bash
export CATEGORY_URL="https://shop.tiktok.com/br/c/..."
npm run coleta
```

**View more (mais produtos na grelha):** por defeito o `scrapeCategory` clica até **8** vezes (máx. **10**) em **View more** / **Ver mais** após o scroll. Desligar: `VIEW_MORE_MAX_CLICKS=0` ou `VIEW_MORE=0`; ajustar espera pós-clique: `VIEW_MORE_DRAIN_MS` (ms, default 4500). Ver `docs/ARCHITECTURE.md`.

### 4. API analytics (GET relatórios + POST export Spaces)

- Arranque: **`npm run analytics:api`**.
- Auth: **`Authorization: Bearer <ANALYTICS_API_KEY>`** (ou `x-api-key`). Endpoints em **`docs/ANALYTICS-API.md`**.
- **POST** opcional **`/analytics/export-product-to-spaces`**: exporta produto ao DigitalOcean Spaces (credenciais `SPACES_*` no servidor). No painel **Product Score**, botão por linha na coluna **Space**.

Relatórios equivalentes aos da tabela CLI; **Escalar** e **category-map** no painel espelham o mesmo universo que `analytics:scalable` e `analytics:category-map`.

### 5. Frontend (dois terminais em vez de `dev:all`)

**Terminal 1 (raiz):**

```bash
npm run analytics:api
```

**Terminal 2:**

```bash
cd frontend
npm install
npm run dev
```

Por defeito **http://localhost:5173/** (`strictPort`: se 5173 estiver ocupada o `npm run dev` falha — liberta a porta primeiro).

### 6. PDP / `fotos_pdp`

Já coberto por **`npm run coleta:completa`** (única execução; até ~25 PDPs por defeito). Não é obrigatório um segundo comando só para fotos.

### 7. Git

Branches usuais: **`main`** (principal) e **`backup`**. **`git branch`** mostra onde estás.

### 8. Portas customizadas

Se mudares **`ANALYTICS_API_PORT`** ou a porta do Vite (`vite.config.js`), documenta nos teus README locais ou actualiza esta nota aqui para a equipa.

### 9. Painel web — comportamento actual (rápido)

- **`/`** — Painel inicial: cartões por categoria (**GET `/analytics/categories`**). Contagem grande = **produtos únicos na base**; **Última importação** = produtos snapshots na última run da pasta; **Lojas nesta corrida** = lojas distintas só nesses mesmos snapshots (quantidade nesta volta, sem lista de nomes). O cartão inteiro é cliclável (`/categoria/...` com estado `categoryUrl`).
- **`/analytics`** — Analytics **global**. Os separadores (Top Products, Opportunities, …) **pedem dados à API ao abrir e ao mudar de separador**. O botão **Carregar dados** **actualiza** só o separador activo (útil depois de novo import ou para forçar refresh). **Top Products** e **Opportunities**: o painel pede um `limit` alto à API e mostra primeiro **20** linhas; use **Ver mais produtos** para ver o resto já carregado (mesma ordem; cabeçalhos reordenam só o que está em memória). Em **Opportunities**, **▾** no cabeçalho de cada coluna abre filtro e A–Z (estilo Excel).
- **`/categoria/:slug`** — Mesmos relatórios com **`?categoryUrl=...`**; carregamento automático igual ao global.
- **`/produto/:id`** — Página workspace (GET **`/analytics/product-workspace/:id`**). Se o produto não tiver snapshot no **último** `ScrapeRun` global mas tiver dados mais antigos na BD, a API pode devolver métricas a partir do **snapshot mais recente desse produto** (alinha ao export Spaces); o JSON pode incluir `snapshotFromLatestGlobalRun` e `globalLatestScrapeRun`.
- **`/a-mao`** — Produtos em análise: histórico local + métricas via API. Em **Exportar** (coluna Ações nas tabelas Analytics), após o POST ao Spaces o fluxo regista o produto no histórico e **navega para `/a-mao`**.
- **Enriquecer PDP** — Não corre sozinho ao abrir links; é acção explícita (**POST `/analytics/pdp-enrich`**) descrita em `scripts/analytics/pdp-enrich-route.mjs`.

### 10. Docker no Droplet (API + painel; painel em **:8080** por defeito)

- Documentação: **`docs/DOCKER.md`**. Na VM: clone (ex. `/var/www/tiktok-analytics`), **`.env`** na raiz com `DATABASE_URL`, **`ANALYTICS_API_KEY`** e **`VITE_ANALYTICS_API_KEY`** iguais; depois `docker compose up -d --build`.
- **Sempre `cd` ao clone** antes de `npm` / `npx prisma` / `npm run db:check`; fora da pasta do projeto aparecem `Missing script` ou `package.json` em falta.
- Se **`git pull` abortar** por alterações locais (`docker-compose.yml`, `package-lock.json`, …), o código fica desactualizado (ex. sem `db:check`). Ver **`docs/DOCKER.md`** — secção *Se `git pull` diz que alterações locais seriam sobrescritas*.
- **Prisma Studio** no servidor: no PC usa **`ssh -L 5555:127.0.0.1:5555 …`** e no servidor **`npm run prisma:studio`** sem fechar com Ctrl+C; no browser local **http://127.0.0.1:5555**.
- Painel: **`http://<IP-DO-DROPLET>:8080/`** (se a porta 80 do host estiver livre, podes definir `COMPOSE_WEB_PORT=80` no `.env`). Saúde: **`curl -s http://127.0.0.1:8080/health`** no servidor.
- **Migrações:** com Compose, ficam aplicadas quando o **`api`** sobe (**`docker compose up`** / rebuild). Só corres **`npm run db:migrate:deploy`** na VM se trabalhares **sem** contentor contra a mesma `DATABASE_URL` (host → Postgres).
- CI: **`.github/workflows/deploy-droplet-docker.yml`** — secrets `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` (e opcionalmente `DROPLET_DEPLOY_PATH`); no Droplet o `.env` mantém-se à mão (não vem do GitHub).
