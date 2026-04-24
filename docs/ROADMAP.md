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

## Tarefas

- [ ] Deduplicar por `product_id` no mapa e/ou excluir nós com `review_id` para limpar `dados_produtos.json`.
- [ ] Tratar conflito “grelha rica” vs “review pobre” (priorizar `product_price_info`).
- [ ] (Opcional) Testes unitários mínimos para `normalizeItem` / `parseDiscountPercentFromPpi` com JSON de exemplo.
- [ ] (Opcional) `ROUTER_PEEK_LEN=0` por defeito em “produção” local para reduzir PII em `modern_router_peek.json`.

---

## Documentos de análise

Investigações ou notas longas podem viver em `docs/` (ex. `docs/analise-*.md`), desde que as **ações** derivadas sejam copiadas para a secção **Tarefas** acima.
