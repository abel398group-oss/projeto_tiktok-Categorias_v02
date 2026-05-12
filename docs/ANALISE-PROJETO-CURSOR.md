# Análise do projeto (Cursor / handoff)

Documento para contexto: **como o projeto funciona**, **nível de profissionalismo**, **segurança**, **lacunas** e **melhorias** sugeridas.  
Projeto: scraper de **TikTok Shop** (categoria) em Node + Puppeteer — repositório `projeto_tiktok-Categorias_v02`.

**Branches:** `main` (principal) e `backup` (segurança / referência). Desenvolvimento pode decorrer em qualquer uma; usar `git branch` / `git status` para saber a branch activa.

---

## 1. Como está a funcionar (técnico)

- **Entrada:** uma URL de categoria (`CATEGORY_URL` ou default em `scrapeCategory.mjs`).
- **Runtime:** `puppeteer-extra` + plugin **Stealth**; `setRequestInterception` + `page.on("response")` lê respostas `application/json` de feeds OEC/Shop; também lê `#__MODERN_ROUTER_DATA__` no HTML após o load.
- **Processamento:** `mergeProductById` (Map por `product_id`) + `normalizeItem` (preço, loja, imagens, `rate_info`, etc.); nós com `review_id` são excluídos de serem “produto de grelha”.
- **Saída humana:** `output/dados_produtos.json` (PT-BR). Técnica / debug: `output/extra/`.
- **Opcional `PDP_GALLERY`:** após a grelha, N navegações a `.../pdp/...` para enriquecer `fotos_pdp` (DOM + router no PDP). Tudo no **mesmo** processo Node — não é preciso correr dois comandos em cadeia.

**Scripts npm (atalhos):** `coleta` / `coleta:completa` (ver `package.json` e `FLUXO.md`).

**Testes:** `test/scrape-regression.test.mjs` — `npm test` (parser, merge, loja, avaliações).

**Persistência e analytics:** Import `npm run db:import:output` → Prisma (`Product`, `ProductSnapshot`, `ScrapeRun`, …). Queries read-only em `scripts/analytics/lib/` consumidas por CLI e por **Fastify** (`scripts/analytics/server.mjs`) com **`ANALYTICS_API_KEY`**.

**Infraestrutura:** Tudo local (PC). Postgres em Docker (porta 5433), API Fastify (3333) e Frontend Vite (5173). Sem dependências de servidores externos (DigitalOcean removido).

**Painel web (`frontend/`):** Vite + React + React Router (`AppShell`). Rotas típicas: **`/`** listagem de **categorias** (GET `/analytics/categories`); **`/analytics`** relatórios globais; **`/categoria/:slug`** mesmos relatórios com `categoryUrl`; **`/produto/:id`** workspace; **`/a-mao`** Produtos em análise (histórico `localStorage` + métricas via API). O proxy Vite envia `/analytics/*` para a API. Carregamento dos separadores de relatórios é **automático** ao abrir ou mudar de aba (cache em `analyticsDashboardCache.jsx`); **Carregar dados** força refresh do separador actual.

**Documentação viva:** `FLUXO.md` (comandos + painel), `docs/ARCHITECTURE.md`, `frontend/README.md`, regras em `.cursor/rules/`.

---

## 2. Profissionalismo — o que já está bem

| Área | Situação |
|------|----------|
| Código | Um ficheiro principal claro, funções com responsabilidade; comentário de header e exports para regressão. |
| Testes | Regressão cobre normalização, merge, loja, dedupe, avaliações, dedupe de URLs PDP. |
| Documentação interna | `README.md`, `docs/ARCHITECTURE.md`, `docs/ANALYTICS-API.md`, `docs/ROADMAP.md`, `docs/adr/`, `FLUXO.md`, `frontend/README.md`, regras em `.cursor/rules/`. |
| Saída de dados | Separação `output/dados_produtos.json` vs `output/extra/`. |
| `gitignore` | `node_modules/`, perfil Chrome, `output/*` (com `.gitkeep` onde importa). |
| Variáveis de ambiente | Comportamento configurável (URL, headed, PII em peek, limites PDP). |

---

## 3. Profissionalismo — melhorias recomendadas

