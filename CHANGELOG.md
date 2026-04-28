# Changelog

Todas as entradas referem-se ao estado consolidado da linha **0.1.x** (abril 2026), alinhado a `docs/ROADMAP.md` e a `docs/ARCHITECTURE.md`.

## [0.1.0] - 2026-04-26

### Added

- **Importador idempotente por hash de input:** `npm run db:import:output` calcula SHA-256 de `output/dados_produtos.json` + `output/dados_lojas.json` (ou marcador se o ficheiro de lojas não existir), persiste em `ScrapeRun.input_hash` e **ignora** uma segunda importação do mesmo conteúdo (sem novos snapshots nem `RawPayload`).
- **CI:** workflow GitHub Actions (`.github/workflows/ci.yml`) — `npm test` em cada push e pull request, Node 20, `npm ci` quando existe `package-lock.json`.
- **Coleta em duas categorias:** `scripts/scrape-both.mjs` e comando `npm run coleta` (grelha + consolidação).
- **Consolidação multi-categoria** para `output/dados_produtos.json` e `output/dados_lojas.json` (`scripts/consolidate-category-outputs.mjs`), mantendo o mesmo schema por item.
- **Comandos de coleta:** `coleta:completa` (duas categorias + galeria PDP + consolidação), `coleta:uma:completa` (uma categoria com PDP); documentados em `FLUXO.md`.
- **Galeria opcional no PDP** (`PDP_GALLERY` / `fotos_pdp`), com validação manual documentada no ROADMAP.
- **Módulo de preço v1** no scraper: `tem_desconto`, `preco_estimado_vitrine` (experimental), regras com e sem desconto; suíte de regressão alargada.
- **Módulo de vendas v1:** `mergeProductById` passa a preservar o **máximo** de `sales_count` entre colisões e a coalescer `vendas_texto` / `sales_display` de forma a não apagar texto útil; testes *mergeProductById — vendas*.
- **Regras Cursor** (`.cursor/rules/`) e documentação de contexto para desenvolvimento assistido.
- **Governança do repositório:** `engines.node >= 20` em `package.json`, `.gitignore` alargado (outputs, debug, logs, env), `README` com requisitos e aviso de uso, **ADR** 0001 (modelo híbrido produto/loja) e 0002 (preço e vendas v1).
- **JSON Schema** dos outputs (`schemas/dados_*.schema.json`, draft 2020-12) e script **`validate:schemas`** (AJV) para validar `output/dados_produtos.json` e `output/dados_lojas.json` localmente, sem alterar o formato dos ficheiros gerados.

### Changed

- **Documentação operacional** (`FLUXO.md`, `README.md`, `docs/CHECKLIST-VALIDACAO-OUTPUT.md`) alinhada ao fluxo de coleta e validação de output.
- **ROADMAP** como fonte única de tarefas; apontador `ROADMAP.md` na raiz para ferramentas que esperam ficheiro na raiz.

### Fixed

- **Preço com desconto** e alinhamento de `preco` / `preco_original` / campos de vitrine, conforme validação v1.
- **Merge de vendas:** preservação do maior `sales_count` e de texto de vendas quando a linha “rica” trazia `null`.
- **Escrita em `output/extra/`** (incl. amostras de debug): criação do diretório auxiliar antes de escrever, evitando falhas em ambiente Windows quando a pasta ainda não existia.

### Documentation

- Contrato de **preço** e **vendas** em `docs/ARCHITECTURE.md`; visão e tarefas em `docs/ROADMAP.md`.
- `docs/adr/README.md` (formato ADR) e ADRs 0001–0002.
- `docs/ANALISE-PROJETO-CURSOR.md` (análise do repositório no contexto Cursor).

### Notes

- **Preço v1** validado manualmente em **duas** categorias (com e sem desconto); pequenas diferenças de **centavos** vs UI são aceitáveis.
- **Vendas v1** aprovada com **ressalva:** feed/merge ≠ leitura pixel-perfect da UI; adequado a ranking e análise, **não** a uso financeiro ou legal “exacto”.
- **`fotos_pdp`:** validado no output real; heurística extra de limpeza de URLs adiada por risco de falsos positivos.
- **Modelo híbrido JSON:** `dados_produtos` (flat com loja desnormalizada) + `dados_lojas` (agregado por `seller_id`); normalização plena fica para Postgres (futuro).
