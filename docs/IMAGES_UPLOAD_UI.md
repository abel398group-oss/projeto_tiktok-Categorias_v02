# Upload de imagens para Spaces (UI local)

## Objetivo

Disponibilizar no painel local (localhost) um botão operacional para executar o upload de imagens para o DigitalOcean Spaces usando **apenas** dados já coletados (`output/dados_produtos.json`).

Este fluxo é propositalmente separado do scraping:

- **Não** executa scraping do TikTok
- **Não** abre navegador / Puppeteer
- **Não** chama `/scrape/run`
- **Não** mexe em `ASSISTED_MODE`

## Como funciona (arquitetura)

- Frontend (Vite/React) chama `POST /analytics/images-upload`.
- API (Fastify) executa `scripts/images-upload.mjs` via `spawn` e aguarda o término.
- A API aplica um mutex (não permite dois uploads simultâneos).
- O script:
  - lê `output/dados_produtos.json`
  - baixa imagens (`fotos` / `fotos_pdp`)
  - valida `Content-Type` imagem e limites (bytes/timeout)
  - faz upload para o Spaces
  - gera `output/dados_produtos_com_storage.json`

## Configuração (`.env` na raiz)

Variáveis obrigatórias:

- `SPACES_ENDPOINT` (ex.: `https://sfo3.digitaloceanspaces.com`)
- `SPACES_REGION` (ex.: `sfo3`)
- `SPACES_BUCKET` (ex.: `hipertms-bucket`)
- `SPACES_ACCESS_KEY_ID`
- `SPACES_SECRET_ACCESS_KEY`
- `SPACES_PUBLIC_BASE_URL` (URL pública/CDN, sem barra final)
- `SPACES_PREFIX=analytics/tiktok/products`

## Uso na UI

- Suba a stack local: `npm run dev:all` (ou `npm run dev:app` se o Postgres já estiver acessível).
- Abra o painel: `http://localhost:5173/`.
- Na página **Categorias**, use o botão:
  - **Exportar imagens para Spaces**

O painel pede confirmação antes de executar.

## Respostas e status

Se o upload estiver em execução e outro pedido for enviado, a API retorna **409 busy**.

O painel mostra:

- estado “Exportando imagens…”
- sucesso/falha
- contagens resumidas quando disponíveis (enviadas/reutilizadas/falhas) e tempo total

## Riscos e cuidados (HiperTMS)

- Use sempre `SPACES_PREFIX=analytics/tiktok/products` para não misturar com outros projetos no bucket `hipertms-bucket`.
- O upload não apaga objetos no bucket.
- Não exponha a API na internet sem TLS e controle de rede.

## Troubleshooting

- Erro 401: chave `VITE_ANALYTICS_API_KEY` no `frontend/.env` não bate com `ANALYTICS_API_KEY` na raiz.
- Erro 502 no upload: ver `stdoutTail`/`stderrTail` retornados pela API e o arquivo gerado `output/dados_produtos_com_storage.json`.
- Se as URLs CDN não abrem: revise `SPACES_PUBLIC_BASE_URL` e as permissões (bucket público vs `SPACES_OBJECTS_PUBLIC_READ=1`).

