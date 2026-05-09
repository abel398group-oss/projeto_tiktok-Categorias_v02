# Documentação de Arquitetura (Cursor)

Esta pasta é um **índice para a IA do Cursor** neste repositório. A documentação descritiva do projeto está em `docs/`.

## Onde encontrar

| Tema | Local |
|------|--------|
| **Tarefas (fonte única), estados [ ] [~] [!] [x]** | **`docs/ROADMAP.md`** |
| Atalho raiz p/ GitHub | `ROADMAP.md` → aponta para `docs/ROADMAP.md` |
| Arquitetura geral, fluxo, env, limitações | `docs/ARCHITECTURE.md` |
| Resumo técnico + comparação Hipervias / o que reutilizar | **`docs/CURSOR-CONTEXTO-SISTEMA.md`** |
| O que já foi validado (JSON ↔ BD, amostra site) | **`docs/RELATORIO-VALIDACAO.md`** |
| Prisma / Postgres (import) | `prisma/schema.prisma`, `npm run db:import:output` |
| Decisões (ADR) | `docs/adr/` e `docs/adr/README.md` |
| Código do scraper (único ponto lógico) | `src/scrapeCategory.mjs` |
| Saída “final” (campos em PT) | `output/dados_produtos.json` (gerado; não em git) |
| Técnica / debug / lojas / caça | `output/extra/*` (ex. `teste_categoria.json`, `modern_router_peek.json`, `caca_*.jsonl`, `rede_ultima_execucao.log`) |
| Scripts npm (headed, debug, caça, peek) | `package.json` |
| Perfil de login (local, não committar) | `.chrome-tiktok-profile/` (ignorado no git) |
| Itens a ignorar no commit | `.gitignore` (incl. `output/*` exc. `.gitkeep`) |
| Regras persistentes do Cursor (convenções) | `.cursor/rules/*.mdc` (ex.: `task-management`, `architecture-context`, **`droplet-docker-prisma`**, **`analytics-esm-no-regress`** em `scripts/analytics/`, **`spaces-env-stable`** para DO Spaces / `.env`) |

## Uso

- **Tarefas e roadmap:** editar **`docs/ROADMAP.md`** (não criar `PLANO_*.md` / checklists soltos).
- Ao **alterar** o fluxo de rede, o parser JSON ou o formato de `dados_produtos`, atualizar `docs/ARCHITECTURE.md`; decisões fortes → **ADR** em `docs/adr/`.
- Não adicionar **dados pessoais** ou tokens a ficheiros versionados: `output/` fica fora do git por defeito.

## Relação com Hipervias v12 (outro repo)

Este projeto é **pacote npm único** (não monorepo tipo `apps/api` + `apps/web`). Tem **Prisma** para import analítico (`db:import:output`), **sem** Nest nem front. Ver **`docs/CURSOR-CONTEXTO-SISTEMA.md`** para tabela comparativa e ideias reutilizáveis (Docker Postgres, CI com fixture, ADRs, etc.).
