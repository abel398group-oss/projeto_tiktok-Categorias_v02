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

## Loja vs produto — ficheiro separado (decisão)

- **Faz sentido** ter a loja fora do “núcleo” do item de produto: entidade **vendedor/loja** em JSON próprio, chaveada por `seller_id`, evita duplicar blocos idênticos em centenas de produtos e alinha com Postgres (`sellers` + `products`).

- **Já implementado (pipeline actual):** `output/extra/dados_lojas.json` — grelha de lojas **deduplicada** a partir do mapa de produtos (`buildLojasMapBySeller` em `scrapeCategory.mjs`). O `dados_produtos.json` ainda traz **campos de loja desnormalizados** (`nome_loja`, `loja_vendas_total`, logos, etc.) para leitura humana e joins simples; isso **não invalida** o ficheiro de lojas: são dois níveis (catálogo agregado vs cópia no produto).

- [~] **Documentar o contrato** (FLUXO / `ARCHITECTURE`): caminho de `dados_lojas`, relação com `seller_id` no produto, e quando fazer *join* em consumidores.
- [ ] (Opcional, fase posterior) **Afinar separação “estrita”:** em `dados_produtos` exportar só `seller_id` + `global_seller_id` (e opcionalmente `nome_loja` para conveniência), e tratar métricas de loja **apenas** em `dados_lojas` — exige ajuste de testes e de quem consome o JSON.
- [ ] (Opcional) Garantir que consumidores (scripts, futuro importador) **lêem** `dados_lojas` quando precisam de perfil de loja em vez de duplicar lógica só sobre o array de produtos.

---

## Tarefas

- [ ] Deduplicar por `product_id` no mapa e/ou excluir nós com `review_id` para limpar `dados_produtos.json`.
- [ ] Tratar conflito “grelha rica” vs “review pobre” (priorizar `product_price_info`).
- [ ] (Opcional) Testes unitários mínimos para `normalizeItem` / `parseDiscountPercentFromPpi` com JSON de exemplo.
- [ ] (Opcional) `ROUTER_PEEK_LEN=0` por defeito em “produção” local para reduzir PII em `modern_router_peek.json`.

---

## Documentos de análise

Investigações ou notas longas podem viver em `docs/` (ex. `docs/analise-*.md`), desde que as **ações** derivadas sejam copiadas para a secção **Tarefas** acima.
