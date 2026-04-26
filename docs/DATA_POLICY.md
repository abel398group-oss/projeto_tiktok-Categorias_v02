# Política de Dados v1

## Objetivo

Definir o nível de confiabilidade dos dados coletados e orientar seu uso correto.

---

## Classificação dos dados

### 🟢 Alta confiabilidade (pode usar diretamente)

Campos:

- product_id
- nome
- link_produto
- seller_id
- nome_loja

Uso:

- identificação única
- relacionamento produto ↔ loja
- base para banco de dados

---

### 🟡 Média confiabilidade (usar com cautela)

Campos:

- preco
- preco_original
- vendas
- avaliacao_media
- avaliacoes_total

Observações:

- pequenas diferenças com a UI são esperadas
- dados podem variar por:
  - atualização em tempo real
  - arredondamento
  - múltiplas fontes (SKU vs agregado)

Uso:

- ranking
- análise comparativa
- filtros de decisão

---

### 🔴 Baixa confiabilidade / experimental

Campos:

- preco_estimado_vitrine
- preco_gap_estimado
- preco_gap_estimado_percent

Observações:

- derivados de cálculo
- não representam valor oficial da plataforma

Uso:

- análise interna
- não usar para decisão financeira direta

---

## Regras importantes

- Não tratar vendas como valor exato
- Não tratar preço como valor financeiro oficial
- Usar dados para tendência, não precisão absoluta
- Priorizar consistência relativa entre produtos

---

## Decisões de projeto

- Preço v1 validado manualmente
- Vendas v1 usa maior sales_count observado no merge
- Modelo híbrido produto/loja adotado
- Dados são adequados para análise e ranking

---

## Futuro (não implementado)

- score de confiança de preço
- score de confiança de vendas
- integração com PDP
- normalização completa no banco de dados

---
