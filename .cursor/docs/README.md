# Documentação de Arquitetura (Cursor)

Esta pasta é um **índice para a IA do Cursor** neste repositório. A documentação descritiva do projeto está em `docs/`.

## Onde encontrar

| Tema | Local |
|------|--------|
| **Tarefas (fonte única), estados [ ] [~] [!] [x]** | **`docs/ROADMAP.md`** |
| Atalho raiz p/ GitHub | `ROADMAP.md` → aponta para `docs/ROADMAP.md` |
| Arquitetura geral, fluxo, env, limitações | `docs/ARCHITECTURE.md` |
| Decisões (ADR) | `docs/adr/` e `docs/adr/README.md` |
| Código do scraper (único ponto lógico) | `src/scrapeCategory.mjs` |
| Saída “final” (campos em PT) | `output/dados_produtos.json` (gerado; não em git) |
| Saída técnica / debug | `output/teste_categoria.json`, `output/modern_router_peek.json`, `output/caca_*.jsonl`, `output/rede_ultima_execucao.log` |
| Scripts npm (headed, debug, caça, peek) | `package.json` |
| Perfil de login (local, não committar) | `.chrome-tiktok-profile/` (ignorado no git) |
| Itens a ignorar no commit | `.gitignore` (incl. `output/*` exc. `.gitkeep`) |
| Regras persistentes do Cursor (convenções) | `.cursor/rules/*.mdc` (ex.: `task-management`, `architecture-context`) |

## Uso

- **Tarefas e roadmap:** editar **`docs/ROADMAP.md`** (não criar `PLANO_*.md` / checklists soltos).
- Ao **alterar** o fluxo de rede, o parser JSON ou o formato de `dados_produtos`, atualizar `docs/ARCHITECTURE.md`; decisões fortes → **ADR** em `docs/adr/`.
- Não adicionar **dados pessoais** ou tokens a ficheiros versionados: `output/` fica fora do git por defeito.

## Relação com o print de referência (Hipervias)

Este repositório é **um único módulo Node** (não monorepo). A tabela acima substitui referências a `apps/api`, `Prisma` ou `E2E` do outro projeto pelos caminhos reais **deste** projeto.
