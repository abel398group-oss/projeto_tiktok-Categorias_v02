# ROADMAP — fonte única de tarefas

Este ficheiro é a **única** fonte de tarefas objetivas do projeto. Não usar `PLANO_*.md`, `CHECKLIST_*.md`, `TODO_*.md` ou backlogs paralelos na raiz (análises técnicas podem existir em `docs/`, mas **as tarefas resultantes** ficam aqui).

**Repositório:** [abel398group-oss/projeto_tiktok-Categorias_v02](https://github.com/abel398group-oss/projeto_tiktok-Categorias_v02)

Detalhe de arquitetura: `docs/ARCHITECTURE.md`. Decisões formais: `docs/adr/`.

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

## `fotos_pdp` — validação (abril 2026)

- [x] **`fotos_pdp` → OK (validado manualmente no output real).** Não abrir, por agora, a heurística extra de “limpeza” por URL (risco de falsos positivos/negativos); o scraper já filtra a grelha de miniaturas no DOM e deduplica por pathname/asset.

**Nota:** O `dados_produtos.json` (e corridas reais) está **consistente** no que toca a `fotos_pdp` no estado actual. Se no futuro aparecer **ruído** recorrente (logos, badges, promos) nas URLs, reavaliar: filtro pós-URL (ex. `filterPdpProductImages`) + testes de regressão.

**Ordem de prioridade actual:** (1) validação feita, (2) **não alterar** a pipeline de `fotos_pdp` por enquanto, (3) avançar para a **próxima etapa** abaixo (tarefas em aberto / próximo marco do produto de dados).

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

1. **Manter o scraper estável** (regressão `npm test` antes de merges relevantes).  
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
