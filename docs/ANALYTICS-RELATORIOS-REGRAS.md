# Relatórios Analytics – regras técnicas (programador)

Documento só de **consulta**. Reflete o estado do código nos módulos indicados (leitura Prisma ou agregações em memória). **Sem escrita na base.**

Ver também **`docs/ANALYTICS.md`** (métricas v1 mais detalhadas, sobretodo Product Score) e **`docs/ANALYTICS-API.md`** (HTTP).

---

## Definições comuns

- **Último run:** `ScrapeRun` ordenado por `created_at` descendente (`scripts/analytics/_common.mjs` → `getLatestAndPreviousRun`).
- Os **GET** de relatório são só leitura (`items`/`top`/etc.). O painel também pode invocar **`POST /analytics/export-product-to-spaces`** (gravar produto no DigitalOcean Spaces, sem mudar Postgres) — ver **`docs/ANALYTICS-API.md`** e `scripts/lib/export-product-to-spaces-core.mjs`.

---

## Top Products (`/analytics/top-products`)

| O quê | Ficheiros |
|-------|-----------|
| Fonte | `scripts/analytics/lib/top-products.mjs` → `getTopProductsReport` |

**Regra**

- **Modo global** (sem `categoryUrl`): `ProductSnapshot` do **último** `ScrapeRun` com **`sales_count` não nulo**; **`orderBy: sales_count desc`**; resposta com até **`limit`** linhas (Prisma `take: limit`).
- **Modo categoria** (`categoryUrl`): produtos cuja categoria normaliza ao filtro; por produto escolhe-se o snapshot com `sales_count` não nulo no run de **`collected_at` mais recente**; ordena-se por vendas desc; aplicam-se as primeiras **`limit`** linhas.
- **Parâmetro HTTP `limit`:** inteiro em **[1, 10000]** (`TOP_PRODUCTS_MAX_LIMIT`); **omitido ou inválido → 20** (`TOP_PRODUCTS_DEFAULT_LIMIT`, usado pelo CLI `npm run analytics:top-products`). O painel web pede `limit` maior (ex.: 5000) via `analyticsDashboardCache.jsx`; a meta **`rankingTotal`** / **`truncated`** reflecte se há mais produtos no ranking do que **`items`** nesta resposta.
- **`items[].avaliacao`**: média como **número** ou **`null`** (sem string vazia); `nome` e `loja` sem truncar na API (truncagem só pode ser feita no UI).

**Não há** filtro HTTP por desconto nem por loja; opcionalmente **`categoryUrl`** restringe a produtos dessa categoria (ver modo categoria acima).

---

## Opportunities (`/analytics/opportunities`)

| | |
|--|--|
| Fonte | `scripts/analytics/lib/opportunities.mjs` |

**Filtros comuns** (modo global: último run; modo `categoryUrl`: um snapshot por produto = run de `collected_at` mais recente; depois aplica-se o modo de vendas):

- `price` não nulo  
- `rating_average >= 4.5`  
- `rating_total >= 5`

**Parâmetro `mode`** (`parseOpportunityMode` em código; omitido ⇒ `classic`):

| Modo | Vendas (`sales_count`) |
|------|---------------------------|
| `classic` | `>= 10` e `<= 300` |
| `low_sales` | `>= 1` e `<= 99` |
| `no_sales` | `IS NULL` ou `= 0` |
| `below_median` | `>= 1` e `< mediana` da categoria **mestre** (ver `computeMedianSalesByMasterCategory` — mediana só com valores não nulos no mesmo último run) |

**Ordem servidor:** média descendente → vendas descendente; até **`limit`** linhas na resposta (**defeito 20**, máx. **10000**; omitido ou inválido na query → defeito CLI).

Meta-resposta quando há dados: **`rankingTotal`**, **`listed`**, **`limit`**, **`truncated`**, **`maxRows`**, **`ruleNote`**, **`opportunityMode`**.

O painel web pede `limit` alto (ex.: 5000), `mode` conforme chips na aba Opportunities, via `analyticsDashboardCache.jsx`; ajustável com **`OPPORTUNITIES_UI_FETCH_LIMIT`**.

**Não há** filtro HTTP por desconto nem por loja; opcionalmente **`categoryUrl`** como em Top Products.

## Product Score (`/analytics/product-score`)

| | |
|--|--|
| Fonte | `scripts/analytics/lib/product-score.mjs` |

