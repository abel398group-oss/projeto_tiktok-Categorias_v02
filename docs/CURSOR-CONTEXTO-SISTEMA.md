# Contexto técnico do sistema — Cursor / IA

Referência **única** para alinhar assistentes de código ao repositório **projeto_tiktok-Categorias_v02** e às comparações / ideias reutilizáveis a partir do **Hipervias v12** (`…/GitHub/hipervias_v12`).  
Documentos canónicos existentes: **`docs/ARCHITECTURE.md`**, **`docs/ROADMAP.md`**, **`FLUXO.md`**, **`README.md`**.

---

## 1. Propósito do produto

- **Coleta** de dados públicos de categorias do **TikTok Shop** (grelha/listagem).
- **Export** estável em JSON (`output/dados_produtos.json`, `output/dados_lojas.json`) com contrato documentado e **JSON Schema** (`schemas/`).
- **Persistência opcional** em **PostgreSQL** via **Prisma**: identidade (`Product`, `Seller`), histórico por run (`ProductSnapshot`, `SellerSnapshot`), auditoria (`RawPayload`), coordenação de import (`ScrapeRun`, `input_hash` para idempotência).

Este repositório **não** é um TMS nem uma aplicação SaaS completa com front-office; foco é **pipeline de dados** + base analítica.

---

## 2. Stack técnico (factos)

| Camada | Tecnologia |
|--------|-------------|
| Runtime | Node.js **≥ 20**, **ES modules** (`"type": "module"`), **npm** (pacote único) |
| Coleta | **Puppeteer** + stealth, intercepção de respostas HTTP, `#__MODERN_ROUTER_DATA__` |
| Output | JSON PT-BR (`itens[]`, modelo híbrido produto+loja desnormalizado + `lojas[]` agregado) |
| Validação de contrato | **AJV** + `npm run validate:schemas` |
| Testes críticos | **node:test** — `npm test` (regressão de preço, merge, vendas) |
| Base de dados | **PostgreSQL** (ex.: DigitalOcean), **ORM Prisma** 5 |
| Import | `scripts/import-output-to-db.mjs` → **`npm run db:import:output`** |
| CI | GitHub Actions (`npm test`); validação JSON **local** por omissão (sem `output/` no clone) |

**Pontos de entrada de código:**

- **Scraper:** `src/scrapeCategory.mjs` (principal); scripts `scripts/scrape-both.mjs`, `scripts/consolidate-category-outputs.mjs` para multi-categoria.
- **Persistência:** `prisma/schema.prisma`; migrações em `prisma/migrations/`; cliente gerado `@prisma/client`.

---

## 3. Fluxo de dados (end-to-end)

1. **Navegar** categoria TikTok Shop, acumular JSON de feed + router, **normalizar** (`normalizeItem`), **merge** por `product_id` (`mergeProductById`), **export** flat.
2. **Consolidar** (se multi-categoria) para ficheiros na raiz de `output/`.
3. **Importar** (opcional): ler bytes de `dados_produtos.json` + `dados_lojas.json` (ou marcador se ausente) → **SHA-256** → se `input_hash` já existe em `scrape_runs`, **sair sem duplicar**; senão **upsert** sellers/products, **create** snapshots + `RawPayload`.

**Regra de separação:** o importador **mapeia** campos; **não** recalcula preço, vendas ou merge — isso é responsabilidade exclusiva do scraper.

---

## 4. Modelagem de dados (conceitual)

### 4.1 JSON (superfície do scraper)

- **`dados_produtos.itens[]`**: produto + cópias de loja no mesmo objeto (desnormalização intencional).
- **`dados_lojas.lojas[]`**: uma entrada por **`seller_id`**.

Contratos de **preço** e **vendas** v1 estão fixados em **`docs/ARCHITECTURE.md`** — alterações à lógica exigem `npm test` e decisão (ROADMAP / ADR).

### 4.2 PostgreSQL / Prisma (analítico + histórico)

- **`ScrapeRun`**: metadados da coleta + **`input_hash`** (dedupe da reimportação do mesmo blob consolidado).
- **`Seller` / `Product`**: upsert por ids de plataforma; evolução de “último estado útil”.
- **`ProductSnapshot` / `SellerSnapshot`**: série temporal ligada ao run (`scrape_run_id`).
- **`RawPayload`**: envelope `consolidated_output` para auditoria.

---

## 5. Convenções operacionais

- **`DATABASE_URL`** no `.env` (ver `.env.example`) para import e Prisma Studio.
- **`output/`** tipicamente **não commitado** além de `.gitkeep`.
- Segurança: amostras de debug podem conter dados sensíveis — não versionar `output/` nem logs de sessão sem filtro.

