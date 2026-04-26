# Validação — output

Ticar: `- [ ]` → `- [x]`

## Antes de considerar **mudança de preço** aceitável (revisão de código / merge)

- [ ] `npm test` a passar na totalidade.
- [ ] Comparação: produto **sem** desconto no contrato v1 continua com `preco_original` **null** (e `preco_estimado_vitrine` / gaps **null** onde aplicável) e `tem_desconto: false`.
- [ ] Comparação: produto **com** desconto mantém `tem_desconto: true` e coerência `preco` / `preco_original` (regra actual).
- [ ] O campo `preco` **não** é substituído por `preco_estimado_vitrine` (papéis distintos).
- [ ] Campos numéricos de preço permanecem **number** ou **null** (sem strings involuntárias).
- [ ] Ficheiro consolidado `output/dados_produtos.json` (multi-categoria) continua o **mesmo schema** de item (só se aplicar a PRs que toquem consolidação).

## Antes de considerar **mudança em vendas** aceitável (revisão de código / merge)

- [ ] `npm test` a passar na totalidade.
- [ ] O valor final de **`vendas` / `sales_count` não “desce”** se outra resposta com o mesmo `product_id` tinha um **número maior** (preservação do **máximo** entre fontes / colisões).
- [ ] **`sales_count` null** da linha vencedora **não** apaga um **número** válido vindo de outra fonte.
- [ ] **`vendas_texto` / `sales_display`:** texto não vazio **não** é apagado por `null` no merge (regra de coalescência).
- [ ] **Preço e desconto** permanecem **intocados** (regra de preço e `productRowRichness` para a linha “rica” inalterada para fins de venda, salvo tarefa explícita a outro módulo).
- [ ] **Schema** de `dados_produtos.json` (campos e tipos) **inalterado** (sem renomear ou remover chaves de contrato sem ADR/ROADMAP).

## dados_produtos.json

- [x] JSON ok
- [x] `coletado_em`
- [x] `categoria_url`
- [x] `final_url`
- [x] `status`
- [x] `total`
- [x] `filtro`
- [x] `itens[]` bate com `total`
- [x] `product_id`
- [x] `link_produto`
- [x] `nome`
- [x] `preco`
- [x] `preco_original`
- [x] `preco_estimado_vitrine`
- [x] `preco_gap_estimado`
- [x] `preco_gap_estimado_percent`
- [x] `moeda`
- [x] `seller_id`
- [x] `nome_loja`
- [x] `fotos`
- [x] `fotos_pdp`
- [x] `vendas`
- [x] `vendas_texto`
- [x] `avaliacao_media`
- [x] `avaliacoes_total`
- [x] `votos_por_estrela`
- [x] `global_seller_id`
- [x] `loja_vendas_total`
- [x] `loja_produtos_ativos`
- [x] `loja_reviews_total`
- [x] `loja_seguidores`
- [x] `loja_videos`
- [x] `loja_enable_follow`
- [x] `loja_logo_uri`
- [x] `loja_logo_urls`

## dados_lojas.json

- [x] JSON ok
- [x] `coletado_em`
- [x] `total`
- [x] `lojas[]`
- [x] (por loja) `seller_id`
- [x] (por loja) `global_seller_id`
- [x] (por loja) `nome_loja`
- [x] (por loja) `loja_vendas_total`
- [x] (por loja) `loja_produtos_ativos`
- [x] (por loja) `loja_reviews_total`
- [x] (por loja) `loja_seguidores`
- [x] (por loja) `loja_videos`
- [x] (por loja) `loja_enable_follow`
- [x] (por loja) `loja_logo_uri`
- [x] (por loja) `loja_logo_urls`

## Notas

Ressalvas, histórico e observações abertas; a checklist de **dados_produtos** / **dados_lojas** acima fica fechada sem remeter a estas notas em cada linha.

**Preço (v1 validado, abril 2026):** validação **manual** em **duas** categorias (com e sem desconto). **Sem desconto:** `preco_original`, `preco_estimado_vitrine` e gaps a `null`, `tem_desconto: false`. **Com desconto:** `preco` e `preco_original` preenchidos, `preco_estimado_vitrine` próximo da UI, `tem_desconto: true`. Pequenas diferenças de **centavos** são toleráveis. O módulo de preço está **estável**; alterações à lógica exigem issue/tarefa e `npm test` (ver `docs/ARCHITECTURE.md` e `docs/ROADMAP.md`). **Futuro (não feito):** score de confiança, `price_source` interno, validação extra com PDP.

**Preço (histórico / borderline):** nesses campos, em corridas anteriores os itens com muitas vendas tiveram por vezes **mais divergências** — mantém-se em observação para **casos extremos**; não invalida a validação v1 do contrato geral.

**Fotos da grelha (`fotos`):** de tudo o que analisámos, **2 produtos** saíram com **apenas 1** URL de foto; nos **outros** o array tem **mais** links, como esperado.

**Fotos PDP (`fotos_pdp`):** no output atual **não vem nada** (ou vazio) — o fluxo **ainda não recolhe** a página de produto; campo reservado para **uso futuro** quando houver coleta PDP.

**Vendas (v1 aprovada com ressalva, abril 2026):** o merge agora toma o **máximo** de `sales_count` entre colisões do mesmo `product_id`, o que aproximou a UI em muitos casos. **Ainda** podem existir diferenças (métrica parcial/feed vs agregado, SKU, atraso). `vendas` = **melhor esforço**; **não** equivalência certificada com a UI; **não** usar como valor financeiro exato. **Uso:** ranking, tendência, análise. **Futuro (não feito):** `vendas_confianca`, `sales_source`, texto tipo `2,9K`, validação com PDP. Ver `docs/ARCHITECTURE.md` (contrato de vendas).

**`vendas_texto`:** no código, guarda o **texto** original quando o feed o expõe; o export usa `vendas` como número. O merge procura **não** apagar texto útil. Se o run tiver tudo `null`, pode ser a API/feed sem string — observação de produto, não revogação de v1.

**Avaliações:** `avaliacao_media` **ok**. `avaliacoes_total` com **divergências** face ao site (observação, alinhar depois). `votos_por_estrela` veio **null** — ainda a decidir se faz sentido para o projeto.

**`global_seller_id`:** **null** no run; avaliar **se usamos** e **para quê** existe no modelo (observação).

**Métricas de loja embutidas no produto** (`loja_vendas_total`, `loja_produtos_ativos`, `loja_reviews_total`, `loja_seguidores`, `loja_videos`, `loja_enable_follow`): neste output estão **todas null** — ver se há **dados na API** para preencher e se o produto precisa destes campos ou se basta `dados_lojas.json` (observação).

**Logo da loja (`loja_logo_uri`, `loja_logo_urls`):** `uri` ainda **não está claro** o uso; aparece **em todos**. `loja_logo_urls` também **em todos**; num caso pareceu **foto de produto** e **não ficou provado** que é logo da loja — **validar com o tempo**; **a princípio não usar** para decisões rápidas.

**`dados_lojas.json` (validação):** estrutura e metadados ok. Por loja: **`seller_id` ok**, **`nome_loja` ok**, **`loja_logo_uri` ok**, **`loja_logo_urls` ok** (ex.: path + URL https). O que ainda vem **`null`** (`global_seller_id`, vendas totais, produtos ativos, reviews, seguidores, vídeos, `enable_follow`) fica **para ver se / como capturar** noutro passo; ainda **não** está a ser preenchido por este run.

```
data:
url:
problemas::
```
