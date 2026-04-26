# ADR 0001 — Modelo híbrido produto/loja
## Decisão
Manter dados de loja dentro de dados_produtos.json e também consolidados em dados_lojas.json.
## Motivo
Simplicidade de consumo, evitar joins iniciais, performance.
## Consequência
Duplicação de dados no produto; normalização completa ficará para o Postgres.
