# ADR 0002 — Preço e vendas v1
## Decisão
Preço: regra validada manualmente; pequenas diferenças com UI são aceitáveis.
Vendas: preservar o maior sales_count observado no merge.
## Motivo
Feed pode trazer múltiplas fontes (SKU vs agregado).
## Consequência
Valores são aproximados; adequados para ranking, não para uso financeiro exato.
