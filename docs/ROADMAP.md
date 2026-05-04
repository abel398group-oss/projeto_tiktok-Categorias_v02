# ROADMAP — fonte única de tarefas

Este ficheiro é a **única** fonte de tarefas objetivas do projeto. Não usar `PLANO_*.md`, `CHECKLIST_*.md`, `TODO_*.md` ou backlogs paralelos na raiz (análises técnicas podem existir em `docs/`, mas **as tarefas resultantes** ficam aqui).

**Repositório:** [abel398group-oss/projeto_tiktok-Categorias_v02](https://github.com/abel398group-oss/projeto_tiktok-Categorias_v02)

Detalhe de arquitetura: `docs/ARCHITECTURE.md`. Decisões formais: `docs/adr/`.

**Radar de ideias (parking list, sem compromisso até virar `- [ ]` aqui):** `docs/RADAR-IDEIAS.md`

**Módulo de preço v1 (abril 2026):** validado manualmente (produtos com e sem desconto, duas categorias) e protegido por testes. **Não** alterar lógica de preço, `normalizeItem` ou campos de desconto na exportação **sem** nova issue/tarefa explícita; qualquer toque nesses trechos: correr `npm test`. Ver `docs/ARCHITECTURE.md` (contrato de preço) e `.cursor/rules/scrape-mjs-patterns.mdc`.

**Módulo de vendas v1 (abril 2026):** após ajuste no `mergeProductById` (máximo `sales_count` entre colisões), **validado manualmente**; **aprovado com ressalva controlada** (feed ≠ pixel-perfect com UI; ver contrato de vendas). **Não** alterar extração/merge de vendas sem tarefa explícita e `npm test`. Ver `docs/ARCHITECTURE.md` (contrato de vendas) e `.cursor/rules/scrape-mjs-patterns.mdc`.

---

## Metodologia (alinhada ao fluxo Cursor / Uleder)

| Marcação | Significado |
|----------|-------------|
| `- [ ]` | Não iniciada |
| `- [~]` | Parcialmente executada (nota do que falta) |
| `- [!]` | Finalizada com pendências (nota) |
| `- [x]` | Finalizada |

**Ao concluir uma tarefa:** marcar `[x]` aqui; se houver **decisão arquitetural** duradoura, registar **ADR** em `docs/adr/` (ver `docs/adr/README.md`). Não deixar checklists temporários versionados fora deste ficheiro.

---

## CI e qualidade (repositório)

**v1 actual (no repo):**

- [x] **CI (GitHub Actions):** push e PR — `npm test` **e** `npm run validate:schemas:ci` (fixtures em `test/fixtures/schema-ci/`) — ver `.github/workflows/ci.yml` e `README.md`.
- [x] Governança mínima do repositório (gitignore, CHANGELOG, ADR, engines, README)
- [x] **JSON Schema** dos outputs (`schemas/dados_produtos.schema.json`, `schemas/dados_lojas.schema.json`)
- [x] **Validação local** `npm run validate:schemas` (lê `output/dados_*.json`) e **opção `--data-dir`** em `scripts/validate-output-schema.mjs` para outras pastas
- [x] **Importador JSON → Postgres v1** (`npm run db:import:output` → `scripts/import-output-to-db.mjs`); identidade com upsert, histórico em snapshots, envelope bruto em `RawPayload`
- [x] **Proteção contra reimportação duplicada** — `inputHash` (SHA-256 do input consolidado) em `ScrapeRun`; segunda importação do mesmo payload não duplica snapshots
- [x] **Analytics v1** (CLI read-only, `scripts/analytics/`): `analytics:top-products`, `analytics:new-products`, `analytics:growth`, `analytics:opportunities`, `analytics:product-score` — ver `docs/ANALYTICS.md`
- [x] **API analytics HTTP read-only (v1):** Fastify (`npm run analytics:api`), `scripts/analytics/server.mjs`, `docs/ANALYTICS-API.md`; auth com `ANALYTICS_API_KEY`
- [x] **Painel web (v1 UI):** Vite + React em `frontend/` — `npm run frontend:dev`; fluxo em `FLUXO.md`

**Futuro — evoluções (não bloqueadores da v1):**

- [ ] **Score** versionado / persistido (tabela ou materialização) e ajuste de pesos por categoria
- [ ] Motor de **viabilidade** (custos fornecedor vs preço mercado)
- [ ] Integração **n8n / WhatsApp** via API (sem acesso SQL directo ao Postgres)

**Futuro — qualidade / infra:**

- [ ] **Smoke test** de scraper real (navegador, rede) em CI ou job manual — separado da regressão pura; custo, flakiness e credenciais a definir.
- [ ] **CI com lint / typecheck** se o projeto adoptar ferramentas (ESLint, TypeScript, etc.) noutro passo.
- [ ] Hash / dedupe **por categoria ou run** granular, se o fluxo evoluir (hoje é por ficheiro consolidado completo)
- [ ] Dados frios pesados: `storagePath` (object storage) em vez de JSONB só

---

## Visão estratégica do produto

O repositório **não** é apenas um scraper: a visão é uma **plataforma de inteligência de produtos** para e-commerce e marketplaces — coletar dados, analisar potencial de venda, calcular viabilidade (incl. importação) e expor análise e decisão a utilizadores com **front com login** (vendedores, fornecedores, operação interna e contas próprias no ecossistema TikTok Creator/loja).

**Fase inicial da coleta:** TikTok Shop como **primeira** fonte. **Futuro:** Mercado Livre, Shopee e outros; arquitetura a preparar `source_platform` e IDs externos para comparar o mesmo *tipo* de sinal entre plataformas (ex.: oportunidade no TikTok → validar preço e concorrência no ML/Shopee).

### 1. Pipeline geral (alvo)

Coleta de dados → tratamento → **banco histórico** → análise → **score de oportunidade** → **front / dashboard** → decisão comercial (e feedback para operação).

### 2. Fontes de dados

| Fase | Fontes |
|------|--------|
| **Inicial** | TikTok Shop (scraper actual) |
| **Futuro** | Mercado Livre, Shopee, outros marketplaces (conectores a definir) |

### 3. Objetivo da análise

Gerar insumos para identificar, entre outros:

- produtos **vendáveis** e **escaláveis**;
- potencial de **viralização** (com limitações de dados e snapshot);
- **lojas / sellers** relevantes;
- **tendências de preço** (requer histórico no tempo);
- produtos com **bom volume** de venda;
- **oportunidades** para compra / importação (combina sinais de mercado com módulo de viabilidade).

### 4. Módulo de score de produto (futuro)

**Estado actual:** existe heurística **v1 só leitura** em CLI (`npm run analytics:product-score` — não persistida; ver `docs/ANALYTICS.md`).  

Módulo analítico **alvo** (não no scraper; dimensões persistíveis / pesos de negócio) com separação por eixo, por exemplo:

- `demanda_score` · `preco_score` · `crescimento_score` · `avaliacao_score` · `concorrencia_score` · `margem_score` → **`score_final`** (regras e pesos a definir com o negócio).

### 5. Módulo de viabilidade comercial / importação (futuro)

Onde fornecedor ou operador **informa** (fora do feed bruto do marketplace), entre outros:

- preço de compra, moeda, frete internacional, impostos, taxas de marketplace, custo logístico nacional, **margem desejada**.

**Resultados pretendidos (conceituais):** custo total estimado, preço mínimo viável, margem líquida, lucro unitário, classificação de viabilidade (ex.: **aprovado** / **atenção** / **inviável**).

### 6. Tipos de utilizadores futuros

- admin interno · utilizador vendedor · fornecedor · analista/operador · contas **próprias** da operação (TikTok / loja).

### 7. Front / dashboard

**Actual (v1):** existe painel em `frontend/` (Vite/React) ligado à API analytics em desenvolvimento — ver `FLUXO.md` e `README.md`; **sem** fluxo de login multi-utilizador ainda.

**Alvo futuro:** login · dashboards adicionais · **ranking** de produtos · ficha de produto · ficha de loja/seller · gráficos avançados (vendas, preço, avaliações) · **simulador de viabilidade** · área do fornecedor.

### 8. Estratégia multi-marketplace

A arquitetura de dados e análise deve suportar:

- `source_platform` · `product_external_id` · `seller_external_id` · **snapshots por marketplace** e, quando fizer sentido, **comparação entre plataformas** (mesma oportunidade validada noutro canal).

### 9. Decisão actual (repositório scrape TikTok; abril 2026)

- O scraper TikTok **continua a ser estabilizado**; não alterar pipeline sem necessidade.  
- **Mantido** o **modelo JSON híbrido** na raiz de `output/` (`dados_produtos` + `dados_lojas`, após consolidação multi-categoria quando aplicável) como **fonte de coleta** e input do importador.  
- **`dados_lojas.json`** em uso.  
- **Postgres / Prisma:** esquema em `prisma/schema.prisma`; **importador JSON → base** (`npm run db:import:output`), **analytics v1** em CLI só leitura (`scripts/analytics/`, ver `docs/ANALYTICS.md`), **API analytics** Fastify e **painel** em `frontend/` **já fazem parte do repositório** (detalhes no `README.md` / `FLUXO.md`).  
- **Não** priorizar, neste momento, **enriquecimento pesado via PDP** (ex.: `shop_info` rico no HTML do PDP) por **risco** de puzzle / anti‑bot e custo de visitas.  
- **Próximos macros** (sem ordem fixa; alinhado à secção **Futuro** em CI e qualidade): score **persistido** / versionado e motor de **viabilidade**; fortalecer **painel/API** (auth, features); **expandir categorias** de coleta; smoke opcional do browser em CI, dados frios em **object storage** quando fizer sentido.

### 10. Regras de proteção (desenvolvimento)

- Não **quebrar** o scraper actual sem testes e justificação.  
- Manter branch **`stable/scraper-funcionando`** como referência / backup.  
- Trabalhar em **`feature/*`**.  
- Correr **`npm test`** antes de merge em alterações de parser/merge.  
- Não alterar **preço**, **dedupe** ou regras de **seller/loja** sem **testes** actualizados.  
- **Vendas (v1):** não alterar `normalizeItem` (extração de vendas), `parseSalesText`, `coalesceMaxSalesCount`, `coalesceSalesDisplayFromMerge`, nem a parte de vendas de `mergeProductById` / `toDadosProdutoClean` — ver secção *Módulo de vendas* e regras Cursor; **merge** (linha rica) continua a valer para preço/imagem, com **máximo** de vendas preservado.  
- **Preço (v1):** como já documentado; não reabrir sem critério.

---

## `fotos_pdp` — validação (abril 2026)

- [x] **`fotos_pdp` → OK (validado manualmente no output real).** Não abrir, por agora, a heurística extra de “limpeza” por URL (risco de falsos positivos/negativos); o scraper já filtra a grelha de miniaturas no DOM e deduplica por pathname/asset.

**Nota:** O `dados_produtos.json` (e corridas reais) está **consistente** no que toca a `fotos_pdp` no estado actual. Se no futuro aparecer **ruído** recorrente (logos, badges, promos) nas URLs, reavaliar: filtro pós-URL (ex. `filterPdpProductImages`) + testes de regressão.

**Ordem de prioridade actual:** (1) validação feita, (2) **não alterar** a pipeline de `fotos_pdp` por enquanto; (3) evoluções de produto seguem **Tarefas** e **Futuro** (secção CI e qualidade) neste mesmo ficheiro.

---

## Módulo de preço (v1) — concluído (abril 2026)

Validação manual: produtos **com** e **sem** desconto em **duas** categorias; pequenas diferenças de centavos vs UI aceitáveis; o módulo de preço no scraper passa a ser considerado **estável** nesta versão.

- [x] Normalização de preço **sem** desconto (campos de desconto a `null`, `tem_desconto: false` onde aplicável).
- [x] Normalização de preço **com** desconto (`preco`, `preco_original`, estimativas e gaps alinhados à regra actual).
- [x] Campo **`tem_desconto`**.
- [x] **`preco_estimado_vitrine`** (experimental) — validado no output real.
- [x] Consolidação **multi-categoria** em `output/dados_*.json` **mantendo o mesmo schema** por item (ver `scripts/consolidate-category-outputs.mjs`).

**Decisão (duradoura):** o módulo de preço **v1** está **validado manualmente** e **protegido por** `test/scrape-regression.test.mjs`. Não alterar `normalizeItem`, cálculo de preço, `tem_desconto` ou `toDadosProdutoClean` nesses campos **sem** nova issue/tarefa explícita e regressão a verde.

## Futuro — sinais e confiança de preço (não implementar agora)

- [ ] Score de **confiança** de preço.
- [ ] `price_source` (ou equivalente) **interno** para auditoria.
- [ ] Validação reforçada com amostra **PDP** (futuro; não exige implementação agora).

---

## Módulo de vendas (v1) — melhorado, validado, aprovado com ressalva (abril 2026)

- [x] **Vendas v1 melhorada:** o `mergeProductById` preserva o **maior** `sales_count` observado entre fontes do mesmo `product_id` (ver `coalesceMaxSalesCount` e `coalesceSalesDisplayFromMerge` no código).
- [x] **Validação manual** após o ajuste: muitos produtos alinham com a UI; pequenas diferenças aceitáveis (atualização em tempo real, arredondamento).
- [x] **Aprovado com ressalva controlada:** ainda é possível divergência (métrica **feed parcial / SKU** vs agregado mostrado na **UI**); isso **não** anula a aprovação de v1, mas define expectativa de consumo.
- [x] **Regressão** em `test/scrape-regression.test.mjs` (suite *mergeProductById — vendas*) a cobrir o contrato de máximo e texto.

**Decisão (duradoura):** o campo exportado **`vendas`** = **melhor esforço** a partir do feed, **consolidado** com o máximo no merge. **Não** é garantia absoluta de equivalência com o número exibido na UI; **não** utilizar `vendas` como métrica financeira “exacta” ou legal; **pode** utilizar-se para **ranking**, **tendência**, **filtro** e análise comercial. Ver `docs/ARCHITECTURE.md` (contrato de vendas).

## Futuro — sinais e confiança de **vendas** (não implementar agora)

- [ ] `vendas_confianca` (ou score análogo).
- [ ] `sales_source` / `sales_source_debug` (auditoria de fonte).
- [ ] Captura ou parse reforçado de **texto** de vendas (ex. formatos estilo `2,9K` / `1.2k`).
- [ ] Validação com **PDP** ou **endpoint** dedicado, se o negócio exigir alinhamento fino com a UI.

---

## Loja vs produto — decisão: modelo híbrido (JSON)

- **Estado:** o scraper gera **dois** outputs complementares, descritos em **`docs/ARCHITECTURE.md`** (secções *Contrato dos outputs* e *Modelo Postgres (Prisma)*).
- **`dados_produtos.json`:** export plano/flat com **produto + `seller_id` + `nome_loja` + campos `loja_*` / logos** em cada item — **desnormalização intencional** (inspeção, análise rápida, sem `join` forçado). **Não** substitui o modelo relacional na base (é contrato do scraper e input do import).
- **`output/dados_lojas.json`:** agregado **oficial** — **uma** loja **por** `seller_id` (análise de vendedor; import da dimensão **`sellers`** em Postgres via `npm run db:import:output`).
- **Ligação:** `seller_id` em comum.
- **Decisão:** **não** remover campos de loja de `dados_produtos` nesta fase; **não** mudar o formato de `dados_lojas` para “forçar” normalização no JSON exportado. A **normalização canónica** em Postgres (`products` / `sellers` / snapshots) **já existe** via importador; os JSON continuam a ser a **saída da coleta** e o payload importado sem recalcular merge/preço/vendas no import.
- [x] **Contrato dos outputs documentado** em `docs/ARCHITECTURE.md` (e apontador no `FLUXO.md` onde existir).
- [ ] (Opcional, fase posterior) **Separação estrita** só de campos de loja no `dados_produtos` — requer decisão, consumidores e testes.
- [ ] (Opcional) Importador / consumidores a usarem `dados_lojas` para métricas por vendedor de forma explícita.

---

## Próximas fases (ordem recomendada, alto nível)

**Já entregues no repositório (contexto):** esquema **Postgres/Prisma**, **importador** JSON → base, **analytics v1** em CLI sobre snapshots, **API analytics** Fastify, **painel** Vite/React, **CI** com `npm test` + **validação de schema com fixtures**, **JSON Schema** + validação local sobre `output/` — ver secção **CI e qualidade** acima.

1. **Manter o scraper estável** (regressão `npm test`; CI em push/PR com `validate:schemas:ci`).  
2. **Validar outputs** reais (`dados_produtos`, `dados_lojas`, debug se necessário) e `npm run validate:schemas` / `validate:db-vs-json` quando aplicável.  
3. **Contrato dos JSONs** — manter `docs/ARCHITECTURE.md` e `schemas/` alinhados quando o pipeline exportado mudar.  
4. **Testar** mais categorias reais; validar variação de dados e edge cases.  
5. **Evoluir analytics e score** — heurística persistida / versionada, pesos por categoria; ver itens **Futuro — evoluções** na secção CI (viabilidade, integrações).  
6. **Otimizar velocidade** da coleta e do import quando houver medição (paralelismo, batch, rate limit — **após** critérios de negócio e sem quebrar idempotência).  
7. Evoluir **painel / API** (login, relatórios adicionais, hardening) conforme prioridade — v1 já no repositório; ver secção **CI e qualidade** e **Front / dashboard** acima.

Não implica prazos: é **sequência orientadora**; itens 4–7 podem avançar em paralelo onde fizer sentido.

---

## Tarefas

- [ ] Deduplicar por `product_id` no mapa e/ou excluir nós com `review_id` para limpar `dados_produtos.json`.
- [ ] Tratar conflito “grelha rica” vs “review pobre” (priorizar `product_price_info`).
- [ ] (Opcional) Testes unitários mínimos para `normalizeItem` / `parseDiscountPercentFromPpi` com JSON de exemplo.
- [ ] (Opcional) `ROUTER_PEEK_LEN=0` por defeito em “produção” local para reduzir PII em `modern_router_peek.json`.

---

## Documentos de análise

Investigações ou notas longas podem viver em `docs/` (ex. `docs/analise-*.md`), desde que as **ações** derivadas sejam copiadas para a secção **Tarefas** acima.