1. **Manter docs alinhadas ao código** — após mudar fluxos do painel, API ou scrape: **`FLUXO.md`** (incl. § painel quando aplicável), **`docs/ANALYTICS-API.md`** se endpoints mudarem, **`frontend/README.md`**, e parágrafos em **`docs/ARCHITECTURE.md`** / **`README.md`** quando o contrato ou o scraping mudarem (`.cursor/rules/fluxo-doc-update.mdc`).
2. **CI mínima** — GitHub Actions (ou outro) a correr `npm test` em push/PR; falha cedo se quebrar o parser.
3. **Linter (ESLint) + formatação (Prettier, opcional)** — consistência e erros comuns; pode ser só em `src/` e `test/`.
4. **Roadmap** — tarefas em `docs/ROADMAP.md` (ex. testes para `normalizeItem` com JSON de exemplo) podem estar parcialmente resolvidas; rever checkboxes.
5. **Tamanho de `scrapeCategory.mjs`** — com o tempo, considerar módulos (`normalizeItem`, extratores, writer) se a manutenção ficar pesada (não urgente).
6. **Versionamento** — `engines` no `package.json` (`"node": ">=20"` ou a versão realmente usada) para evitar surpresas em equipa.

---

## 4. Segurança — riscos inerentes

- **Dados sensíveis em disco:** ficheiros de debug (`output/extra/modern_router_peek.json`, `caca_*.jsonl`, `rede_*.log`) podem conter **amostras de JSON** com tokens, IDs de utilizador, parâmetros de API — o próprio `ARCHITECTURE.md` avisa. O perfil **`.chrome-tiktok-profile`** contém **cookies e sessão**; está no `.gitignore`, mas nunca o commitar.
- **Superfície de execução:** o script abre o browser; não há sandbox adicional. Em CI, Puppeteer exige cuidado (dependências do sistema, variáveis).
- **Terceiros (TikTok):** o uso do scraper pode violar **termos de serviço** do TikTok Shop; isso é **risco legal/compliance** do detentor do projeto, não só técnico.
- **STEALTH:** reduz deteção fácil de automação, mas **não** é invisibilidade; bloqueios e captchas podem ocorrer.

---

## 5. Segurança — boas práticas e o que faltar

**Já feito / reforçar:**

- Manter `output/` e `*.log` e perfil fora de git; rever antes de partilhar ZIP do projeto.
- Em ambientes partilhados, rodar com `ROUTER_PEEK_LEN=0` (ou mínimo) e **sem** `HUNT`/`--debug` em “produção” local, para **menor exposição** em ficheiros (ROADMAP já aponta PII no peek).
- Não publicar `dados_produtos.json` com dados pessoais de terceiros sem base legal (GDPR / LGPD).

**Sugestões adicionais:**

- **Ficheiro `.env.example`** (sem segredos) com `CATEGORY_URL=`, comentário “não commitar .env com URLs privadas se aplicável”. O projeto usa sobretudo `process.env` sem dotenv; opcional: `dotenv` só local.
- **Checklist de release** (no README ou `docs/`): o que nunca fazer (commitar output, partilhar perfil Chrome).
- **Dependabot / `npm audit`** em rotina; Puppeteer puxa Chromium — manter `package-lock.json` e revisar actualizações.

---

## 6. O que ainda “falta” ou fica aberto

| Item | Nota |
|------|------|
| README raiz | Existe (`README.md`); manter links para `FLUXO.md` e analytics. |
| CI (test) | GitHub Actions com `npm test` em PR/push (`README.md`); `validate:schemas` continua local (sem `output/` no clone). |
| **Licença** (`LICENSE`) | Inexistente na raiz — definir (MIT, etc.) se o repo for público. |
| Conformidade ToS TikTok | Decisão de produto/legal; o código não a substitui. |
| Categorização de erros de scrape | Pode-se devolver `status` + `note` mais granulares (já parcialmente existe). |
| Monitorização / métricas | Não aplicável a este script CLI simples, a não ser extensão futura. |

---

## 7. Resumo executivo (para colar no Cursor)

> **Pipeline:** coleta (Puppeteer Stealth) → JSON `output/` → import Prisma → relatórios CLI/lib + **API Fastify** autenticada → **React/Vite** (categorias, analytics global/por categoria, workspace por produto, Produtos em análise). **Pontos fortes:** contrato JSON + schema AJV, histórico na BD por `ScrapeRun`, analytics partilhados CLI/API, UI coerente (tema escuro). **Em desenvolvimento:** rate limits / hardening API se exposta à internet. **Segurança:** não commitar `output/`, perfil Chrome, `.env`; `ANALYTICS_API_KEY` obrigatória na API; consciência ToS TikTok. **Aberto:** LICENSE se repo público, ESLint opcional, rever `docs/ROADMAP.md`.

---

*Actualizar este ficheiro após mudanças relevantes em scrape, API, painel ou import.*