**Página por produto (React `/produto/:productId`):** **GET** `/analytics/product-workspace/:productId` em `scripts/analytics/lib/product-workspace.mjs` — último ScrapeRun, mesma pontuação `computeProductScoreLine` que o relatório.

**Todos** os snapshots do último run; pontuações 0–100 **em memória** (ver pesos/blocos na tabela de `docs/ANALYTICS.md`). Após ordenar por score descendente expõe **até 30** linhas ao cliente (`TOP_LIMIT`).  
Função exportada também usada pelo mapa como `computeProductScoreLine` (**mesmos pesos**, sem duplicação manual de fórmulas).

Para **Δ vendas**, necessita dois runs comparáveis com `sales_count` nos dois onde aplicável (`previousRun` nas respostas JSON).

---

## Escalar (`/analytics/scalable-products`)

| | |
|--|--|
| Fonte | `scripts/analytics/scalable-products.mjs` |

**Entrada:** `getProductScoreFull(prisma)` — **todas** as linhas pontuadas do último ScrapeRun pela mesma função que o relatório product-score (equivale a **todos os snapshots**, ordenados por score; o relatório geral só **lista as 30 primeiras**, mas Escalar já não fica limitado a esse corte).

**Globais (ignora linha)**

- Sem preço válido (`price` não numérico / `<= 0`)  
- Vendas declaradas **`> 10_000`**  
- Média de rating extraída do texto **`< 4`**

Depois avalia cada item (na ordem: **Validados primeiro**, depois só se não entrar lá **Apostas**):

| Lista | Critérios (após filtros globais) |
|--------|----------------------------------|
| **Validados para escalar** | `300 ≤ vendas ≤ 3000`, média rating `≥ 4.3`, `score ≥ 55` |
| **Apostas com potencial** | `10 ≤ vendas ≤ 300`, média `≥ 4.5`, `≥ 5 aval` no texto parsado do rating, `score ≥ 45` |

Implementação faz parse do string `rating` do score (primeiro número + `\((n) aval`).

---

## Mapa (`/analytics/category-map`)

| | |
|--|--|
| Fonte | `scripts/analytics/category-map.mjs` |

- **Todos** os snapshots do **último** run (+ histórico de vendas anterior para delta no score igual ao Product Score).

**Árvore esperada**

- `Product.categoryUrl` → **`parseCategory`**: antes de despachar, strings com **slashes “com espaços”** típicos de cópias (ex. `shop.tiktok.com / br / c / …`) são **reunidas** num path de URL; breadcrumbs com ` / ` (com espaços) só quando **não** parecem URL; nunca tratar o primeiro segmento `https:` sozinho como mestre; **URLs TikTok Shop** (`…/c/<slug>/<id>`…) → slugs humanizados após `/c/`; o último segmento numérico é o **ID TikTok** da pasta e aparece na etiqueta **`nomeLegível · ID`** (sem query `?…`, sem mostrar o URL completo); com vários slugs, o último nome fica na sub e os anteriores na mestre, separados por ·; demais HTTPS → host + último segmento nomeável no path.

**Por subcategoria**

- Agrupa snaps; **score da sub** = **média arredondada** dos scores `computeProductScoreLine` desses produtos.  
- Totais: soma vendas (numéricas), médias rating/preço onde existem dados, conta `isOpportunityV1` igual ao último valor `pontosOportunidade === 15` no score individual.
- **`topProducts`:** até **`TOP_PRODUCTS_PER_SUB`** (actualmente **5**) por sub, ordenados só por score **desc** no servidor.
- Mastres ordenadas pelo maior score de sub dentro; subs por score descendente.

---

## API & UI

- **Autenticação:** `Authorization: Bearer` ou `x-api-key` — `scripts/analytics/server.mjs` (inclui o POST de export).
- **Product Score (UI):** coluna **Space** com botão **Exportar** por linha (`productId` TikTok) → mesmo host/proxy que os GET; credenciais **Spaces** só no processo da API.
- Comportamento de ordenação **no cliente** (primeiro clique em métricas “desc” onde aplicável) está em **`frontend/src/App.jsx`** (`toggleSort`) e **`frontend/src/sortUtils.js`**; não altera valores servidos pela API.

**Manutenção**

- Ao mudar filtros nestes relatórios, atualizar **este documento**, `docs/ANALYTICS.md` se aplicável, e texto do painel só se mudar comunicação ao utilizador (ver regra **`frontend-analytics-ui`**).
