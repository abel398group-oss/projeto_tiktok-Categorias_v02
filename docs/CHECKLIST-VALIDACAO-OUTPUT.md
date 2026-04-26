# Validação — output

Ticar: `- [ ]` → `- [x]`

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
- [x] `preco` (ver Notas)
- [x] `preco_original` (ver Notas)
- [x] `preco_estimado_vitrine` (ver Notas)
- [x] `preco_gap_estimado` (ver Notas)
- [x] `preco_gap_estimado_percent` (ver Notas)
- [x] `moeda` (ver Notas)
- [x] `seller_id`
- [x] `nome_loja`
- [x] `fotos` (ver Notas)
- [x] `fotos_pdp` (ver Notas)
- [x] `vendas` (ver Notas)
- [x] `vendas_texto` (ver Notas)
- [x] `avaliacao_media`
- [x] `avaliacoes_total` (ver Notas)
- [x] `votos_por_estrela` (ver Notas)
- [x] `global_seller_id` (ver Notas)
- [x] `loja_vendas_total` (ver Notas)
- [x] `loja_produtos_ativos` (ver Notas)
- [x] `loja_reviews_total` (ver Notas)
- [x] `loja_seguidores` (ver Notas)
- [x] `loja_videos` (ver Notas)
- [x] `loja_enable_follow` (ver Notas)
- [x] `loja_logo_uri` (ver Notas)
- [x] `loja_logo_urls` (ver Notas)

## dados_lojas.json

- [x] JSON ok
- [x] `coletado_em`
- [x] `total`
- [x] `lojas[]`
- [x] (por loja) `seller_id`
- [x] (por loja) `global_seller_id` (ver Notas)
- [x] (por loja) `nome_loja`
- [x] (por loja) `loja_vendas_total` (ver Notas)
- [x] (por loja) `loja_produtos_ativos` (ver Notas)
- [x] (por loja) `loja_reviews_total` (ver Notas)
- [x] (por loja) `loja_seguidores` (ver Notas)
- [x] (por loja) `loja_videos` (ver Notas)
- [x] (por loja) `loja_enable_follow` (ver Notas)
- [x] (por loja) `loja_logo_uri`
- [x] (por loja) `loja_logo_urls`

## Notas

**Preço (revisar depois da avaliação):** nesses campos, os itens com mais vendas / mais “vendidos” tiveram **mais divergências** em relação à vitrine; o resto ficou em grande parte alinhado. Ajustes de lógica de preço e refinamento ficam **para depois** de fecharmos a avaliação. **Síntese:** em geral o resultado é **bom**; ainda precisamos de **algumas melhorias** nos preços nos casos mais problemáticos.

**Fotos da grelha (`fotos`):** de tudo o que analisámos, **2 produtos** saíram com **apenas 1** URL de foto; nos **outros** o array tem **mais** links, como esperado.

**Fotos PDP (`fotos_pdp`):** no output atual **não vem nada** (ou vazio) — o fluxo **ainda não recolhe** a página de produto; campo reservado para **uso futuro** quando houver coleta PDP.

**`vendas`:** há **muita variação** face ao que o site mostra; fica em **observação** para rever parser / fonte e alinhar regras depois.

**`vendas_texto`:** neste run saiu **tudo `null`**. No código, o propósito é guardar o **texto original** vindo do feed (ex. string de `sold_info`), enquanto `vendas` é o **número** já interpretado; não é redundante *por definição*, mas se continuar sempre vazio convém perceber se a API deixou de expor a string. Fica em **observação**.

**Avaliações:** `avaliacao_media` **ok**. `avaliacoes_total` com **divergências** face ao site (observação, alinhar depois). `votos_por_estrela` veio **null** — ainda a decidir se faz sentido para o projeto.

**`global_seller_id`:** **null** no run; avaliar **se usamos** e **para quê** existe no modelo (observação).

**Métricas de loja embutidas no produto** (`loja_vendas_total`, `loja_produtos_ativos`, `loja_reviews_total`, `loja_seguidores`, `loja_videos`, `loja_enable_follow`): neste output estão **todas null** — ver se há **dados na API** para preencher e se o produto precisa destes campos ou se basta `dados_lojas.json` (observação).

**Logo da loja (`loja_logo_uri`, `loja_logo_urls`):** `uri` ainda **não está claro** o uso; aparece **em todos**. `loja_logo_urls` também **em todos**; num caso pareceu **foto de produto** e **não ficou provado** que é logo da loja — **validar com o tempo**; **a princípio não usar** para decisões rápidas.

**`dados_lojas.json` (validação):** estrutura e metadados ok. Por loja: **`seller_id` ok**, **`nome_loja` ok**, **`loja_logo_uri` ok**, **`loja_logo_urls` ok** (ex.: path + URL https). O que ainda vem **`null`** (`global_seller_id`, vendas totais, produtos ativos, reviews, seguidores, vídeos, `enable_follow`) fica **para ver se / como capturar** noutro passo; ainda **não** está a ser preenchido por este run.

```
data:
url:
problemas:
```
