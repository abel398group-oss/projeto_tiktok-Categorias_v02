# ROADMAP — fonte única de tarefas

Este ficheiro é a **única** fonte de tarefas objetivas do projeto. Não usar `PLANO_*.md`, `CHECKLIST_*.md`, `TODO_*.md` ou backlogs paralelos na raiz (análises técnicas podem existir em `docs/`, mas **as tarefas resultantes** ficam aqui).

**Repositório:** [abel398group-oss/projeto_tiktok-Categorias_v02](https://github.com/abel398group-oss/projeto_tiktok-Categorias_v02)

Detalhe de arquitetura: `docs/ARCHITECTURE.md`. Decisões formais: `docs/adr/`.

**Radar de ideias (parking list, sem compromisso até virar `- [ ]` aqui):** `docs/RADAR-IDEIAS.md`

**Módulo de preço v1 (abril 2026):** validado manualmente (produtos com e sem desconto, duas categorias) e protegido por testes. **Não** alterar lógica de preço, `normalizeItem` ou campos de desconto na exportação **sem** nova issue/tarefa explícita; qualquer toque nesses trechos: correr `npm test`. Ver `docs/ARCHITECTURE.md` (contrato de preço) e `.cursor/rules/scrape-mjs-patterns.mdc`.

**Módulo de vendas v1 (abril 2026):** após ajuste no `mergeProductById` (máximo `sales_count` entre colisões), **validado manualmente**; **aprovado com ressalva controlada** (feed ≠ pixel-perfect com UI; ver contrato de vendas). **Não** alterar extração/merge de vendas sem tarefa explícita e `npm test`. Ver `docs/ARCHITECTURE.md` (contrato de vendas) e `.cursor/rules/scrape-mjs-patterns.mdc`.

---

## Metodologia (alinhada ao fluxo Cursor / Uleder)

| Marcação | Significado |
|----------|-------------|
| `- [ ]` | Não iniciada |
| `- [~]` | Parcialmente executada (nota do que falta) |
| `- [!]` | Finalizada com pendências (nota) |
| `- [x]` | Finalizada |

**Ao concluir uma tarefa:** marcar `[x]` aqui; se houver **decisão arquitetural** duradoura, registar **ADR** em `docs/adr/` (ver `docs/adr/README.md`). Não deixar checklists temporários versionados fora deste ficheiro.

---

## CI e qualidade (repositório)

**v1 actual (no repo):**

- [x] **CI (GitHub Actions):** push e PR — `npm test` **e** `npm run validate:schemas:ci` (fixtures em `test/fixtures/schema-ci/`) — ver `.github/workflows/ci.yml` e `README.md`.
- [x] **Configuração Local:** Postgres Docker local (`db:docker:up` + `db:docker:wait`) e API + Vite em paralelo; ver `FLUXO.md`.
- [x] **Importador JSON → Postgres v1** (`npm run db:import:output` → `scripts/import-output-to-db.mjs`); identidade com upsert, histórico em snapshots, envelope bruto em `RawPayload`
- [x] **Proteção contra reimportação duplicada** — `inputHash` (SHA-256 do input consolidado) em `ScrapeRun`; segunda importação do mesmo payload não duplica snapshots
- [x] **Metadados de origem:** `run_type` em `ScrapeRun` (opcional na BD com default `"unknown"`; import padrão grava **`quick_scrape`**; opcional `IMPORT_RUN_TYPE=pdp_enrich` no mesmo importador) — não altera hash nem relatórios
- [x] **Analytics v1** (CLI read-only, `scripts/analytics/`): `analytics:top-products`, `analytics:new-products`, `analytics:growth`, `analytics:opportunities`, `analytics:product-score` — ver `docs/ANALYTICS.md`
- [x] **API analytics HTTP read-only (v1):** Fastify (`npm run analytics:api`), `scripts/analytics/server.mjs`; auth com `ANALYTICS_API_KEY`
- [x] **Carregamento `.env`:** `scripts/load-root-env.mjs` mantém só `.env` na raiz — evita regressão em que um `.env.local` sobrescrevia variáveis com vazio; nota em `FLUXO.md`.
- [x] **Operação local — um comando:** `npm run dev:all` sobe Postgres Docker local e API + Vite em paralelo; **`npm run dev:app`** só API + Vite.
- [x] **Scrape manual pelo painel:** `POST /scrape/run` + botão **Scrapear** por cartão no dashboard inicial (`CategoriesPage.jsx`, URL da categoria do card); mutex simples na API (409 se ocupado)
- [x] **Cartões «Categorias» — run mostrado:** `pickLatestRunMeta` em `scripts/analytics/lib/categories-catalog.mjs` em empate de `collected_at` passou a preferir `created_at` do `ScrapeRun` (evita cartão preso a contagens/horas de um import antigo quando há vários runs com o mesmo instante de coleta)
- [x] **Painel operacional — cartões Categorias (`/`):** `GET /analytics/categories` + UI com estado da coleta, hash do import, novos/actualiz. aprox., cobertura multi-cat., aviso de URLs misturadas.
- [x] **Painel — aba «Em Ascensão» (Growth):** GET `/analytics/growth` com `?categoryUrl=` quando filtrado; tabela só leitura do payload API — `frontend/src/analyticsDashboardCache.jsx`, `frontend/src/App.jsx`; filtro de categoria alinhado à API em `scripts/analytics/lib/growth.mjs`
- [x] **Painel — filtros tipo Excel nos cabeçalhos (▾):** nas abas Opportunities, Top Products, Product Score, Mapa de categorias e Escalar (`frontend/src/App.jsx`; componente `ExcelSortTh`).
- [x] **Opportunities — modos de análise (`mode`):** classic, vendas baixas (`low_sales`), sem vendas (`no_sales`), abaixo da mediana por categoria (`below_median`); API `GET ?mode=` e chips no painel; ver `scripts/analytics/lib/opportunities.mjs` e docs.
- [x] **Painel — Creator Presets:** atalhos só no `frontend` (aba + `mode` Opportunities + filtro Ticket partilhado); sem novos endpoints — `frontend/src/App.jsx`, `frontend/src/analyticsDashboardCache.jsx`, `frontend/src/ticketLabel.js`
- [x] **Painel — Pipeline creator no workspace:** estados locais (`descoberto` … `descartado`), migração de valores legados (`exportado`→`conteudo_produzido`, `testar`→`em_teste`), UI no `ProductWorkspacePage.jsx`; `HandsOnPage` e chave `productStatus` mantidos — `frontend/src/productStatusStorage.js`
- [x] **Painel — Shortlist / favoritos:** `frontend/src/productShortlistStorage.js`, botão no workspace, rota **`/shortlist`** (`ShortlistPage.jsx`, nav em `AppShell.jsx`) — só `localStorage`, sem API.
- [x] **Painel — Hub `/a-mao`:** abas Recentes / Por estágio / Shortlist (resumo), prévia de notas locais, `HandsOnPage.jsx` — só frontend.
- [x] **Grelha categoria:** cliques opcionais (default ligado) em **View more** / **Ver mais** após o scroll (`VIEW_MORE_MAX_CLICKS`, `VIEW_MORE`, `VIEW_MORE_DRAIN_MS` em `src/scrapeCategory.mjs`; ver `docs/ARCHITECTURE.md`) — sem alterar merge, XHR nem `normalizeItem`.

**Futuro — evoluções (não bloqueadores da v1):**

- [ ] **Score** versionado / persistido (tabela ou materialização) e ajuste de pesos por categoria
- [ ] Motor de **viabilidade** (custos fornecedor vs preço mercado)
- [ ] Integração **n8n / WhatsApp** via API (sem acesso SQL directo ao Postgres)

### Vídeo sem o produto — trava aplicada (30/08/2026)

Saiu um vídeo de 11,6 s feito **só** com as duas filmagens do Pexels — um
homem a ler um tablet — com locução a falar de um anel de prata cravejado. O
produto anunciado não aparecia em nenhum fotograma, e o link levava a ele.

A regra já estava escrita, em comentário, no próprio `1_Produtos.py`: vídeo de
TikTok Shop com produto vinculado TEM de mostrar o produto anunciado, senão o
espectador pensa que o item do link é outro. Faltava alguém a aplicá-la — as
três validações existentes deixaram passar:

| validação | veredicto | porquê falhou |
|---|---|---|
| "tem material?" | passou | dois ficheiros na lista |
| "tem movimento?" | passou, e **elogiou** | os clipes do Pexels são `.mp4`, logo "sai da categoria slideshow" |
| linha de créditos | **acertou** | escreveu "Vídeos: Pexels" sozinho — sabia que não havia catálogo, mas só descrevia |

Causa a montante: o produto escolhido (anel, `1733666427145323987`) nunca foi
enriquecido — tem 1 imagem, a miniatura. A triagem descartou-a e sobraram só
as aberturas.

Corrigido em `product_video.material_mostra_o_produto`, aplicado nos dois
sítios: o gerador recusa, e a UI desliga o botão antes de gastar os minutos.
Fotos de clientes das avaliações contam como produto; só a abertura não conta.
Testado em `test/services/test_product_video_guard.py` (9 testes) com os
caminhos exactos da task que falhou.

### Custo do render — MoviePy vs ffmpeg (30/08/2026)

Medido na mesma máquina, mesmo material (4 fotos → vídeo vertical 1080×1920
com zoom lento + narração):

| motor | tempo | resultado |
|---|---|---|
| MoneyPrinterTurbo (MoviePy) | **32 min** | 18,43 s |
| ffmpeg directo (`zoompan` + `concat`) | **29 s** | 19,3 s |

~66×. A causa é o MoviePy montar cada fotograma em Python; nenhum ajuste de
encoder resolve isso. O que dava para corrigir sem tocar na arquitectura foi
feito: `write_videofile` passou a receber `preset` e `threads` (usava o preset
"medium" do x264 num só fio).

Efeito colateral já sentido: a ponte desistia aos 30 min e escrevia
"0 vídeo(s)" — o render acabou 3 minutos depois. Timeout subiu para 90 min e a
mensagem passou a dizer que o render continua do lado do gerador.

**Sobre trocar de repositório:** procurado, e nenhum dos candidatos encaixa
melhor. Todos os geradores de vídeo curto (incluindo o MoneyPrinterTurbo)
assumem o oposto deste caso — que não há material e é preciso gerar ou buscar
imagem, roteiro e voz. Aqui as fotos já existem, os factos já estão medidos e
o roteiro é escrito a partir deles. O que sobra do MoneyPrinterTurbo que vale
mesmo a pena é o TTS (`edge-tts`), que é um pacote autónomo. A recomendação é
um renderizador ffmpeg próprio, não outro repositório — decisão do PO.

### Ponte de vídeo (30/08/2026) — roteiro e candidatos

**O roteiro da narração** (`scripts/lib/roteiro-video.mjs`, testado):

O gerador dimensiona o vídeo pela duração do ÁUDIO (`video.py`,
`_get_required_video_duration` = áudio + margem) e repete o material com
`itertools.cycle` quando ele não chega. Ou seja, os dois erros possíveis são
simétricos: roteiro curto de mais desperdiça fotos convertidas (~3 min cada),
roteiro longo de mais faz as mesmas fotos repetirem no vídeo.

Medido em 30/08/2026 com o roteiro novo: **áudio de 18,43 s**, que a 5 s por
clipe consome exactamente 4 fotos. Por isso `--fotos` desceu de 6 para 4. Os
dois números andam a par — se o roteiro mudar de tamanho, este tem de mudar
junto — e há um teste que falha se o roteiro voltar a encolher.

O que o roteiro **não** diz, por decisão:

- **Preço.** O vídeo é gerado hoje e publicado depois; preço muda. Dizer
  "36 reais" quando já são 45 é anúncio enganoso — mesma família do problema
  que a regra "o vídeo mostra o produto do link" existe para evitar. O TikTok
  Shop mostra o preço actual no cartão; repetir na narração é risco sem ganho.
- **Qualquer afirmação sobre o produto.** Não sabemos se é bom nem para quem
  serve. Sai só o que está medido: nome, vendas, nota com o número de
  avaliações que a sustenta.

Vendas são arredondadas **para baixo** e ditas como "mais de": o contador só
sobe, por isso a frase continua verdade daqui a um mês. A nota só entra com
>= 5 avaliações — 5,0 apoiado em duas pessoas não é nota, é anedota.

**Os candidatos passaram a vir da base** (`/analytics/enriched-products`):

`output/dados_produtos.json` é o consolidado da última coleta e é reescrito a
cada corrida. O enriquecimento (a visita à PDP que traz a galeria) é caro e
acontece uma vez — logo, um produto enriquecido na semana passada desaparece
do ficheiro assim que corre uma coleta que não o inclua, com as fotos todas
guardadas na base.

Medido em 30/08/2026: **8 produtos enriquecidos, 7 com galeria boa, 0 no
ficheiro.** A ponte dizia "0 produtos prontos" com material para sete vídeos.
Como só produto com galeria dá vídeo, a lista de enriquecidos já É o universo
de candidatos — não há nada a filtrar de 6.000 para 40. O ficheiro continua
a servir para duas coisas em que é a fonte certa: o histórico de
`video_gerado` e a dica de "o que enriquecer a seguir" (os campeões de venda
de hoje).

Isto é a mesma lição da galeria na UI, no mesmo mês: **o banco lembra, o
ficheiro esquece — quando discordam, ganha o banco.**

**Achado à parte:** `npm test` corria uma lista fixa de 10 ficheiros; havia 16
na pasta. Cinco suites (21 testes) estavam a ser ignoradas em silêncio — todas
passavam, foram só esquecidas ao serem criadas. Passou a `node --test
"test/*.test.mjs"`, que descobre a pasta inteira.

Suíte: 118 → 152. A conta: 118 a correr antes, +21 das suites órfãs religadas,
+13 escritos hoje (roteiro e candidatos).

### Auditoria do `product-seeker` (23/08/2026) — o que entrou e o que ficou

Leitura completa do repo irmão (`lib/`, `db/`, front e docs) cruzada com o nosso
código. Já tínhamos portado dali: Parâmetros, sinais aditivos, higiene
estatística (`category-stats`), busca federada, `ui.jsx`, orquestrador por
processo curto + `doctor`.

**Feito nesta rodada (Fase 0 — parar dano em curso):**

- [x] **Disjuntor de captcha** no orquestrador: captcha **não gasta tentativa**
      da categoria (é bloqueio de sessão, não defeito dela) e N seguidos param a
      corrida. Medido: 75 captchas numa noite, 7 categorias seguidas queimadas
      entre 02:44 e 04:23 sem o ritmo mudar — `scripts/scrape-all-categories.mjs`
- [x] **Saída de terminal legível**: cabeçalho com posição no catálogo, ritmo e
      ETA; blob de JSON por categoria movido para `SCRAPE_VERBOSE=1`
- [x] **`no_sales` rotulado**: campo `vendasMedidas` por item + `medicao` no
      relatório separam "vendeu zero" de "não medimos" (antes iam os dois como
      `0` na tela). Comportamento do modo mantido — incluir `null` é decisão
      antiga travada em teste, e faz sentido no TikTok, que só mostra
      "+N vendidos" acima de um limiar — `lib/opportunities.mjs`
- [x] **Cobertura visível**: `GET /analytics/coverage` + aviso no Ranking quando
      a coleta que o gerou cobriu pouco do catálogo — `lib/coverage.mjs`

      *Nota honesta:* a suspeita que motivou isto estava **errada**. O `55/212`
      do painel é o checkpoint da passagem incremental em curso, não o estado da
      base: medido em 23/08/2026, o último `ScrapeRun` cobre **199/212 (94%)**
      com 20 343 snapshots, e a base tem 95% das subcategorias. O aviso ficou
      porque a métrica passa a ser vigiada, mas hoje **não dispara** — não havia
      o problema que eu supus. O que sobrou de real: **10 subcategorias nunca
      entraram na base**, e nenhum produto delas pode aparecer em relatório.

      A métrica olha a cobertura **do run que o relatório lê**, não a largura
      histórica: os dois podem divergir muito, e mostrar o número da base ao
      lado de um ranking tirado de uma fatia tranquilizaria com o número errado.

**A fazer (por ordem de valor):**

- [x] **Profundidade: «a lista acabou» vs «nós parámos».** `clickViewMoreWhileNeeded`
      passa a devolver o motivo do fim, que vai para o bloco `paginacao` do
      ficheiro da categoria e daí para o `rendimento` do checkpoint. `exaustiva`
      só é `true` quando o TikTok deixou de oferecer (botão sumiu, ou clicar já
      não trazia nada); `teto_de_cliques` significa que a categoria **tem mais**
      e o corte foi nosso. Sem isto, 110 produtos de uma categoria de 110 e 110
      de uma de 900 entravam na base com a mesma cara — e a mediana da segunda
      descreve o topo da lista, não a categoria. O terminal passa a dizer
      «lista esgotada» ou «CORTADA no teto de N clique(s) — tem mais».
      *Ficou no checkpoint, não no `ScrapeRun`: o run é por import (todas as
      categorias), e isto é por categoria.*
- [x] **`npm run db:inventario`**: linhas × disco × quem escreve × quem lê, por
      tabela (adaptado a Prisma: grepar `prisma.<modelo>.`). Primeira execução
      mediu 886 MB de base com **350 MB (40%) em duas tabelas sem leitor**.
- [x] **`RawPayload` decidido — podar, manter os 5 mais recentes.** O propósito
      (reprocessar sem recoletar) só precisa do passado recente. `RAW_PAYLOADS_MANTER`
      controla; poda corre no fim de cada import e falha em silêncio sem derrubar
      o import (o dado que importa já foi gravado). Executado: 60 → 5 linhas,
      235,3 → 34,8 MB, base 886 → 694 MB.
      *Nota:* `DELETE` no Postgres não devolve espaço ao SO — foi preciso
      `VACUUM FULL` (0,7 s aqui). A poda automática impede o crescimento; o
      ficheiro só encolhe com VACUUM FULL manual.
- [x] **`SellerSnapshot` decidido — manter.** Sem leitor hoje, mas é série
      histórica: barata de guardar, impossível de refazer depois, e o ROADMAP já
      prevê consumidor para métricas de loja. A decisão está escrita no `PAPEL`
      do inventário para não se rediscutir do zero na próxima execução.
- [x] **Score devolve confiança**: `confianca` / `confiancaPct` / `faltando[]`.
      O número do score não mudou — decidir quanto vale um campo ausente é
      decisão de negócio. Medido: 20.107 completa, 233 parcial, 3 fraca.
- [x] ~~**Sinal monotónico para "em ascensão"**~~ — **medido, não se aplica.**
      A recomendação assumia que o contador pode descer (no ML o estoque desce
      porque o vendedor repõe). Medido na janela de 43,1 h que o relatório usa:
      **`salesCount` desceu 0 vezes em 18.005 pares.** O nosso sinal já é
      cumulativo. (`ratingTotal` desceu 1 vez em 18.005 — avaliação removida;
      irrelevante nesta escala.)
- [x] ~~**Encolhimento para amostra pequena**~~ — **medido, faria mal.**
      Dos 116 produtos com o rótulo «em ascensão» (≥10 vendas/dia), só **6 têm
      menos de 100 vendas totais** — e esses 6 são ascensão legítima, não ruído:
      ex. «Pins Religioso», 22 vendas totais com delta 18, ou seja saiu de 4 em
      43 h. Encolher apagaria sinal correcto. Além disso o `TableGrowth` já
      mostra `vendas ant.` e `vendas atual` ao lado do `%` (o `n` já viaja
      junto) e **não tem ordenação por coluna**, por isso base pequena não
      consegue flutuar para o topo pela percentagem.
- [x] **Verificado: `salesCount` não vem em faixas.** A suspeita era que o
      TikTok arredondasse ("+1.000 vendidos") e que `delta 0` escondesse venda
      real em produto grande. Medido: 1.344 valores distintos entre 1.659
      produtos na faixa 1.000–9.999, com valores exactos e consecutivos (1000,
      1001, 1002…). `delta 0` significa mesmo "não vendeu" — o rótulo «parado»
      é honesto.
- [x] **`/analytics/categories` 2,5× mais rápido** — era o pedido mais lento do
      painel (17,9 s com o banco livre) e o que deixava a página de categoria em
      "A resolver categoria…". O `DISTINCT ON (p.id)` obrigava a ordenar o join
      inteiro (757 mil snapshots), com *external merge* de 76 MB por worker.
      Trocado por ordenar os **runs** (72 linhas) e agregar `MIN(posição)` por
      produto. Medido: 17,9 → 7,3 s livre; 25 → 16 s sob carga de import.
      Resultado idêntico, verificado por hash das 44.603 linhas.
- [x] **Índice `(product_ref_id, scrape_run_id)`** — a agregação virou
      *index-only scan*: consulta 7,3 → 2,4 s, endpoint 13-14 → 6,2-8,0 s.
      Somando com a reescrita: **17,9 → 2,4 s na camada de banco (7,5×)**.
      O que sobra do endpoint é processamento em JS das 44.875 linhas, não SQL.
- [x] **Tripwire de subida** — a API recusa subir fora de `127.0.0.1` sem
      `ANALYTICS_API_ALLOW_REMOTE=1` **e** chave de 24+ caracteres. Motivo: não
      há utilizadores nem permissões, só uma chave, e há rotas que escrevem
      (ocultar produto, disparar coleta, importar). "Roda só local" era promessa
      — bastava alguém pôr `0.0.0.0` num teste e esquecer. Os três caminhos
      testados à mão: local sobe, remoto sem autorização recusa, remoto com
      chave curta recusa, remoto autorizado sobe com aviso.

**Encontrado ao verificar o gerador de vídeo (29/08/2026):**

- [x] **Galeria enriquecida deixava de aparecer na coleta seguinte.** O
      workspace lia só o snapshot mais recente; como a coleta de categoria não
      traz galeria, cada coleta nova escondia o enriquecimento anterior. Dos 8
      produtos com `enrichStatus=ok`, **cinco** estavam invisíveis — 62% de um
      trabalho que abre o navegador no TikTok e arrisca captcha. Agora cai para
      o snapshot mais recente que tenha galeria, com a data a viajar junto.
- [x] **`send-to-money.mjs` passa a ler a galeria da base**, via
      `/analytics/product-workspace`, em vez do JSON da última coleta. Só os
      melhores candidatos são consultados (um pedido cada), em ordem de vendas.
      No caminho apanhou-se um segundo defeito: o script não carregava o `.env`,
      ia à API sem chave, levava 401 e concluía "0 produtos prontos" — resposta
      indistinguível de "não há produto com galeria".
- [x] **Pipeline de vídeo verificado de ponta a ponta (29/08/2026).**
      1080×1920, 12,4 s, narração pt-BR e legenda, entregue em
      `I:\Meu Drive\tik tok\nutrition-wellness__pro3magnesio-….mp4`. O bug do
      WEBP está morto: as fotos foram baixadas em `.jpg` e converteram em clipe.
      A verificação expôs mais um defeito — a ponte gerava o vídeo e parava aí,
      deixando-o em `storage/tasks/<uuid>/` com nome opaco e fora do Drive;
      agora copia com nome legível e escreve o `.txt` com o link ao lado.

- [ ] **Roteiro da ponte é fixo e curto — 4 das 6 fotos são desperdiçadas.**
      O gerador dimensiona o vídeo pela duração do ÁUDIO: com uma frase (~9 s) e
      clipes de 5 s, entram ~2 fotos. As outras são baixadas, convertidas em
      clipe (~2 min cada) e descartadas. Ou o roteiro cresce para usar as 6
      (~30 s), ou baixa-se menos foto. **É decisão editorial** — mais vídeo
      significa mais texto de venda — por isso fica para o dono decidir.
- [ ] **Cartão de categoria mostra o total global como se fosse da categoria.**
      Cada cartão repete "20.658 coletado no total" e "20.543 fora desta
      categoria / dedupe". É verdade, mas lê-se como se cada categoria tivesse
      processado 20 mil produtos.

**Decidido NÃO fazer, com motivo:**

- **Motor de viabilidade / importação** — prematuro. O caso de uso actual é
  afiliado (promove produto de terceiro e ganha comissão): a economia tem três
  variáveis, não quinze. Sem FOB, frete internacional, peso taxável, modal nem
  fator tributário. Reabrir se passar a vender produto próprio; o
  `product-seeker` tem a máquina inteira pronta para copiar nesse dia.
- **`score_final` composto como dado primário** — o autor do `product-seeker`
  considerou e **rejeitou** por escrito: *"uma nota de 87 não diz se veio de
  margem alta ou de concorrência baixa, e as duas pedem decisões diferentes."*
  Substituto: eixos como colunas de primeira classe e `score_final` só como
  ordenação conveniente, com cortes tirados da mediana do próprio conjunto.
  **Isto contradiz o item "score modular por eixo" da Visão estratégica — a
  decisão fica em aberto para o negócio.**
- **Sazonalidade** — exige ≥24 meses de série (2 ciclos anuais). Temos dias.
- **Dividir o repo** (front e motor em pacotes separados) — eles pagaram esse
  preço por multi-tenant e SSO, que não temos; hoje já são três lugares com a
  mesma fórmula. Um repo com API + painel é o certo para dono único local.
- **Duplicar fórmula em SQL/views** — prática abandonada lá com autópsia
  (`migracao-012`): a cópia divergiu em três pontos e ninguém consultava.

**Futuro — qualidade / infra:**

- [ ] **Smoke test** de scraper real (navegador, rede) em CI ou job manual — separado da regressão pura; custo, flakiness e credenciais a definir.
- [ ] **CI com lint / typecheck** se o projeto adoptar ferramentas (ESLint, TypeScript, etc.) noutro passo.
- [ ] Hash / dedupe **por categoria ou run** granular, se o fluxo evoluir (hoje é por ficheiro consolidado completo)
- [ ] Dados frios pesados: `storagePath` (object storage) em vez de JSONB só

---

## Visão estratégica do produto

O repositório **não** é apenas um scraper: a visão é uma **plataforma de inteligência de produtos** para e-commerce e marketplaces — coletar dados, analisar potencial de venda, calcular viabilidade (incl. importação) e expor análise e decisão a utilizadores com **front com login** (vendedores, fornecedores, operação interna e contas próprias no ecossistema TikTok Creator/loja).

**Fase inicial da coleta:** TikTok Shop como **primeira** fonte. **Futuro:** Mercado Livre, Shopee e outros; arquitetura a preparar `source_platform` e IDs externos para comparar o mesmo *tipo* de sinal entre plataformas (ex.: oportunidade no TikTok → validar preço e concorrência no ML/Shopee).

### 1. Pipeline geral (alvo)

Coleta de dados → tratamento → **banco histórico** → análise → **score de oportunidade** → **front / dashboard** → decisão comercial (e feedback para operação).

### 2. Fontes de dados

| Fase | Fontes |
|------|--------|
| **Inicial** | TikTok Shop (scraper actual) |
| **Futuro** | Mercado Livre, Shopee, outros marketplaces (conectores a definir) |

### 3. Objetivo da análise

Gerar insumos para identificar, entre outros:

- produtos **vendáveis** e **escaláveis**;
- potencial de **viralização** (com limitações de dados e snapshot);
- **lojas / sellers** relevantes;
- **tendências de preço** (requer histórico no tempo);
- produtos com **bom volume** de venda;
- **oportunidades** para compra / importação (combina sinais de mercado com módulo de viabilidade).

### 4. Módulo de score de produto (futuro)

**Estado actual:** existe heurística **v1 só leitura** em CLI (`npm run analytics:product-score` — não persistida; ver `docs/ANALYTICS.md`).  

Módulo analítico **alvo** (não no scraper; dimensões persistíveis / pesos de negócio) com separação por eixo, por exemplo:

- `demanda_score` · `preco_score` · `crescimento_score` · `avaliacao_score` · `concorrencia_score` · `margem_score` → **`score_final`** (regras e pesos a definir com o negócio).

### 5. Módulo de viabilidade comercial / importação (futuro)

Onde fornecedor ou operador **informa** (fora do feed bruto do marketplace), entre outros:

- preço de compra, moeda, frete internacional, impostos, taxas de marketplace, custo logístico nacional, **margem desejada**.

**Resultados pretendidos (conceituais):** custo total estimado, preço mínimo viável, margem líquida, lucro unitário, classificação de viabilidade (ex.: **aprovado** / **atenção** / **inviável**).

### 6. Tipos de utilizadores futuros

- admin interno · utilizador vendedor · fornecedor · analista/operador · contas **próprias** da operação (TikTok / loja).

### 7. Front / dashboard

**Actual (v1):** existe painel em `frontend/` (Vite/React) ligado à API analytics em desenvolvimento — ver `FLUXO.md` e `README.md`; **sem** fluxo de login multi-utilizador ainda.

**Alvo futuro:** login · dashboards adicionais · **ranking** de produtos · ficha de produto · ficha de loja/seller · gráficos avançados (vendas, preço, avaliações) · **simulador de viabilidade** · área do fornecedor.

### 8. Estratégia multi-marketplace

A arquitetura de dados e análise deve suportar:

- `source_platform` · `product_external_id` · `seller_external_id` · **snapshots por marketplace** e, quando fizer sentido, **comparação entre plataformas** (mesma oportunidade validada noutro canal).

### 9. Decisão actual (repositório scrape TikTok; abril 2026)

- O scraper TikTok **continua a ser estabilizado**; não alterar pipeline sem necessidade.  
- **Mantido** o **modelo JSON híbrido** na raiz de `output/` (`dados_produtos` + `dados_lojas`, após consolidação multi-categoria quando aplicável) como **fonte de coleta** e input do importador.  
- **`dados_lojas.json`** em uso.  
- **Postgres / Prisma:** esquema em `prisma/schema.prisma`; **importador JSON → base** (`npm run db:import:output`), **analytics v1** em CLI só leitura (`scripts/analytics/`, ver `docs/ANALYTICS.md`), **API analytics** Fastify e **painel** em `frontend/` **já fazem parte do repositório** (detalhes no `README.md` / `FLUXO.md`).  
- **Não** priorizar, neste momento, **enriquecimento pesado via PDP** (ex.: `shop_info` rico no HTML do PDP) por **risco** de puzzle / anti‑bot e custo de visitas.  
- **Próximos macros** (sem ordem fixa; alinhado à secção **Futuro** em CI e qualidade): score **persistido** / versionado e motor de **viabilidade**; fortalecer **painel/API** (auth, features); **expandir categorias** de coleta; smoke opcional do browser em CI, dados frios em **object storage** quando fizer sentido.

### 10. Regras de proteção (desenvolvimento)

- Não **quebrar** o scraper actual sem testes e justificação.  
- Manter branch **`stable/scraper-funcionando`** como referência / backup.  
- Trabalhar em **`feature/*`**.  
- Correr **`npm test`** antes de merge em alterações de parser/merge.  
- Não alterar **preço**, **dedupe** ou regras de **seller/loja** sem **testes** actualizados.  
- **Vendas (v1):** não alterar `normalizeItem` (extração de vendas), `parseSalesText`, `coalesceMaxSalesCount`, `coalesceSalesDisplayFromMerge`, nem a parte de vendas de `mergeProductById` / `toDadosProdutoClean` — ver secção *Módulo de vendas* e regras Cursor; **merge** (linha rica) continua a valer para preço/imagem, com **máximo** de vendas preservado.  
- **Preço (v1):** como já documentado; não reabrir sem critério.

---

## `fotos_pdp` — validação (abril 2026)

- [x] **`fotos_pdp` → OK (validado manualmente no output real).** Não abrir, por agora, a heurística extra de “limpeza” por URL (risco de falsos positivos/negativos); o scraper já filtra a grelha de miniaturas no DOM e deduplica por pathname/asset.

**Nota:** O `dados_produtos.json` (e corridas reais) está **consistente** no que toca a `fotos_pdp` no estado actual. Se no futuro aparecer **ruído** recorrente (logos, badges, promos) nas URLs, reavaliar: filtro pós-URL (ex. `filterPdpProductImages`) + testes de regressão.

**Ordem de prioridade actual:** (1) validação feita, (2) **não alterar** a pipeline de `fotos_pdp` por enquanto; (3) evoluções de produto seguem **Tarefas** e **Futuro** (secção CI e qualidade) neste mesmo ficheiro.

---

## Módulo de preço (v1) — concluído (abril 2026)

Validação manual: produtos **com** e **sem** desconto em **duas** categorias; pequenas diferenças de centavos vs UI aceitáveis; o módulo de preço no scraper passa a ser considerado **estável** nesta versão.

- [x] Normalização de preço **sem** desconto (campos de desconto a `null`, `tem_desconto: false` onde aplicável).
- [x] Normalização de preço **com** desconto (`preco`, `preco_original`, estimativas e gaps alinhados à regra actual).
- [x] Campo **`tem_desconto`**.
- [x] **`preco_estimado_vitrine`** (experimental) — validado no output real.
- [x] Consolidação **multi-categoria** em `output/dados_*.json` **mantendo o mesmo schema** por item (ver `scripts/consolidate-category-outputs.mjs`).

**Decisão (duradoura):** o módulo de preço **v1** está **validado manualmente** e **protegido por** `test/scrape-regression.test.mjs`. Não alterar `normalizeItem`, cálculo de preço, `tem_desconto` ou `toDadosProdutoClean` nesses campos **sem** nova issue/tarefa explícita e regressão a verde.

## Futuro — sinais e confiança de preço (não implementar agora)

- [ ] Score de **confiança** de preço.
- [ ] `price_source` (ou equivalente) **interno** para auditoria.
- [ ] Validação reforçada com amostra **PDP** (futuro; não exige implementação agora).

---

## Módulo de vendas (v1) — melhorado, validado, aprovado com ressalva (abril 2026)

- [x] **Vendas v1 melhorada:** o `mergeProductById` preserva o **maior** `sales_count` observado entre fontes do mesmo `product_id` (ver `coalesceMaxSalesCount` e `coalesceSalesDisplayFromMerge` no código).
- [x] **Validação manual** após o ajuste: muitos produtos alinham com a UI; pequenas diferenças aceitáveis (atualização em tempo real, arredondamento).
- [x] **Aprovado com ressalva controlada:** ainda é possível divergência (métrica **feed parcial / SKU** vs agregado mostrado na **UI**); isso **não** anula a aprovação de v1, mas define expectativa de consumo.
- [x] **Regressão** em `test/scrape-regression.test.mjs` (suite *mergeProductById — vendas*) a cobrir o contrato de máximo e texto.

**Decisão (duradoura):** o campo exportado **`vendas`** = **melhor esforço** a partir do feed, **consolidado** com o máximo no merge. **Não** é garantia absoluta de equivalência com o número exibido na UI; **não** utilizar `vendas` como métrica financeira “exacta” ou legal; **pode** utilizar-se para **ranking**, **tendência**, **filtro** e análise comercial. Ver `docs/ARCHITECTURE.md` (contrato de vendas).

## Futuro — sinais e confiança de **vendas** (não implementar agora)

- [ ] `vendas_confianca` (ou score análogo).
- [ ] `sales_source` / `sales_source_debug` (auditoria de fonte).
- [ ] Captura ou parse reforçado de **texto** de vendas (ex. formatos estilo `2,9K` / `1.2k`).
- [ ] Validação com **PDP** ou **endpoint** dedicado, se o negócio exigir alinhamento fino com a UI.

---

## Loja vs produto — decisão: modelo híbrido (JSON)

- **Estado:** o scraper gera **dois** outputs complementares, descritos em **`docs/ARCHITECTURE.md`** (secções *Contrato dos outputs* e *Modelo Postgres (Prisma)*).
- **`dados_produtos.json`:** export plano/flat com **produto + `seller_id` + `nome_loja` + campos `loja_*` / logos** em cada item — **desnormalização intencional** (inspeção, análise rápida, sem `join` forçado). **Não** substitui o modelo relacional na base (é contrato do scraper e input do import).
- **`output/dados_lojas.json`:** agregado **oficial** — **uma** loja **por** `seller_id` (análise de vendedor; import da dimensão **`sellers`** em Postgres via `npm run db:import:output`).
- **Ligação:** `seller_id` em comum.
- **Decisão:** **não** remover campos de loja de `dados_produtos` nesta fase; **não** mudar o formato de `dados_lojas` para “forçar” normalização no JSON exportado. A **normalização canónica** em Postgres (`products` / `sellers` / snapshots) **já existe** via importador; os JSON continuam a ser a **saída da coleta** e o payload importado sem recalcular merge/preço/vendas no import.
- [x] **Contrato dos outputs documentado** em `docs/ARCHITECTURE.md` (e apontador no `FLUXO.md` onde existir).
- [ ] (Opcional, fase posterior) **Separação estrita** só de campos de loja no `dados_produtos` — requer decisão, consumidores e testes.
- [ ] (Opcional) Importador / consumidores a usarem `dados_lojas` para métricas por vendedor de forma explícita.

---

## Próximas fases (ordem recomendada, alto nível)

**Já entregues no repositório (contexto):** esquema **Postgres/Prisma**, **importador** JSON → base, **analytics v1** em CLI sobre snapshots, **API analytics** Fastify, **painel** Vite/React, **CI** com `npm test` + **validação de schema com fixtures**, **JSON Schema** + validação local sobre `output/` — ver secção **CI e qualidade** acima.

1. **Manter o scraper estável** (regressão `npm test`; CI em push/PR com `validate:schemas:ci`).  
2. **Validar outputs** reais (`dados_produtos`, `dados_lojas`, debug se necessário) e `npm run validate:schemas` / `validate:db-vs-json` quando aplicável.  
3. **Contrato dos JSONs** — manter `docs/ARCHITECTURE.md` e `schemas/` alinhados quando o pipeline exportado mudar.  
4. **Testar** mais categorias reais; validar variação de dados e edge cases.  
5. **Evoluir analytics e score** — heurística persistida / versionada, pesos por categoria; ver itens **Futuro — evoluções** na secção CI (viabilidade, integrações).  
6. **Otimizar velocidade** da coleta e do import quando houver medição (paralelismo, batch, rate limit — **após** critérios de negócio e sem quebrar idempotência).  
7. Evoluir **painel / API** (login, relatórios adicionais, hardening) conforme prioridade — v1 já no repositório; ver secção **CI e qualidade** e **Front / dashboard** acima.

Não implica prazos: é **sequência orientadora**; itens 4–7 podem avançar em paralelo onde fizer sentido.

---

## Tarefas

- [ ] Deduplicar por `product_id` no mapa e/ou excluir nós com `review_id` para limpar `dados_produtos.json`.
- [ ] Tratar conflito “grelha rica” vs “review pobre” (priorizar `product_price_info`).
- [ ] (Opcional) Testes unitários mínimos para `normalizeItem` / `parseDiscountPercentFromPpi` com JSON de exemplo.
- [ ] (Opcional) `ROUTER_PEEK_LEN=0` por defeito em “produção” local para reduzir PII em `modern_router_peek.json`.

---

## Documentos de análise

Investigações ou notas longas podem viver em `docs/` (ex. `docs/analise-*.md`), desde que as **ações** derivadas sejam copiadas para a secção **Tarefas** acima.