---

## 6. Comparativo técnico: este repo × Hipervias v12

| Dimensão | **projeto_tiktok-Categorias_v02** | **hipervias_v12** |
|----------|-------------------------------------|-------------------|
| Natureza | Pipeline scraping + fichas JSON + camada BD analítica | **TMS** SaaS (transporte/gestão) |
| Repo | Pacote npm **único** | **pnpm monorepo**: `apps/api`, `apps/web`, `e2e` |
| Backend | **Sem** servidor HTTP próprio para o scraping | **NestJS** (TypeScript), módulos por domínio |
| Frontend | — | **React + Vite**, Tailwind, TanStack Query |
| Persistência scraper/import | Script Node + Prisma direto | Prisma dentro da **API Nest** como núcleo do produto |
| Auth / tenancy | — | JWT, permissões (**CASL**), multi-tenant |
| Migrações / DB | Sim, `prisma migrate` | Sim; processo documentado (Docker local, staging/produção) |
| Testes | Regressão em **scraping/merge** (node:test) | Jest (API), e2e (Playwright, etc.) |
| Documentação | ROADMAP, ARCHITECTURE, ADRs 0001–0002 | Muitos **ADRs**, ROADMAP, guias `.cursor/` |
| Contrato público principal | JSON de saída + Schema | REST API + DTOs Nest |

---

## 7. O que do Hipervias **pode** fazer sentido implantar aqui (sem mudar escopo TMS)

Aceite por **evolução orgânica** — não obrigatório para coleta v1.

1. **Árvore `/ apps` apenas se aparecer produto segundo**  
   Se no futuro houver uma **API REST** (consultas, dashboard) separada do scraper, um monorepo estilo `apps/scraper` + `apps/api` + `apps/web` (pnpm) reduz duplicação de dependências; **hoje** o custo de monorepo para um único pacote é desnecessário.

2. **Docker Compose para Postgres local**  
   Hipervias usa `docker compose` para DB; aqui podes replicar para **dev local** idêntico à cloud, sem tocar no scraper.

3. **CI com fixture de JSON**  
   Roadmap já menciona: versionar **pequenos** `dados_produtos.json` / `dados_lojas.json` de teste e correr `validate:schemas` no CI — padrão de “contrato verde” sem depender de `output/` real.

4. **ADRs numerados contínuos**  
   Já tens `docs/adr/0001`, `0002`; replicar a disciplina Hipervias para decisões de **import**, **índices Prisma** ou **API futura** mantém histórico auditável.

5. **Camada API Nest (só se precisares de serviço HTTP)**  
   Hipervias não é “modelo” para o scraper; seria **alternativa** a um Express/Fastify mínimo se precisares de endpoints — **não** é requisito para o pipeline actual.

6. **Front React**  
   Só relevante se construíres **dashboard** sobre snapshots; stack Hipervias (Vite + TanStack Query) é referência de mercado, não dependência deste repo.

7. **Convenções de nomenclatura**  
   Hipervias documenta nomenclatura de tabelas e UX; já usas **`snake_case`** no Postgres via `@map` — alinhar **nomes de env** e prefixes de migrações continua sendo boa prática.

8. **E2E**  
   Hipervias tem fluxo pesado browser+API; aqui faz mais sentido **e2e** só se houver login automatizado TikTok estável na CI (hoje conscientemente **não** priorizado).

---

## 8. Anti-patterns (evitar ao usar o Cursor neste repo)

- Misturar comandos/scripts do **Hipervias** (paths `apps/api`, `pnpm --filter`) com este projeto.
- Sugerir **`tenant_*`**, JWT, CASL ou módulos Nest **como premissa** das alterações de scraper/import.
- Alterar **`normalizeItem`**, **merge de preço/vendas**, ou **schema JSON de saída** sem tarefa explícita e **testes** verdes.

---

## 9. Ficheiros a priorizar quando a IA edita código

| Tarefa | Ler primeiro |
|--------|----------------|
| Scraper | `docs/ARCHITECTURE.md`, `.cursor/rules/scrape-mjs-patterns.mdc` |
| Preço/vendas | `docs/ARCHITECTURE.md` (contratos), `npm test` |
| Import / Prisma | `prisma/schema.prisma`, `scripts/import-output-to-db.mjs`, `README.md` (idempotência) |
| Tarefas de produto | `docs/ROADMAP.md` |

---

*Última actualização: alinhada ao estado do repositório com Postgres/Prisma e import idempotente por `input_hash`.*
