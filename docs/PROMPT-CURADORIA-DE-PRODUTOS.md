# Curadoria de produtos — instruções do curador

Você recebe um `lote-NN.csv` (gerado por `npm run curadoria -- --exportar`) e
devolve um `resposta-NN.csv`. Cada linha é um produto do TikTok Shop que pode
virar vídeo.

> **Há 80 gerações de vídeo disponíveis.** O que você decidir aqui não é
> cosmética: um produto marcado para gastar crédito consome um dos 80. Um
> rótulo errado vira o nome de um vídeo publicado.

## As duas decisões

**1 · `rotulo_final` — como este produto se chama.**

O `rotulo_sugerido` foi derivado do título por regra, sem ninguém ler. Ele
acerta na maioria e erra de formas previsíveis. O que você escrever aparece
no prompt do vídeo e no nome da pasta.

Escreva o nome que uma pessoa usaria para pedir o produto na loja. Duas a
quatro palavras, minúsculas, sem marca, sem medida, sem promoção.

| situação | o que fazer |
|---|---|
| sugerido já está bom | repita-o em `rotulo_final` |
| sugerido pegou a palavra errada | escreva o nome certo |
| título é isca e não diz o produto | leia o resto do título e escreva o que é |
| nem lendo dá para saber | deixe `rotulo_final` vazio e explique na `nota` |

Casos reais deste lote, para calibrar:

- `preco` ← "（Preço de Liquidação）Camiseta Básica de Caimento Solto"
  → **`camiseta basica caimento solto`**
- `deus` ← "Meu Deus! Kit de 14 bits, super barato!"
  → **`bits parafusadeira`**
- `camiseta simples` ← "MF Camiseta Simples e Versátil de Cor Sólida…"
  → sugerido já bom, repita

**2 · `gastar_credito` — vale um dos 80?**

`sim` · `nao` · **vazio**

Vazio significa **"sem opinião"**, não "não". Se você não olhou, deixe vazio:
o ranking decide. Só escreva `nao` quando há motivo — e escreva o motivo.

Motivos que valem um `nao`:

- **acessório sozinho.** Vídeo de "capa" sem o telemóvel não vende nada.
- **duplicado.** Três variações do mesmo produto: marque uma, recuse as
  outras.
- **fotos ruins.** Se a galeria é só tabela de medidas e banner de texto, o
  gerador não tem material.
- **categoria restrita.** Suplemento, medicamento, produto de saúde: as
  alegações são filtradas de perto e o vídeo dá trabalho a mais.

## Formato da resposta

Devolva um CSV com **exatamente estas colunas, nesta ordem**:

```
product_id,rotulo_sugerido,rotulo_final,gastar_credito,nota
```

- **Copie `product_id` e `rotulo_sugerido` sem alterar.** Eles identificam a
  linha.
- **Sem vírgula dentro de nenhum campo** — o separador é a vírgula. Se
  precisar de pausa, use " - ".
- Não invente linha nova: responda só as que recebeu, todas ou parte.
- Linha totalmente em branco (sem rótulo, sem decisão, sem nota) é ignorada.

Grave como `curadoria/resposta-NN.csv`, com o mesmo NN do lote.

## Exemplo

```
product_id,rotulo_sugerido,rotulo_final,gastar_credito,nota
1733615887698134394,camiseta simples,camiseta basica cor solida,sim,sugerido ja bom
1732868478173021562,preco,top feminino meia gola alta,sim,titulo comecava com o preco
1734741709860930938,preco,camiseta basica caimento solto,nao,duplicado do primeiro
1734393304189208100,capa,,nao,acessorio sozinho - nao vende sem o aparelho
```

## Carga de volta

```bash
npm run curadoria -- --carregar
```

O curado **vence** o derivado e **nunca é sobrescrito** por processo
automático — nem por um re-import, nem por uma coleta nova. Julgamento humano
que a máquina apaga não é curadoria, é rascunho.

Os ficheiros carregados são renomeados para `carregado-resposta-NN.csv`, para
não entrarem duas vezes sem ninguém dar por isso.
