# Frontend — visualização Analytics API

Interface mínima em **Vite + React** para listar os relatórios da Analytics API (**GET**) e usar o **POST** de export ao Space no Product Score (**servidor com `SPACES_*`** configurado).

## Pré-requisitos

1. API a correr (`npm run analytics:api` na raiz do repositório principal), por defeito **`http://127.0.0.1:3333`**.
2. Chave: o mesmo valor que **`ANALYTICS_API_KEY`** da API (ficheiro `.env` desta pasta ou variável de ambiente).

## Como rodar

```bash
cd frontend
npm install
npm run dev
```

Abrir o URL que o Vite mostrar (normalmente `http://localhost:5173`).

## Ligação à API

Por defeito **`api.js`** usa **`API_URL` vazio** → o browser pede a `http://localhost:5173/analytics/...` e o **proxy** em `vite.config.js` envia o pedido para **`127.0.0.1:3333`** (evita CORS sem alterar o Fastify).

Se definires `VITE_API_URL=http://127.0.0.1:3333`, o `fetch` vai directo à API (só funciona se activares CORS no servidor — **não está** no projecto actual).

Copiar `.env.example` → `.env` e ajustar `VITE_ANALYTICS_API_KEY`.

## Ecrã

Cinco separadores — **Top Products**, **Opportunities**, **Product Score**, **Escalar**, **Mapa** (endpoints `/analytics/top-products`, `…/opportunities`, `…/product-score`, `…/scalable-products`, `…/category-map`). Botão **Carregar dados** para fazer o pedido ao endpoint da aba activa.

**Página por produto:** `/produto/<productId TikTok>` (liga no nome na tabela Product Score **ou no botão Página** na coluna «Ações»). Chama **GET** `/analytics/product-workspace/:productId`; **histórico** das páginas abertas aparece no painel (`recentWorkspace.js`, só neste browser).

## Erro ao carregar: `ECONNREFUSED 127.0.0.1:3333` (terminal do Vite)

Significa que **a API analytics não está a correr**. Em **outro terminal**, na raiz do repositório: `npm run analytics:api` (com `.env` válido na raiz). Só depois use `npm run dev` no `frontend/` e atualize no browser.

Se mudares a porta da API (`ANALYTICS_API_PORT`), ajusta o `target` em `frontend/vite.config.js` ou usa `VITE_API_URL` (com CORS na API — não incluso por defeito).

## Erro ao exportar: `Route POST /analytics/export-product-to-spaces not found`

Isso vem **do Fastify** quando esse processo foi arrancado com código **antes** da rota POST existir. **O servidor não recarrega** sozinho ao gravar `server.mjs` se usaste só `npm run analytics:api` à mão.

- **Solução imediata:** na raiz, termina e volta a iniciar a API (**Ctrl+C** no terminal da API → `npm run analytics:api` ou `npm run dev:all`).
- **`npm run dev:all`** usa `api:dev` com **`node --watch`**, que **reinicia a API** ao guardar alterações em `scripts/analytics/server.mjs` (e imports directos como o core do export).

Confirma com **curl** (substitui a chave) que o POST existe depois do reinício:

```bash
curl -s -o /dev/stderr -w "%{http_code}" -X POST \
  -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"productId":"0"}' \
  http://127.0.0.1:3333/analytics/export-product-to-spaces
```

Esperado: **503** ou **404** `{ not_found … }` (produto fictício), mas **não** a mensagem de rota não encontrada.
