# Frontend — visualização Analytics API

Interface em **Vite + React** com **AppShell** (navegação superior), listagem dos relatórios da Analytics API (**GET**) e **POST** de export ao DigitalOcean Spaces no Product Score (**credenciais `SPACES_*` só no backend** — o browser nunca as recebe).

> **Âmbito desta documentação:** ambiente **local / desenvolvimento**. O frontend **não** deve ser configurado com credenciais do Spaces; o export é tratado pelo servidor quando a API está correctamente configurada.

## Pré-requisitos

1. API a correr (`npm run analytics:api` na raiz do repositório principal), por defeito **`http://127.0.0.1:3333`**.
2. Chave: o mesmo valor que **`ANALYTICS_API_KEY`** da API (ficheiro `.env` desta pasta ou variável de ambiente).

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

### Fluxo usual (Analytics → Spaces → histórico)

1. **`/analytics`** (ou categoria) · o separador activo **carrega sozinho**.  
2. **Clicar no nome** do produto (várias tabelas) → **`/produto/:productId`**.  
3. **`/a-mao`** lista o histórico (inclui produtos adicionados ao **Exportar**).  
4. **Exportar** (coluna Ações): **POST** export Spaces; após o pedido o fluxo vai para **`/a-mao`** e regista o produto no histórico.

## Como aceder à workspace do produto

- Nas tabelas onde o **nome** é link (ex.: Product Score, Top Products com `productId`), o clique abre `/produto/<productId TikTok>`.
- **Já não existe** o botão **«Página»** na coluna **Ações**; o acesso à workspace é **só** pelo nome (ou navegando directamente pela URL `/produto/...`).

## Exportar ao DigitalOcean Spaces

- Nas tabelas Analytics com coluna **Ações** (Top Products, Opportunities, Product Score, Escalar por tabela, Mapa por tabela — ver `App.jsx`), o botão **Exportar** está por linha após carregar dados da aba.
- Gera/normaliza o pacote **JSON + imagens** do produto e envia para o **DigitalOcean Spaces** via **POST** `/analytics/export-product-to-spaces`.
- Depois do pedido (sucesso ou erro de rede/API), o fluxo no painel **regista o produto no histórico** e navega para **`/a-mao`** (Produtos em análise).
- Fluxo válido quando a API responde com sucesso ao export e os ficheiros aparecem no bucket com o prefixo devolvido pela API — o utilizador só confirma no painel Spaces.
- Para funcionar, a **API tem de estar a correr**, a **BD** deve ter dados do último scrape, e no **servidor** têm de estar configuradas **`SPACES_*`** (endpoint, bucket, chaves). O frontend **apenas** dispara o POST com **`Authorization: Bearer`** + **`VITE_ANALYTICS_API_KEY`**; **não** deve receber credenciais Spaces.

## Ligação à API

Por defeito **`api.js`** usa **`API_URL` vazio** → o browser pede a `http://localhost:5173/analytics/...` e o **proxy** em `vite.config.js` envia o pedido para **`127.0.0.1:3333`** (evita CORS sem alterar o Fastify).

Se definires `VITE_API_URL=http://127.0.0.1:3333`, o `fetch` vai directo à API (só funciona se activares CORS no servidor — **não está** no projecto actual).

Copiar `.env.example` → `.env` e ajustar `VITE_ANALYTICS_API_KEY`.

## Erro ao carregar: `ECONNREFUSED 127.0.0.1:3333` (terminal do Vite)

Significa que **a API analytics não está a correr**. Em **outro terminal**, na raiz do repositório: `npm run analytics:api` (com `.env` válido na raiz). Só depois use `npm run dev` no `frontend/` e atualize no browser.

Se mudares a porta da API (`ANALYTICS_API_PORT`), ajusta o `target` em `frontend/vite.config.js` ou usa `VITE_API_URL` (com CORS na API — não incluso por defeito).

## Erro ao exportar: `Route POST /analytics/export-product-to-spaces not found`

Isso vem **do Fastify** quando esse processo foi arrancado com código **antes** da rota POST existir. **O servidor não recarrega** sozinho ao gravar `server.mjs` se arrancaste a API apenas **manualmente** sem `--watch`.

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
