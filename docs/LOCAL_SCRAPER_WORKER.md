# Worker local do scraper (Puppeteer fora do datacenter)

## Porquê separar

O TikTok Shop pode responder com **`failure_code: TIKTOK_SECURITY_CHECK`** quando o browser corre em **IP de datacenter** (ex.: DigitalOcean / EasyPanel). Em **localhost** ou **IP residencial**, o mesmo scraper costuma passar — o bloqueio é sobretudo **reputação de rede**, não “falha genérica da infra na DO”.

**Decisão operacional:** manter **API + frontend + Postgres** no servidor; correr **`src/scrapeCategory.mjs` (Puppeteer)** num **PC local** ou servidor físico com IP mais “comum”, e **enviar os JSON** já gerados para a API remota importar na mesma base.

- O fluxo antigo (`POST /scrape/run`, `POST /scrape/run-both`, `POST /analytics/import-output`) **mantém-se**; nada foi removido.
- O **núcleo de importação** é partilhado: `scripts/lib/import-output-core.mjs` — usado pelo CLI `npm run db:import:output` e por **`POST /scrape/import-remote`**.

## Pré-requisitos

1. **Clone do repo** no PC onde corre o worker (mesma versão de código ajuda a alinhar contratos JSON).
2. **`npm install`** na raiz (Puppeteer + dependências).
3. No **servidor**, API acessível com HTTPS (ou HTTP em teste) e **`ANALYTICS_API_KEY`** igual à do PC.
4. **`DATABASE_URL`** só é necessária no **servidor** da API, **não** no PC do worker para o envio remoto (o worker não fala com Postgres directamente).

## Variáveis de ambiente (PC do worker)

No `.env` **local** (ou export na shell):

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| **`REMOTE_API_URL`** | Sim | Base da API **sem** barra final, ex.: `https://api.teudominio.com` ou `http://127.0.0.1:3333`. O worker chama `POST {REMOTE_API_URL}/scrape/import-remote`. |
| **`ANALYTICS_API_KEY`** | Sim | Mesmo valor que no servidor (`Authorization` / `x-api-key` na API). |
| **`SCRAPER_MODE`** | Não | Informativo (ex.: `local-worker`); vai em `raw_payload_extra.worker`. |
| **`CATEGORY_URL`** | Não | URL da categoria TikTok (igual ao scrape manual). |
| **`OUTPUT_DIR`** | Não | Pasta de saída (defeito `output`); mesma regra que `src/scrapeCategory.mjs` (relativa ao repo ou absoluta). |
| **`IMPORT_RUN_TYPE`** | Não | `quick_scrape` \| `pdp_enrich` \| `unknown` — gravado em `ScrapeRun.run_type` (igual ao CLI). |
| **`WORKER_SKIP_SCRAPE`** | Não | Se `1`, **não** corre Puppeteer; só lê `dados_*.json` já existentes e faz POST (útil para reenviar ou testar import). |

O PC **não** precisa de `DATABASE_URL` para o modo worker remoto.

## Comando

```bash
npm run scraper:worker
```

Equivale a:

```bash
node --import ./scripts/load-root-env.mjs scripts/scraper-local-worker.mjs
```

Fluxo:

1. (Se `WORKER_SKIP_SCRAPE≠1`) `node src/scrapeCategory.mjs` com o teu `env`.
2. Lê `OUTPUT_DIR/dados_produtos.json` e, se existir, `dados_lojas.json`, como **strings UTF-8** (para o **`input_hash`** coincidir com `npm run db:import:output` no mesmo conteúdo).
3. `POST /scrape/import-remote` com JSON; a API grava na BD com a mesma lógica que o importador CLI.

## Testar uma categoria

1. No servidor: `docker compose up -d` (ou stack habitual) com API exposta e `ANALYTICS_API_KEY` definida.
2. No PC: `.env` com `REMOTE_API_URL` + `ANALYTICS_API_KEY` + `CATEGORY_URL=https://shop.tiktok.com/br/c/...`
3. Opcional login visível: `HEADED=1 npm run scraper:worker`
4. Ver resposta JSON no terminal (`ok`, `skipped`, `detail.scrapeRunId`).
5. No painel ou Prisma Studio: confirmar novo `ScrapeRun`.

**Idempotência:** o mesmo par de ficheiros gera o mesmo `input_hash`; a segunda chamada devolve **`skipped: true`** (não duplica snapshots).

## Corpo do `POST /scrape/import-remote` (referência)

Preferido (hash alinhado ao CLI):

```json
{
  "dados_produtos_text": "<conteúdo exacto do ficheiro dados_produtos.json>",
  "dados_lojas_text": "<conteúdo exacto de dados_lojas.json>",
  "import_run_type": "quick_scrape",
  "raw_payload_extra": { "nota": "opcional — fundido em worker_extra no RawPayload" }
}
```

Alternativa (menos ideal para hash): `dados_produtos` / `dados_lojas` como **object** — o servidor faz `JSON.stringify`; o **`input_hash`** pode **diferir** do obtido a partir dos ficheiros no disco se a ordem de chaves não for a mesma.

## Diagnósticos do scrape

O scraper continua a poder gravar em `OUTPUT_DIR/extra/`, entre outros:

- `final_page.png`, `final_page.html`, `body_text.txt`, `browser_env.json`, `xhr_debug.json`, `empty_harvest_diagnostic.json`

O worker **não envia binários** (PNG) no JSON; envia em `raw_payload_extra.diagnostics_present` um mapa **booleano** por nome de ficheiro, para auditoria leve no `RawPayload`. Os ficheiros ficam no disco do PC até os arquivares.

## Migrar o worker para um “PC servidor” físico

- Instala **Node ≥ 20**, clone, `npm install`, cron ou systemd a correr `npm run scraper:worker` com o mesmo `.env`.
- Garante **rede estável** e relógio correcto; perfil Chrome persistente: `CHROME_USER_DATA` ou pasta por defeito (ver `docs/ARCHITECTURE.md` / `.env.example`).
- Opcional: **Tailscale** entre o PC e a rede do servidor se não quiseres expor a API à Internet (o worker só precisa de HTTPS/HTTP até ao endpoint).

## Voltar ao modo antigo (scrape na DO)

- Continua a usar **`POST /scrape/run`** no painel ou no servidor, ou `npm run coleta:db` dentro do contentor.
- Desliga ou não uses `npm run scraper:worker` no PC.

## Limite de tamanho do POST

A API usa limite de corpo por rota (defeito **100 MiB**). Ajuste no servidor: **`IMPORT_REMOTE_BODY_LIMIT_BYTES`** (máximo 512 MiB). Se usas **Nginx** à frente, confirma também **`client_max_body_size`**.

## Ver também

- `docs/ANALYTICS-API.md` — tabela de endpoints.
- `FLUXO.md` — linha de comandos actualizada.
- ADR `docs/adr/0003-local-scraper-worker-remote-import.md`.
