# projeto_tiktok-Categorias_v02

Scraper de categorias do TikTok Shop (Node.js, Puppeteer) com saída em `output/dados_produtos.json` e `output/dados_lojas.json`.

- Fluxo e comandos: [`FLUXO.md`](FLUXO.md)
- Tarefas e visão: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Arquitetura e contrato JSON: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## Requisitos

- Node.js >= 20
- npm

## CI / Testes automáticos

O GitHub Actions executa npm test em push e pull request.  
Merge só deve ocorrer com testes a verde.  
Protege módulos críticos: preço, vendas, merge e loja.

A validação de **schema** dos JSON de saída (`npm run validate:schemas`) é **local** — não corre no CI, para não falhar quando `output/` não existe no clone (ex.: GitHub Actions). No futuro pode integrar-se com ficheiros de fixture.

## Validação de schema dos outputs

Valida `output/dados_produtos.json` e `output/dados_lojas.json` contra `schemas/dados_produtos.schema.json` e `schemas/dados_lojas.schema.json` (AJV). Protege o **contrato** de tipos e chaves definidos; campos extra no JSON **não** são rejeitados.

```bash
npm run validate:schemas
```

Correr **depois** de uma coleta que tenha gerado os dois ficheiros na raiz de `output/`, por exemplo após `npm run coleta` ou `npm run coleta:completa`.

## Importar coleta para o Postgres (Prisma)

Com `DATABASE_URL` válida no `.env` (ver `.env.example`), importa a **última** coleta de `output/dados_produtos.json` (e `dados_lojas.json` se existir) para a base:

```bash
npm run db:import:output
```

- **Idempotência:** o comando calcula um **SHA-256** do texto completo desses ficheiros (produtos + lojas, com marcador se `dados_lojas.json` não existir) e grava em `ScrapeRun.input_hash`. Se correres **duas vezes** com o **mesmo** conteúdo consolidado, a segunda vez **não** cria novo `ScrapeRun`, snapshots nem `RawPayload` — apenas mostra que a importação foi ignorada (código de saída 0).
- **Product** e **Seller**: *upsert* por `product_id` / `seller_id` (identidade estável).
- **ProductSnapshot** e **SellerSnapshot**: **sempre novas linhas** por importação (histórico por run); nada é sobrescrito no passado.
- **RawPayload**: um registo `consolidated_output` com envelope JSON (auditoria / dados frios).

Não altera o scraper nem recalcula preço ou vendas — apenas persiste o que está no JSON.

Para **validar** que os snapshots da base batem com o JSON actual (mesmo `input_hash` que no import):

```bash
npm run validate:db-vs-json
```

**Atalhos (coleta + banco de seguida):** com `DATABASE_URL` configurada, podes usar `npm run coleta:db` (duas categorias, grelha + consolidado + import), `npm run coleta:completa:db` (com PDP + import), `npm run coleta:completa:login:db`, `npm run coleta:uma:db` ou `npm run coleta:uma:completa:db` (uma categoria). Detalhe em [`FLUXO.md`](FLUXO.md).

### Prisma Studio (consultar dados no Postgres)

Com `DATABASE_URL` no `.env` (copiar de `.env.example`):

```bash
npm run prisma:studio
```

Abre o **browser** numa página local (normalmente **`http://localhost:5555`**) onde podes navegar pelas tabelas (`Product`, `Seller`, `ScrapeRun`, snapshots, etc.). O terminal fica com o servidor ativo até fechares (**Ctrl+C**).

Outros atalhos úteis: `npm run prisma:generate` (gerar cliente após mudar `prisma/schema.prisma`), `npm run prisma:format` (formatar o schema).

## Desenvolvimento

```bash
npm install
npm test
```

Correr a coleta: ver [`FLUXO.md`](FLUXO.md).

## Aviso

Este projeto realiza coleta de dados públicos.  
Respeite os termos de uso das plataformas.  
Uso por conta e risco.

## Tag de release (v0.1.0)

Depois de rever e commitar as alterações pretendidas:

```bash
git tag v0.1.0
git push origin v0.1.0
```
