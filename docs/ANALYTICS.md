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

### `analytics:product-score`

Calcula um **score único 0–100** por produto (último snapshot do **último** `ScrapeRun`), **em memória** — **não** grava coluna nem tabela nova. Lista **até 30** linhas por **score** descendente.

#### Pesos (v1)

| Bloco | Máx | Regra (resumo) |
|-------|-----|-----------------|
| Vendas | 35 | `≥1000`→35 · `≥300`→25 · `≥100`→15 · `≥10`→8 · senão 0 |
| Avaliação | 25 | média+total: `4.8/+10`→25 · `4.5/+5`→18 · `4.0/+5`→10 · senão 0 |
| Preço válido | 10 | `price` não nulo e &gt; 0 |
| Desconto | 5 | `has_discount` true |
| Oportunidade controlada | 15 | vendas 10–300, `rating_average ≥ 4.5`, `rating_total ≥ 5`, preço não nulo |
| Crescimento | 10 | Entre **último** e **penúltimo** run: `delta` vendas (actual−anterior) só se **ambos** têm `sales_count` não nulo: `>100`→10 · `>30`→6 · `>0`→3 · senão 0. Menos de 2 runs ou sem par comparável → **0** e motivo textual **“sem base de crescimento”**. |

Soma dos blocos, **cap** a 100.

#### Classificação textual

| Intervalo | Etiqueta |
|-----------|----------|
| 80–100 | excelente |
| 60–79 | bom |
| 40–59 | observar |
| 0–39 | fraco |

#### Motivos (strings)

Reflexo do que contribuiu (ex.: vendas fortes, boa avaliação, preço válido, desconto ativo, faixa de oportunidade controlada, crescimento positivo, ou ausência de base para crescimento).

#### Limitações específicas do score

- **Heurística** inicial; não é modelo de ML, **não** é recomendação de investimento nem receita garantida.
- Depende da **qualidade** dos valores em `ProductSnapshot` (preço/vendas como *melhor esforço*, ver `DATA_POLICY`).
- Sem **≥2 runs** com vendas comparáveis no mesmo produto, o bloco **crescimento** fica 0 e aparece **“sem base de crescimento”** para esse efeito — não quer dizer que o produto seja fraco por si.
- Pode haver máximo teórico &lt; 100 conforme dados nulos (ex.: sem vendas).

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
- **Oportunidades** é uma **regra fixa**, não modelo de ML nem score persistente.
- **`product-score`** é **v1** calculado na hora; alterações de pesos na roadmap (versionar, persistir opcional).

---

## Ver também

- `README.md` — comandos npm
- **`docs/ANALYTICS-API.md`** — servidor HTTP (`npm run analytics:api`) expondo os mesmos relatórios
- `docs/ROADMAP.md` — tarefas e evoluções previstas
