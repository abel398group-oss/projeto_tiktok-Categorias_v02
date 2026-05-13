# Frontend — visualização Analytics API

Interface em **Vite + React** com **AppShell** (navegação superior), listagem dos relatórios da Analytics API (**GET**).

## Pré-requisitos

1. API a correr (`npm run analytics:api` na raiz do repositório principal), por defeito **`http://127.0.0.1:3333`**.
2. Chave: o mesmo valor que **`ANALYTICS_API_KEY`** da API (ficheiro `.env` na raiz ou variável de ambiente).

## Como rodar

```bash
cd frontend
npm install
npm run dev
```

(`npm install` só é necessário na primeira vez ou após mudanças em dependências.)

Abrir o URL que o Vite mostrar (normalmente `http://localhost:5173`).

## Navegação e rotas

A barra superior (**AppShell**) liga as áreas principais:

| Rota | Descrição |
|------|-----------|
| **`/`** | **Painel inicial — Categorias**: cartões (`GET /analytics/categories`), cartão inteiro navega para **`/categoria/:slug`**. Atalho «Analytics global» leva a **`/analytics`**. |
| **`/analytics`** | **Analytics global** — separadores Top Products, Opportunities, Product Score, Escalar, Mapa. Cada separador **pede o GET respectivo ao abrir ou ao mudar de aba** (ver `analyticsDashboardCache.jsx`). **Carregar dados** **actualiza** o separador activo (refresh explícito). |
| **`/categoria/:slug`** | Mesmos relatórios com query **`categoryUrl`** na API (resolvida via `location.state` ou lista de categorias). Carregamento automático por separador, como em `/analytics`. |
| **`/a-mao`** | **Produtos em análise** — histórico local (`recentWorkspace.js`) + métricas via **GET** `product-workspace`. Não depende de pré-carregar relatórios. |
| **`/produto/:productId`** | **Workspace** do produto (detalhes, notas, ZIP de imagens). Chama **GET** `/analytics/product-workspace/:productId`. |

Endpoints dos relatórios: `/analytics/top-products`, `…/opportunities`, `…/product-score`, `…/scalable-products`, `…/category-map`.

## Como aceder à workspace do produto

- Nas tabelas onde o **nome** é link (ex.: Product Score, Top Products com `productId`), o clique abre `/produto/<productId TikTok>`.
- O acesso à workspace é pelo nome (ou navegando directamente pela URL `/produto/...`).

## Ligação à API

Por defeito **`api.js`** usa **`API_URL` vazio** → o browser pede a `http://localhost:5173/analytics/...` e o **proxy** em `vite.config.js` envia o pedido para **`127.0.0.1:3333`** (evita CORS sem alterar o Fastify).

Se definires `VITE_API_URL=http://127.0.0.1:3333`, o `fetch` vai directo à API.

Copiar `.env.example` → `.env` e ajustar `VITE_ANALYTICS_API_KEY`.

## Erro ao carregar: `ECONNREFUSED 127.0.0.1:3333` (terminal do Vite)

Significa que **a API analytics não está a correr**. Em **outro terminal**, na raiz do repositório: `npm run analytics:api` (com `.env` válido na raiz). Só depois use `npm run dev` no `frontend/` e atualize no browser.
