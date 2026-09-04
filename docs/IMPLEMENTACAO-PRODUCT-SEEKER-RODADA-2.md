# product-seeker → scraper TikTok — rodada 2 (30/08/2026)

**O que mudou desde a rodada 1 (23/08).** O alvo do scraper deixou de ser
alimentar um gerador de vídeo e passou a ser alimentar o **Symphony Creative
Studio** do próprio TikTok: escolher produto por dados, entregar fotos limpas
e um prompt, e não gastar crédito em produto parado. Três factos novos
dimensionam tudo:

1. **A política do TikTok Shop proíbe o que o MoneyPrinterTurbo fazia** —
   slideshow, imagem parada acima de 50% do ecrã, conteúdo sem pessoa. O
   Symphony gera vídeo com movimento e avatar, rotulado como IA, dentro das
   regras de quem as escreve. O Money sai do fluxo.
2. **Há 400 créditos, a 5 por vídeo: 80 gerações.** Escolher deixou de ser
   conveniência e passou a ser o que decide se os créditos rendem.
3. **Hoje o Docker estava em baixo e derrubou tudo** (HTTP 500 no painel,
   ponte a dizer "0 produtos"). O product-seeker tem um documento inteiro
   sobre exatamente isso, e nós não temos nenhum.

Este documento lista o que do product-seeker entra agora, o que já entrou
(não repetir), o que fica recusado (com motivo), e a ordem de construção
com critério de aceite. A rodada 1 está em `ROADMAP.md` → *Auditoria do
product-seeker (23/08/2026)*.

---

## ESTADO — implementado em 04/09/2026

Todas as fases feitas, em 8 commits. O que o plano não previu, e mudou:

| planeado | o que aconteceu |
|---|---|
| A1 sentinela `PARAR` | já existia uma sentinela, mas era **apagada no arranque** — inútil com religamento automático. Passou a persistir e a bloquear o arranque com código 3. |
| B1 colunas em `Category` | **não existe `model Category`** — o catálogo vive no CATALOG do orquestrador. Criei `CategoriaDirecao`, esparsa, chaveada por `slug-id`. |
| C4 veredito nas medianas | ligado, e **duas vezes não disparava**: primeiro apanhava o id numérico em vez do nome; depois, o nome era slug em inglês contra títulos em português. Corrigido pelo CATALOG. |
| E1 excluir imagem de texto | **impossível sem dano.** A tabela de medidas (74% branco / 0,086 sat) é indistinguível de uma foto real do Pro3Magnésio (62% / 0,088). Passou a assinalar, não excluir. |

Números medidos no fim: 208 testes a passar · 57.105 de 57.305 produtos com
núcleo · 809 acessórios fora das medianas em 78 categorias · pacote gera 5
pastas completas em segundos.

**Não testado, e precisa da máquina do dono:** o reboot e o teste do cabo da
fase A4. São os únicos que provam a BIOS e o logon automático.

## 0 · Já entrou — não repetir

Parâmetros, sinais aditivos, higiene estatística (mediana, p25–p75, `n`
visível, quadrantes pela mediana do conjunto), busca federada, `ui.jsx`,
orquestrador por processo curto + `doctor`, disjuntor de captcha,
`db:inventario`, poda de `RawPayload`, cobertura visível, profundidade
(«lista acabou» vs «nós parámos»), confiança do score, índice
`(product_ref_id, scrape_run_id)`, tripwire de subida, galeria entre runs,
fotos de clientes em 1080. Verificado antes de escrever esta lista.

O nosso orquestrador **já trata sinal corretamente**: `spawnSync` +
`typeof child.status === "number" ? child.status : 1` — morte por sinal vira
falha, não sucesso. O item nº 1 da revisão do perpétuo deles não existe cá.

---

## 1 · O que entra, por ordem de valor

### Fase A — parar de perder a noite (operação)

