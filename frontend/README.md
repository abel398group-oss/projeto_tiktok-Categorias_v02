# Frontend — visualização Analytics API

Interface mínima em **Vite + React** para listar os relatórios da API read-only.

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

## Erro ao carregar: `ECONNREFUSED 127.0.0.1:3333` (terminal do Vite)

Significa que **a API analytics não está a correr**. Em **outro terminal**, na raiz do repositório: `npm run analytics:api` (com `.env` válido na raiz). Só depois use `npm run dev` no `frontend/` e atualize no browser.

Se mudares a porta da API (`ANALYTICS_API_PORT`), ajusta o `target` em `frontend/vite.config.js` ou usa `VITE_API_URL` (com CORS na API — não incluso por defeito).
