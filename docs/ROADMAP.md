# ROADMAP — fonte única de tarefas

Este ficheiro é a **única** fonte de tarefas objetivas do projeto. Não usar `PLANO_*.md`, `CHECKLIST_*.md`, `TODO_*.md` ou backlogs paralelos na raiz (análises técnicas podem existir em `docs/`, mas **as tarefas resultantes** ficam aqui).

**Repositório:** [abel398group-oss/projeto_tiktok-Categorias_v02](https://github.com/abel398group-oss/projeto_tiktok-Categorias_v02)

Detalhe de arquitetura: `docs/ARCHITECTURE.md`. Decisões formais: `docs/adr/`.

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

- [x] **CI simples (GitHub Actions):** em cada push e pull request corre `npm test` (ver `.github/workflows/ci.yml` e `README.md`).

**Futuro (não implementar agora):**

- [ ] **Smoke test** de scraper real (navegador, rede) em CI ou job manual — separado da regressão pura; custo, flakiness e credenciais a definir.
- [ ] **Validação de schema** JSON dos outputs (`dados_produtos` / `dados_lojas`) no CI ou pós-geração.
- [ ] **CI com lint / typecheck** se o projeto adoptar ferramentas (ESLint, TypeScript, etc.) noutro passo.

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

Módulo analítico (não implementado no scraper) com dimensões separadas, por exemplo:

- `demanda_score` · `preco_score` · `crescimento_score` · `avaliacao_score` · `concorrencia_score` · `margem_score` → **`score_final`** (regras e pesos a definir com o negócio).

### 5. Módulo de viabilidade comercial / importação (futuro)

Onde fornecedor ou operador **informa** (fora do feed bruto do marketplace), entre outros:

- preço de compra, moeda, frete internacional, impostos, taxas de marketplace, custo logístico nacional, **margem desejada**.

**Resultados pretendidos (conceituais):** custo total estimado, preço mínimo viável, margem líquida, lucro unitário, classificação de viabilidade (ex.: **aprovado** / **atenção** / **inviável**).

### 6. Tipos de utilizadores futuros

- admin interno · utilizador vendedor · fornecedor · analista/operador · contas **próprias** da operação (TikTok / loja).

### 7. Front / dashboard (futuro)

- login · dashboard de produtos · **ranking** de produtos · ficha de produto · ficha de loja/seller · gráficos (vendas, preço, avaliações) · **simulador de viabilidade** · área do fornecedor.

### 8. Estratégia multi-marketplace

A arquitetura de dados e análise deve suportar:

- `source_platform` · `product_external_id` · `seller_external_id` · **snapshots por marketplace** e, quando fizer sentido, **comparação entre plataformas** (mesma oportunidade validada noutro canal).

### 9. Decisão actual (repositório scrape TikTok; abril 2026)

- O scraper TikTok **continua a ser estabilizado**; não alterar pipeline sem necessidade.  
- **Mantido** o **modelo JSON híbrido** (`dados_produtos` + `dados_lojas` na raiz de `output/`).  
- **`dados_lojas.json`** em uso.  
- **Não** priorizar, neste momento, **enriquecimento pesado via PDP** (ex.: `shop_info` rico no HTML do PDP) por **risco** de puzzle / anti‑bot e custo de visitas.  
- **Próximo passo macro** a escolher **depois** (sem compromisso fixo):  
  (a) modelar **Postgres** · (b) importador **JSON → banco** · (c) evoluir **scoring** · (d) **expandir categorias** de coleta · (e) **API / front**.

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

**Ordem de prioridade actual:** (1) validação feita, (2) **não alterar** a pipeline de `fotos_pdp` por enquanto, (3) avançar para a **próxima etapa** abaixo (tarefas em aberto / próximo marco do produto de dados).

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

- **Estado:** o scraper gera **dois** outputs complementares, descritos em **`docs/ARCHITECTURE.md`** (secção *Contrato dos outputs* e *Futuro modelo Postgres*).
- **`dados_produtos.json`:** export plano/flat com **produto + `seller_id` + `nome_loja` + campos `loja_*` / logos** em cada item — **desnormalização intencional** (inspeção, análise rápida, sem `join` forçado). **Não** é o modelo final da base de dados.
- **`output/dados_lojas.json`:** agregado **oficial** — **uma** loja **por** `seller_id` (análise de vendedor, import da dimensão `sellers` no futuro).
- **Ligação:** `seller_id` em comum.
- **Decisão:** **não** remover campos de loja de `dados_produtos` nesta fase; **não** mudar o formato de `dados_lojas` para “forçar” normalização no JSON. A **normalização plena** (tabelas `products` / `sellers` / snapshots) fica para **Postgres** quando existir.
- [x] **Contrato dos outputs documentado** em `docs/ARCHITECTURE.md` (e apontador no `FLUXO.md` onde existir).
- [ ] (Opcional, fase posterior) **Separação estrita** só de campos de loja no `dados_produtos` — requer decisão, consumidores e testes.
- [ ] (Opcional) Importador / consumidores a usarem `dados_lojas` para métricas por vendedor de forma explícita.

---

## Próximas fases (ordem recomendada, alto nível)

1. **Manter o scraper estável** (regressão `npm test` localmente; no GitHub, o workflow **CI** corre os mesmos testes em push/PR).  
2. **Validar outputs** reais (`dados_produtos`, `dados_lojas`, debug se necessário).  
3. **Contrato dos JSONs** — documentado em `docs/ARCHITECTURE.md` (feito; rever quando o pipeline mudar).  
4. **Definir esquema Postgres** (tabelas + relações; ver secção *Futuro modelo Postgres*).  
5. **Importador JSON → Postgres** (sem alterar a lógica de coleta; camada separada).  
6. **Testar** 3–5 categorias reais; validar variação de dados.  
7. **Métricas / ranking** (sobre snapshots ou agregados).  
8. **Otimizar velocidade** (paralelismo, filas, rate limit — após o modelo de dados fechado).  
9. **Front / dashboard** (após base e import estáveis).

Não implica prazos: é **sequência lógica**; pode haver itens em paralelo após a fase 3.

---

## Tarefas

- [ ] Deduplicar por `product_id` no mapa e/ou excluir nós com `review_id` para limpar `dados_produtos.json`.
- [ ] Tratar conflito “grelha rica” vs “review pobre” (priorizar `product_price_info`).
- [ ] (Opcional) Testes unitários mínimos para `normalizeItem` / `parseDiscountPercentFromPpi` com JSON de exemplo.
- [ ] (Opcional) `ROUTER_PEEK_LEN=0` por defeito em “produção” local para reduzir PII em `modern_router_peek.json`.

---

## Documentos de análise

Investigações ou notas longas podem viver em `docs/` (ex. `docs/analise-*.md`), desde que as **ações** derivadas sejam copiadas para a secção **Tarefas** acima.