Motivo: coleta desacompanhada é onde o scraper rende, e é onde hoje ele mais
falha em silêncio. Os quatro itens vêm de `docs/revisao-perpetuo.md` §5–6 e
`docs/rodar-24-7-windows.md`, adaptados ao que já temos.

**A1 · Sentinela `PARAR` e Ctrl+C honesto.**
Hoje a única forma de parar a corrida é matar o processo, e não há registo
de que foi interrupção. Entra: ficheiro `PARAR` na raiz, conferido pelo
orquestrador **antes de cada categoria**; ao encontrá-lo, termina a categoria
em curso, grava o checkpoint com `motivo: "parado pelo dono"` e sai com
código 3. Ctrl+C propaga ao filho (`spawnSync` já faz) e o checkpoint regista
`interrompido`, nunca `ok`.
*Aceite:* criar `PARAR` a meio de uma corrida → a categoria atual acaba, a
seguinte não começa, o checkpoint diz porquê, `npm run scrape:all` recusa
arrancar enquanto o ficheiro existir e diz o que fazer.

**A2 · Trava de instância única.**
Nesta sessão havia três `node --watch` zombie a bater na mesma base. Duas
coletas ao mesmo tempo dobram o risco de captcha (mesmo IP) e o import no
fim pisa o outro. Entra `scripts/lib/trava.mjs` com
`pg_try_advisory_lock(<chave>)` — lock de **sessão**: morre com o processo,
mesmo por SIGKILL, sem ficheiro órfão. O orquestrador e o `pdp:enrich`
pegam a trava ao arrancar; se já está tomada, recusam e dizem quem tem.
*Aceite:* dois `npm run scrape:all` em paralelo → o segundo sai em <2 s com
"já existe uma coleta a correr contra esta base"; matar o primeiro com
`taskkill /F` liberta a trava sem limpeza manual.

**A3 · Contrato de saída com "banco fora".**
O `[doctor]` corre uma vez antes da fila; se o Postgres cair a meio, a fila
continua (não precisa de base) e só o `[pós]` (consolidar + importar) falha
— e falha como "falha de coleta", que é mentira. Entra o contrato deles:
**0** fez trabalho · **3** nada a fazer / parado pelo dono · **4** banco
fora · **outro** falha de coleta. O `[pós]` re-corre o doctor antes de
importar; com 4, **não importa**, deixa o consolidado no disco e diz que o
import fica para quando a base voltar (`npm run import:output` já existe).
*Aceite:* derrubar o container a meio → a coleta acaba, o consolidado
existe, o código é 4, a mensagem final diz o comando para importar depois.

**A4 · `docs/RODAR-24-7-WINDOWS.md` + `scripts/win/`.**
Adaptação direta, não cópia: os elos deles (BIOS religa · logon automático ·
Docker Desktop no logon · Tarefa Agendada sem limite de 3 dias, instância
única, reinício 5 min × 999 · lançador `.bat`). O nosso lançador faz, por
esta ordem: espera `docker info`; se o Desktop estiver aberto e travado após
10 min, derruba e sobe; `docker compose up -d db`; espera o healthcheck do
`tiktok-shop-postgres-local`; `npx prisma migrate deploy`; **só então**
`npm run scrape:all`; se morrer, espera 30 s → 2 → 5 → 15 min e volta ao
passo 1. Pré-voo: `PARAR`? `node`? `.env`? Log próprio com rotação diária.
Inclui **"o único teste que vale"**: puxar o cabo da tomada.
*Aceite:* `shutdown /r /t 0` com a tarefa instalada → em 10 min há linhas
novas no log do lançador e no do orquestrador, sem toque humano.

### Fase B — direção como dado (o volante)

