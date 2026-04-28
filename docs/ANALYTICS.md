# Analytics v1 (Postgres read-only)

Comandos de **consulta apenas** sobre `ProductSnapshot` / `ScrapeRun` / `Product` / `Seller`. **Não** escrevem na base.

**Pré-requisito:** dados importados (`npm run db:import:output`), `DATABASE_URL` no `.env`.

---

## Métricas e definições

### `analytics:top-products`

- **Último run:** `ScrapeRun` com `created_at` mais recente.
- **Ranking:** snapshots desse run com `sales_count` não nulo, ordenados por **desc**, até **20** linhas.
- **Campos mostrados:** `product_id` (TikTok), nome, nome da loja, preço (`price`), vendas (`sales_count`), média de avaliação (`rating_average`), URL do produto.

### `analytics:new-products`

Identifica produtos tratados como **novos relativamente ao último import**:

1. **`first_seen_at`** do `Product` igual a `collected_at` do último `ScrapeRun` (criação nessa coleta).
2. **OU** o snapshot com menor `captured_at` entre todos os snapshots desse produto pertence ao **último** `ScrapeRun` (`MIN(captured_at)` por `product_ref_id`).

Une os dois conjuntos (sem duplicar). Lista dados do snapshot do **último** run quando existir.

### `analytics:growth`

- Considera apenas os **dois últimos** `ScrapeRun` (por `created_at` descendente).
- **Se existe menos de 2 runs:** imprime mensagem informativa e sai com código **0** (sem erro).
- Para cada produto com snapshot nos **dois** runs e `sales_count` **não nulo em ambos:** calcula `delta = vendas_atual − vendas_anterior` e `%` em relação ao valor anterior (`∞` textual se vendas anteriores forem 0 e actuais &gt; 0).
- Ordenação por maior **delta absoluto**. Limite **20**.

### `analytics:opportunities`

Heurística **simples v1** no **último** run apenas:

- `rating_average ≥ 4.5`
- `rating_total ≥ 5`
- `sales_count` entre **10** e **300**
- `price` não nulo

Ordenação: média desc., depois vendas desc. Limite **20**. O campo “motivo” descreve a regra; **não** é garantia comercial nem score oficial.

---

## Campos utilizados na base

| Conceito | Tabela / colunas |
|----------|------------------|
| Vendas por coleta | `product_snapshots.sales_count`, `scraped_run_id` |
| Preço | `product_snapshots.price` |
| Avaliações | `product_snapshots.rating_average`, `rating_total` |
| Identidade | `products.product_id`, `products.name`, `products.product_url` |
| Loja | `sellers.name` (via `products.seller_ref_id`) |
| Ordem temporal dos imports | `scrape_runs.created_at`, `collected_at` |

---

## Limitações

- **Último run** definido por `ScrapeRun.created_at` (instante da gravação do import no Postgres), não por `collected_em` apenas — alinha com operações repetíveis.
- **Vendas e preço** são *melhor esforço* e feed/TikTok; ver **`docs/DATA_POLICY.md`** e **`docs/ARCHITECTURE.md`** antes de comunicar métricas a terceiros.
- **Growth** exige **≥ 2 runs** comparáveis; import idempotente com o mesmo JSON **não** cria novo run.
- **Oportunidades** é uma **regra fixa**, não modelo de ML nem score persistente — ver roadmap para evoluções (score, API, dashboard).

---

## Ver também

- `README.md` — comandos npm
- `docs/ROADMAP.md` — tarefas e evoluções previstas
