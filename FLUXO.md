# Fluxo do projeto

## Comandos

1. `npm install` (deps, raiz uma vez)
2. `npm run coleta:completa:db` (coleta completa → Postgres)
3. `npm run prisma:studio` (ver BD no browser)
4. `npm run dev:all` (API + painel mesmo terminal)
5. `npm run db:import:output` (só importar JSON já gerado)
6. `npm run coleta:db` (grelha rápida → Postgres)
7. `npm run coleta:completa` (JSON com PDP, sem import)
8. `npm run coleta:completa:login:db` (completa com browser/login)
9. `npm run analytics:product-score` (relatório score no terminal)
10. `npm run analytics:api` (só servidor API)
11. `cd frontend && npm run dev` (só Vite — API noutro terminal)
12. `npm test` (testes scrape)
13. `npm run validate:schemas` (validar JSON vs schema)
14. `npm run validate:db-vs-json` (comparar BD vs JSON)
15. `npm start` (completa + score no fim)

---

Do zero ao `output/dados_*.json`, import Postgres, analytics e painel no browser.

## Guia rápido — comandos `npm run`

**Instalação (uma vez na raiz do repo):**

```bash
npm install
```

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
| Importar `output/dados_*.json` → Postgres (isolado) | `npm run db:import:output` |
| Interface web para ver dados (`localhost:5555` típico) | `npm run prisma:studio` |
| Gerar cliente Prisma | `npm run prisma:generate` |

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
| Validar outputs contra schema | `npm run validate:schemas` |
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

Por defeito **http://localhost:5173/** (outra porta se 5173 estiver ocupada — vê o URL no terminal).

### 6. PDP / `fotos_pdp`

Já coberto por **`npm run coleta:completa`** (única execução; até ~25 PDPs por defeito). Não é obrigatório um segundo comando só para fotos.

### 7. Git

Branches usuais: **`main`** (principal) e **`backup`**. **`git branch`** mostra onde estás.

### 8. Portas customizadas

Se mudares **`ANALYTICS_API_PORT`** ou a porta do Vite (`vite.config.js`), documenta nos teus README locais ou actualiza esta nota aqui para a equipa.

### 9. Painel web — comportamento actual (rápido)

- **`/`** — Painel inicial: cartões por categoria (**GET `/analytics/categories`**). O cartão inteiro é cliclável (`/categoria/...` com estado `categoryUrl`).
- **`/analytics`** — Analytics **global**. Os separadores (Top Products, Opportunities, …) **pedem dados à API ao abrir e ao mudar de separador**. O botão **Carregar dados** **actualiza** só o separador activo (útil depois de novo import ou para forçar refresh).
- **`/categoria/:slug`** — Mesmos relatórios com **`?categoryUrl=...`**; carregamento automático igual ao global.
- **`/produto/:id`** — Página workspace (GET **`/analytics/product-workspace/:id`**). Se o produto não tiver snapshot no **último** `ScrapeRun` global mas tiver dados mais antigos na BD, a API pode devolver métricas a partir do **snapshot mais recente desse produto** (alinha ao export Spaces); o JSON pode incluir `snapshotFromLatestGlobalRun` e `globalLatestScrapeRun`.
- **`/a-mao`** — Produtos em análise: histórico local + métricas via API. Em **Exportar** (coluna Ações nas tabelas Analytics), após o POST ao Spaces o fluxo regista o produto no histórico e **navega para `/a-mao`**.
- **Enriquecer PDP** — Não corre sozinho ao abrir links; é acção explícita (**POST `/analytics/pdp-enrich`**) descrita em `scripts/analytics/pdp-enrich-route.mjs`.
