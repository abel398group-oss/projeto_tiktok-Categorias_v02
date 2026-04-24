# Análise do projeto (Cursor / handoff)

Documento para contexto: **como o projeto funciona**, **nível de profissionalismo**, **segurança**, **lacunas** e **melhorias** sugeridas.  
Projeto: scraper de **TikTok Shop** (categoria) em Node + Puppeteer — repositório `projeto_tiktok-Categorias_v02`.

---

## 1. Como está a funcionar (técnico)

- **Entrada:** uma URL de categoria (`CATEGORY_URL` ou default em `scrapeCategory.mjs`).
- **Runtime:** `puppeteer-extra` + plugin **Stealth**; `setRequestInterception` + `page.on("response")` lê respostas `application/json` de feeds OEC/Shop; também lê `#__MODERN_ROUTER_DATA__` no HTML após o load.
- **Processamento:** `mergeProductById` (Map por `product_id`) + `normalizeItem` (preço, loja, imagens, `rate_info`, etc.); nós com `review_id` são excluídos de serem “produto de grelha”.
- **Saída humana:** `output/dados_produtos.json` (PT-BR). Técnica / debug: `output/extra/`.
- **Opcional `PDP_GALLERY`:** após a grelha, N navegações a `.../pdp/...` para enriquecer `fotos_pdp` (DOM + router no PDP). Tudo no **mesmo** processo Node — não é preciso correr dois comandos em cadeia.

**Scripts npm (atalhos):** `coleta` / `coleta:completa` (ver `package.json` e `FLUXO.md`).

**Testes:** `test/scrape-regression.test.mjs` — `npm test` (parser, merge, loja, avaliações).

---

## 2. Profissionalismo — o que já está bem

| Área | Situação |
|------|----------|
| Código | Um ficheiro principal claro, funções com responsabilidade; comentário de header e exports para regressão. |
| Testes | Regressão cobre normalização, merge, loja, dedupe, avaliações, dedupe de URLs PDP. |
| Documentação interna | `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/adr/`, `FLUXO.md`, regras em `.cursor/rules/`. |
| Saída de dados | Separação `output/dados_produtos.json` vs `output/extra/`. |
| `gitignore` | `node_modules/`, perfil Chrome, `output/*` (com `.gitkeep` onde importa). |
| Variáveis de ambiente | Comportamento configurável (URL, headed, PII em peek, limites PDP). |

---

## 3. Profissionalismo — melhorias recomendadas

1. **README na raiz do repositório** — hoje não existe `README.md` na root (só notas em `.cursor/docs/`). Para GitHub e onboarding: objetivo, instalação, `npm run coleta` / `coleta:completa`, aviso de ToS, link para `FLUXO.md` e `docs/ARCHITECTURE.md`.
2. **CI mínima** — GitHub Actions (ou outro) a correr `npm test` em push/PR; falha cedo se quebrar o parser.
3. **Linter (ESLint) + formatação (Prettier, opcional)** — consistência e erros comuns; pode ser só em `src/` e `test/`.
4. **Alinhar documentação com o código** — ex.: `docs/ARCHITECTURE.md` ainda menciona fluxo “sem abrir PDP” no objetivo; o projeto suporta **PDP opcional** (`PDP_GALLERY`) — vale atualizar o parágrafo de objetivo.
5. **Roadmap** — tarefas em `docs/ROADMAP.md` (ex. testes para `normalizeItem` com JSON de exemplo) podem estar parcialmente resolvidas; rever checkboxes.
6. **Tamanho de `scrapeCategory.mjs`** — com o tempo, considerar módulos (`normalizeItem`, extratores, writer) se a manutenção ficar pesada (não urgente).
7. **Versionamento** — `engines` no `package.json` (`"node": ">=20"` ou a versão realmente usada) para evitar surpresas em equipa.

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
| README raiz | Facilita clonagem e confiança no repo. |
| CI (test) | Garante regressão contínua. |
| **Licença** (`LICENSE`) | Inexistente na raiz — definir (MIT, etc.) se o repo for público. |
| Conformidade ToS TikTok | Decisão de produto/legal; o código não a substitui. |
| Categorização de erros de scrape | Pode-se devolver `status` + `note` mais granulares (já parcialmente existe). |
| Monitorização / métricas | Não aplicável a este script CLI simples, a não ser extensão futura. |

---

## 7. Resumo executivo (para colar no Cursor)

> Scraper Node (Puppeteer Stealth) que coleta uma categoria TikTok Shop via XHR + `__MODERN_ROUTER_DATA__`, normaliza para `Map` por `product_id`, gera `output/dados_produtos.json` e opcionalmente enriquece com PDP. Testes de regressão presentes. **Pontos fortes:** separação saída principal vs `extra/`, testes, docs internos. **Melhorar:** README, CI, enquadramento doc/ToS, revisão Roadmap, reduzir PII em modos debug. **Segurança:** não versionar `output/`, logs nem perfil Chrome; cuidado com PII em peeks; consciência de ToS. **Falta:** LICENSE visível, `.env.example` opcional, ESLint opcional.

---

*Gerado para contexto; atualizar após mudanças relevantes no código.*
