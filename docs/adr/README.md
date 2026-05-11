# Architecture Decision Records (ADR)

Decisões que **perduram** (escolha de abordagem, fonte de dados, limites do scraper) registam-se aqui, no estilo usado no ecossistema Hipervias/Uleder, **adaptado** a este repositório: **Node + Puppeteer** (scraper), **sem monorepo**, e **Prisma + Postgres** para persistência histórica e analytics em CLI (ver `prisma/schema.prisma`, `npm run db:import:output`).

## Formato sugerido

Ficheiro: `docs/adr/0001-titulo-curto-em-kebab.md` (número sequencial com padding).

```markdown
# ADR 0001: Título

- **Data:** AAAA-MM-DD
- **Status:** Proposto | Aceite | Adiado | Rejeitado
- **Contexto:** …
- **Decisão:** …
- **Consequências:** …
```

## Quando escrever um ADR

- Mudança de estratégia (ex. passar a depender só de XHR vs só de HTML).
- Formato canónico de `dados_produtos.json` se for alterado de forma contratual.
- **Não** é obrigatório ADR para cada bugfix ou refactor interno pequeno.

## Relação com o ROADMAP

Tarefas no `docs/ROADMAP.md` podem apontar “ver ADR 00XX”. Ao fechar tarefa que implica decisão, criar o ADR e referenciar no ROADMAP.

## Índice

| ADR | Tema |
|-----|------|
| [0001](./0001-modelo-hibrido-produto-loja.md) | Modelo híbrido produto+loja nos JSONs |
| [0002](./0002-preco-vendas-v1.md) | Preço e vendas v1 |
| [0003](./0003-local-scraper-worker-remote-import.md) | Worker local + `POST /scrape/import-remote` |
