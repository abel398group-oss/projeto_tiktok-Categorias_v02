# ADR 0001 — Modelo híbrido produto/loja

- **Status:** Aceite (actualizado após introdução de Postgres/Prisma)
- **Contexto:** O scraper produz ficheiros JSON consumíveis sem join obrigatório; a plataforma precisa também de histórico relacional e auditoria.

## Decisão

- Manter **dados de loja** em cada item de `dados_produtos.json` **e** o agregado **`dados_lojas.json`** (uma entrada por `seller_id`), conforme `docs/ARCHITECTURE.md`.
- A **coleta** continua a ter como **fonte de verdade imediata** os JSON em `output/` (após consolidação multi-categoria quando aplicável); o **Postgres** recebe esses dados via **`npm run db:import:output`** sem recalcular preço ou merge.

## Motivo

Simplicidade de consumo em análise exploratória, evitar joins forçados no JSON, e desempenho em inspeção local; duplicação intencional no plano exportado.

## Consequências

- **Duplicação** de campos de loja nas linhas de produto no JSON (aceite).
- O **modelo relacional canónico** (`Product`, `Seller`, `ProductSnapshot`, `SellerSnapshot`, `ScrapeRun`, `RawPayload`) **existe** em **`prisma/schema.prisma`** e é preenchido pelo importador; o JSON **não** deixa de ser o contrato de **saída do scraper** nem o input estável do import.
- Evoluções de schema na base seguem Prisma/migrations; alterações contratuais dos JSON exigem alinhamento com `schemas/` e `docs/ARCHITECTURE.md`.
