# ADR 0003: Worker local + import remoto via API

- **Data:** 2026-05-09  
- **Status:** Aceite  

## Contexto

O Puppeteer no **datacenter** (DigitalOcean / EasyPanel) pode ser bloqueado pelo TikTok (**`TIKTOK_SECURITY_CHECK`**). O mesmo scraper em **IP residencial** costuma funcionar melhor. A stack de produto (API, frontend, Postgres) deve permanecer no servidor.

## Decisão

1. Extrair o núcleo de importação JSON → Prisma para **`scripts/lib/import-output-core.mjs`** (`importOutputFromStrings`, `computeInputHash`, `resolveImportRunType`).
2. Manter **`scripts/import-output-to-db.mjs`** como CLI fino que lê `output/dados_*.json` e chama o núcleo.
3. Adicionar **`POST /scrape/import-remote`** na Fastify analytics, com a mesma **`ANALYTICS_API_KEY`** que os outros endpoints protegidos, corpo JSON com textos dos ficheiros (preferencialmente `dados_produtos_text` / `dados_lojas_text` para preservar `input_hash`).
4. Adicionar **`npm run scraper:worker`**: corre `src/scrapeCategory.mjs` localmente e envia o resultado à API remota.

## Consequências

- **Sem alteração** ao schema Prisma nem ao frontend.
- **`POST /scrape/run`** e afins **mantêm-se** (compatibilidade até validação completa do worker).
- Payloads grandes: limite de corpo configurável (`IMPORT_REMOTE_BODY_LIMIT_BYTES`); reverso-proxy deve permitir o mesmo tamanho.
- Documentação humana: **`docs/LOCAL_SCRAPER_WORKER.md`**.