**B1 · `Category.prioridade` + `direcaoNota` + `direcaoEm`.**
Migração via `prisma migrate dev`. Semântica deles, palavra por palavra
porque está certa: `NULL` = descoberta padrão · `1` = interesse, fura a fila
· `-1` = fora de escopo, não gasta coleta **nem crédito**. Escrita **só** por
`npm run direcao -- <slug> --prioridade N --nota "…"`; a nota é obrigatória
com `1` ou `-1` — *"daqui a seis meses ninguém lembra o motivo, e prioridade
sem motivo vira medo de mexer."* Se algum script automático escrever nesta
coluna, o volante virou piloto.
Quem obedece: a fila do orquestrador (`-1` não entra; `1` vai antes da
ordenação por oportunidade que já existe) e o `pacote:symphony` (E1).
`npm run direcao` sem argumentos é o painel: categorias dirigidas, quantas
sem direção, e cobertura de cada uma.
*Aceite:* `--prioridade -1` numa categoria → ela não aparece na fila nem no
pacote; `1` → é a primeira da fila; sem `--nota` → recusa.

### Fase C — "o que é este produto" (o insumo do prompt)

Motivo: o prompt do Symphony precisa de um nome curto e certo ("sapatilha
náutica de neoprene"), não do título de 120 caracteres com "KIT PROMOÇÃO
FRETE GRÁTIS". E a mediana de uma categoria não pode ser puxada por
acessório mal arquivado. Tudo isto é `ml-nucleos.js`, que corre **sem API e
sem agente** — uma passada nos títulos que já temos.

**C1 · `nucleoDoTitulo()`** em `src/scrape/nucleo.mjs`, puro, testado.
Algoritmo deles: primeira palavra com ≥3 letras, não numérica, fora de
`PULAR` (kit, combo, par, caixa, mini, premium, promoção, frete…), não
qualificador (`eletric-`, `portat-`, `inox`…); prefere não-marca e
não-material; três degraus, nunca devolve nulo à toa; `radical()` para
plural. Listas **adaptadas ao TikTok BR** (as deles são do ML e têm 10–12
palavras cada — pequenas de propósito). Grava em `Product.nucleo`.
*Aceite:* teste com 30 títulos reais da base, incluindo os que hoje geram
`categoriaPrincipal` errada; nenhum título devolve `null`.

**C2 · `Product.especie`** — `recompra` (o produto É consumível: refil,
cápsula, lâmina) · `acessorio` (suporte, capa, base) · `produto`. Derivada
do núcleo, não de julgamento. Serve para dois filtros: o pacote evita
acessório sozinho (vídeo de "capa" sem o telemóvel não vende), e `recompra`
× giro provado é a lista de comissão recorrente.

**C3 · `Product.rotuloCurto`** com a precedência deles: (1) curado por gente
(D1) · (2) folha da categoria quando nomeia o produto · (3) núcleo +
qualificador do título. É **este** campo que vai para o prompt e para o
nome da pasta do pacote — o front e o pacote não compõem nome.

**C4 · Veredito `confere / fora / indefinido`** por produto contra a
categoria. `fora` = núcleo diferente **e** o núcleo da categoria aparece
adiante no título ("suporte para VARA") — é acessório do produto, e é a
única classe que **sai das medianas** de `category-stats`. `indefinido`
fica: *"na dúvida não exclui."* Aparece como etiqueta na página de
categoria, com o `n` de cada classe.
*Aceite:* numa categoria com acessórios misturados, a mediana de preço
muda ao excluir `fora`, e o painel mostra quantos saíram e porquê.

### Fase D — curadoria em mutirão

**D1 · `npm run curadoria -- --exportar | --carregar | --status`.**
O padrão deles: o script **prepara a mesa e recolhe a louça; não cura**.
Exporta lotes de 50 (`curadoria/lote-NN.csv`) com `productId, rotuloCurto
sugerido, nucleo, especie, categoria, 3 títulos de exemplo, giro, nota`;
o curador (pessoa ou agente) devolve `curadoria/resposta-NN.csv` com
`rotulo_final, gastar_credito (sim/nao/vazio), nota`. Carregar grava em
tabela própria (`ProductCuration`), **curado vence o automático e nunca é
sobrescrito** por processo. `gastar_credito = nao` tira do pacote sem tirar
da base.
*Aceite:* exportar → editar um CSV → carregar → o rótulo curado aparece no
pacote e sobrevive a um `pdp:enrich` do mesmo produto.

**D2 · `docs/PROMPT-CURADORIA-DE-PRODUTOS.md`** — instruções do curador,
no molde do deles: os três casos (sugerido já bom · categoria mistura
segmentos, usar a característica que separa · não existe rótulo que preste,
deixar vazio e explicar), formato de resposta rígido, "sem vírgula dentro
dos campos", "não invente linha".

### Fase E — o pacote para o Symphony (a vitrine)

Doutrina deles que vale inteira: **a vitrine é derivada e descartável** —
se corromper, regenera; a verdade mora na base. E **publica-se com o grau
de acabamento à mostra**: cada pacote diz de onde veio cada foto e o que
falta.

**E1 · `npm run pacote:symphony -- --top 20`.**
Evolução do `export-local` que já existe (hoje: um produto por POST,
`exportado/<categoria>/<produto>/imagens/…` + JSON de meta). Entra o modo
lote, ordenado por: `prioridade` (B1) → `gastar_credito` curado (D1) →
esquentando (E2) → giro medido → confiança do score. Por produto:

```
exportado/symphony/2026-08-30/sapatilha-nautica-neoprene__1734383733939013197/
  01.jpg 02.jpg 03.jpg 04.jpg     ← até 4, em 1080, sem tabela de medidas
  ficha.json                      ← rotuloCurto, nucleo, especie, categoria,
                                     preço, vendas, nota, n avaliações,
                                     confiança, proveniência de cada foto
  prompt.txt                      ← o template de hoje, preenchido
  legenda.txt                     ← legenda + hashtags + bloco ANTES DE PUBLICAR
```

Escreve em `<pasta>_nova` e **renomeia no fim** — o mesmo "troca em uma
transação" deles, em disco: nunca há meio-pacote para alguém arrastar para
o Symphony. **Detecta imagem de texto** (tabela de medidas, selo, banner só
com letras) por proporção de bordas/linhas retas e **exclui**, dizendo
porquê no `ficha.json` — hoje isso foi feito à mão. O `prompt.txt` leva a
linha *"manter forma, cor e padrão exatamente como nas imagens de
referência"* e o `legenda.txt` passa pelo `verificar_texto` de
`politica_tiktok` (portado para JS em `scripts/lib/politica-tiktok.mjs`,
com os mesmos 9 testes).
*Aceite:* `--top 5` produz 5 pastas completas em <30 s, nenhuma com imagem
de texto, e o `ficha.json` de um produto sem galeria diz `faltando:
["galeria"]` em vez de a pasta não existir.

**E2 · `Product.delta7d`** persistido.
Hoje o delta é calculado na leitura (`growth.mjs`) e só entre os dois últimos
runs. A rodada 1 mediu que `salesCount` é **monotónico** (0 quedas em 18 005
pares), logo `delta7d = salesCount(hoje) − salesCount(há 7 dias)` é uma
subtração por produto no fim do import — uma coluna, não uma série. É a
resposta a "esquentando?" e o terceiro critério do pacote.
*Aceite:* após dois imports com 7 dias de intervalo, o ranking por
`delta7d` existe e bate com o `growth` recalculado à mão para 10 produtos.

### Fase F — decisão em aberto (não é código, é o dono)

**"Nenhuma coluna se chama oportunidade — o seeker descreve, não
recomenda."** É doutrina explícita deles. Nós temos `oportunidade` com
etiquetas *porta aberta / tem dono / evitar* (rodada 1, aceite pelo dono).
As duas posições são defensáveis: a deles protege contra o número que
"parece ordem"; a nossa serve a um único operador que quer ser mandado. Com
80 créditos, uma etiqueta que diz "evitar" poupa dinheiro real. **Manter a
nossa**, mas registar aqui que contradiz a fonte, e rever se o painel
passar a ter mais de um utilizador.

---

## 2 · Recusado de novo, com motivo

| item | motivo (o mesmo da rodada 1, confirmado) |
|---|---|
| Motor de viabilidade / importação, sourcing Alibaba, R$/kg, modais | Afiliado tem 3 variáveis, não 15. Reabrir se passar a produto próprio. |
| `score_final` composto | O autor deles rejeitou por escrito; eixos como colunas. |
| Sazonalidade | Precisa de 24 meses de série. Temos dias. |
| Dividir o repo / vitrine em schema noutro banco | Eles pagaram por multi-tenant e DO. Nós somos um dono, local: **pasta em disco** é a vitrine (E1). |
| Fórmula duplicada em SQL | Autópsia deles (`migracao-012`): divergiu e ninguém consultava. |
| Máquina leitora via Tailscale (`PROMPT-maquina-leitora`) | Adiar: só faz sentido quando houver segunda máquina. O dia em que o portátil de 2017 não aguentar, este documento deles é a receita — leitor só-leitura por `GRANT`, sem abrir porta. |
| `ml:vitrine` (ler a página do ML) | Nada a portar: o nosso PDP já lê a página. |
| Termos de tendência por categoria (`ml:ler --termos`) | Sem equivalente na API do TikTok que já usamos. Anotado. |

---

## 3 · Ordem de construção

```
A1 PARAR + Ctrl+C          1 história   sem migração
A2 trava de instância      1 história   sem migração
A3 contrato de saída       1 história   sem migração
A4 doc 24/7 + lançador     1 história   só docs + scripts/win/
B1 direção como dado       1 história   migração (3 colunas em Category)
C1 nucleoDoTitulo          1 história   migração (Product.nucleo) — puro + testes
C2+C3 especie, rotuloCurto 1 história   migração (2 colunas)
C4 veredito vs categoria   1 história   sem migração (calculado; entra em category-stats)
D1+D2 curadoria            1 história   migração (ProductCuration)
E2 delta7d                 1 história   migração (1 coluna) + passo no import
E1 pacote:symphony         1 história   sem migração — depende de B1, C3, D1, E2
```

Um commit por história, como sempre. A ordem existe porque **E1 é o que o
dono vai usar** e tudo antes é o que o torna certo: sem B1 ele exporta
categoria fora de escopo; sem C3 as pastas chamam-se "KIT-PROMOCAO-FRETE";
sem D1 não há como o dono corrigir sem tocar código; sem E2 não sabe o que
está a esquentar. **A fase A vai primeiro** porque a próxima noite de coleta
é amanhã, e sem ela o resto pode nem ter dados.

---

## 4 · Riscos e o que não sabemos

- **Créditos do Symphony: não se sabe se renovam.** Documentação não diz.
  Medir depois da primeira geração. Se não renovarem, `--top` passa a ser
  orçamento, não conveniência, e D1 (`gastar_credito`) vira obrigatório.
- **Detecção de imagem de texto (E1) é heurística.** Vai errar nos dois
  sentidos. Por isso o `ficha.json` diz o que excluiu e porquê, e o curador
  (D1) pode forçar uma foto. Nunca excluir em silêncio.
- **As listas do núcleo (C1) são pequenas de propósito.** A tentação é
  crescer para apanhar todos os casos; a lição deles é que 12 palavras bem
  escolhidas batem 200. Só crescer com caso real que falhou, e com teste.
- **Um produto vindo de link (`--url`) não tem nome, vendas nem nota** (visto
  hoje). C1/C3 dão-lhe nome; vendas e nota continuam nulas até uma coleta de
  categoria o apanhar. O `ficha.json` diz `faltando: ["vendas", "nota"]` e
  o prompt não os inventa.
