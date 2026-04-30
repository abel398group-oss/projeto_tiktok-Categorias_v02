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
| **`/`** | **Analytics** — separadores Top Products, Opportunities, Product Score, Escalar, Mapa; botão **Carregar dados** pede o endpoint da aba activa. |
| **`/a-mao`** | **Produtos em análise** — atalhos e **histórico** de produtos visitados (`recentWorkspace.js`, só neste browser). **Não** exige carregar relatórios da API para ver o histórico. |
| **`/produto/:productId`** | **Workspace** do produto (detalhes, notas, etc.). Chama **GET** `/analytics/product-workspace/:productId`. |

Endpoints dos relatórios: `/analytics/top-products`, `…/opportunities`, `…/product-score`, `…/scalable-products`, `…/category-map`.

### Fluxo usual (Analytics → Spaces → histórico)

1. **`/` Analytics** · abrir o separador **Product Score** · **Carregar dados**.  
2. **Clicar no nome** do produto → abre **`/produto/:productId`** (workspace no browser).  
3. Voltar quando quiser: em **`/a-mao` · Produtos em análise** aparece o histórico local (`recentWorkspace.js`) dos produtos cujo workspace já abriu.  
4. Para **DigitalOcean Spaces**: na mesma tabela **Product Score**, coluna **Ações**, usar **Exportar** (a API faz o upload; credenciais `SPACES_*` só no servidor).

## Como aceder à workspace do produto

- Na tabela **Product Score**, **clique no nome do produto** (coluna **nome**). Esse link abre `/produto/<productId TikTok>`.
- **Já não existe** o botão **«Página»** na coluna **Ações**; o acesso à workspace é **só** pelo nome (ou navegando directamente pela URL `/produto/...`).

## Exportar ao DigitalOcean Spaces

- Na tabela **Product Score** (**Analytics**, depois de carregar dados), o botão **Exportar** está na coluna **Ações** (uma linha por produto).
- Gera/normaliza o pacote **JSON + imagens** do produto e envia para o **DigitalOcean Spaces** via **POST** `/analytics/export-product-to-spaces`.
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
