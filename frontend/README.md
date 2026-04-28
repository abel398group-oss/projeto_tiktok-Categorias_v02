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

Três separadores: **Top Products**, **Opportunities**, **Product Score**. Botão **Carregar dados** para fazer o pedido ao endpoint da aba actual.
