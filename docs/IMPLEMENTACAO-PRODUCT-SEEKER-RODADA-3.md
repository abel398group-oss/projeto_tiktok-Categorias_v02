# product-seeker → scraper TikTok — rodada 3 (05/09/2026)

Análise do `C:\Users\abelm\OneDrive\Documentos\GitHub\product-seeker` para
extrair o que ainda não veio. A rodada 2 fechou em 04/09 com todas as fases
implementadas; este documento parte do que **não** está na lista «já entrou»
nem na lista «recusado» daquele documento.

Cada item abaixo foi verificado no código dos dois lados antes de entrar aqui.
Onde não verifiquei, está dito.

---

## 0 · O primeiro achado é uma ausência: **não há frontend para analisar**

O pedido incluía «front, analisa tudo». Não há o que analisar:

```
apps/web/          só node_modules/ — nenhum ficheiro de código
git ls-files apps/web/     → 0
git log --all  *.jsx/.tsx  → 0 (nunca existiu em commit nenhum)
```

O README descreve as páginas em detalhe (Painel, Busca, Mapa, Backlog,
Anúncios, Termos, Fornecedores, Polos, Matriz, Triagem, Embarque, Importar,
Parâmetros, Cobertura honesta) e a navegação «agrupada por intenção», mas o
código nunca foi versionado. **O que existe do front é a descrição, não a
implementação.**

Isso muda a resposta a «o que copiar do front deles»: copia-se o *desenho de
navegação* descrito no README, não código. E o nosso painel já tem as três
telas que aquele desenho tem de mais forte — Parâmetros, Cobertura e a
separação consulta/análise.

**Conclusão: não há trabalho de frontend a portar. O valor está no servidor,
no coletor e no modelo de dados.**

---

## 1 · O que o product-seeker tem, medido

| área | ficheiros | linhas | o que é |
|---|---|---|---|
| `db/` | 100 `.sql` | — | schema + **79 migrações** numeradas |
| `apps/api/src/db/` | 65 | — | 43 módulos `ml-*` (um comando cada) |
| `apps/api/src/lib/` | 15 | 3.912 | motor de regras, dicionário, ficha, auth |
| `coletor/` | 3 | 463 | scripts colados na consola do browser |
| `docs/` | 19 | — | metodologia e prompts |
| `apps/web/` | **0** | **0** | — |

O `engine.js` (807 linhas, 21 testes) é função pura sem I/O — «o pedaço que
não pode quebrar não depende de nada que pode quebrar». Esse princípio já
está no nosso `src/scrape/*.mjs`.

---

## 2 · O que entra — por ordem de valor

### A · Fingerprint e sequência do navegador ⭐ o item forte da rodada

**O que eles mediram (21/08/2026, `lib/humanizar.js` e `ml-vitrine.js`):**

| motor | resultado medido |
|---|---|
| `fetch` puro do Node | página `suspicious-traffic` em **150 de 150** |
| Playwright/Chromium próprio, **com perfil persistente e stealth** | detectado — ML pediu **reconhecimento facial** |
| **CDP: ligar ao Chrome real do dono** (`--remote-debugging-port`) | passa |

> «a aba ANÓNIMA do Chrome do Abel passa, o Chromium automatizado não. A
> diferença é o fingerprint de automação, não o IP nem o login.»

**Porque isto importa para nós, e não é «já temos anti-ban»:** o nosso
`scrapeCategory.mjs` usa exatamente a configuração que eles mediram a falhar
— `puppeteer-extra` + `StealthPlugin` + Chrome instalado. O nosso
`src/scrape/anti-ban.mjs` é uma política de **ritmo** (atraso, backoff,
pressão por janela, penalização por falha) e está bem feita. O que não tem é
**sequência**:

> «A lição não é "faça pausas". É que a SEQUÊNCIA importa tanto quanto o
> intervalo: de onde você veio, o que digitou, se rolou a página. Um referrer
> vazio em série é assinatura.»

Verificado: nem `docs/ANTI-BAN-INTEGRATION.md` nem `docs/PDP-ANTI-BAN-COMPLETE.md`
mencionam aquecimento, referrer, digitação ou CDP.

**A1 · `aquecer()` antes da primeira URL** — home → aceitar cookies → rolar →
**digitar** o termo caractere a caractere (delay 90–210 ms) → Enter → rolar →
clicar num resultado. Só depois o chamador tem licença para navegar por URL.
Dá referrer verdadeiro e cria o par busca→produto que o padrão espera.
Nunca lança: devolve `{ok, digitou, clicou, aviso}` — aquecimento falhado é
reportado, não derruba a rodada.

**A2 · `rolarComoGente()`** — 3 a 6 passos, mouse a mover-se, **15% de volta
para cima**. `scrollBy` monotónico é detectável por ser perfeito; e rolagem
sem `mousemove` é assinatura de script.

**A3 · `intervalo()` com pausa longa periódica** — a cada ~7 leituras cai uma
pausa de 15–40 s. O nosso `nextDelay()` já varia, mas com desvio pequeno e
sem a pausa longa. Duas linhas.

**A4 · Modo CDP** — `--cdp`: em vez de lançar browser, ligar ao Chrome do
dono aberto com porta de depuração. Fingerprint real, sessão real, zero flag
de automação. Já temos `HEADED=1` para login assistido; isto é o passo
seguinte e resolve o caso em que o `HEADED` também é detectado.

**Correção ao que este documento dizia antes de implementar:** boa parte do A
**já existia** e eu tinha exagerado o buraco. O `scrapeCategory.mjs` já
aquecia no Google com rato e rolagem, e já navega a partir da página anterior
para o `Referer` sair verdadeiro — essa parte, medida em 29/08, é **melhor**
que a do product-seeker, que ainda usa a opção `referer` do `goto` (que
medimos cá como inerte). O que faltava mesmo eram três coisas: interação
(digitar), volta atrás na rolagem, e pausa longa com período.

### ⚠ O que a implementação mediu, e muda a prioridade do A4

Ao ligar o aquecimento, testei-o contra o Google real com o nosso stack
(`puppeteer-extra` + `StealthPlugin` + Chrome instalado):

| modo | abrir a home | **digitar e dar Enter** |
|---|---|---|
| headless | passa | **`google.com/sorry/index`** |
| janela visível (`HEADED`) | passa | **`google.com/sorry/index`** |

**Não é o headless — é a assinatura de automação.** A home passa; procurar
não. É exatamente a lição que o product-seeker mediu no Mercado Livre em
21/08, agora confirmada no nosso próprio stack.

Duas consequências, ambas já tratadas no código:

1. **Digitar sem verificar seria pior que não digitar.** Sairíamos de uma
   página de CAPTCHA para o TikTok, e o `Referer` passaria a dizer «venho de
   um muro». O `pareceMuroDeBot()` detecta, avisa no log e volta à home —
   que essa passa.
2. **O A4 (CDP) deixa de ser hipótese.** O teste barato que este documento
   propunha já foi feito e deu o resultado que o justifica: enquanto o
   browser for lançado por nós, ele é reconhecível. Ligar ao Chrome do dono
   é o que o product-seeker mediu como saída.

**Estado: A1–A4 implementados.** E o A/B do CDP fechou a questão — mesma
máquina, mesmo código, mesma busca:

| modo | resultado |
|---|---|
| browser lançado por nós (headless) | `google.com/sorry/index` |
| browser lançado por nós (`HEADED`) | `google.com/sorry/index` |
| **CDP, ligado ao Chrome do utilizador** | **`/search?q=…` com resultados** |

Não é o headless, não é o IP, não é a sessão: é a assinatura de automação do
navegador que **nós** lançamos. Perfil persistente e `StealthPlugin` já
estavam ligados quando isto foi medido — não resolvem.

```
chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-scrape"
CDP=1 npm run coleta:uma
```

O `--user-data-dir` tem de ser pasta à parte: com o perfil normal, um Chrome
já em execução ignora a flag em silêncio. A mensagem de erro do
`connectToUserChrome` diz isso, porque descobri-lo sozinho custa uma tarde.

E o detalhe que torna isto usável: em CDP o `encerrarBrowser()` faz
`disconnect()` e não `close()` — o navegador é do utilizador, e fechá-lo no
fim de uma coleta mataria as abas dele.

---

### B · Os limiares do score continuam cravados no código

A rodada 2 marcou «Parâmetros» como entrado. Entrou, mas **só metade**:

| | onde | quantos | editável sem deploy |
|---|---|---|---|
| Sinais do Ranking | `frontend/src/parametrosSinais.js` → localStorage | 4 cortes | **sim** (tela Parâmetros) |
| **Motor de score** | `scripts/analytics/lib/product-score.mjs` | ~12 limiares | **não** |

Os que estão cravados são os que decidem tudo o que sai da API — e
alimentam também o MoneyPrinter:

```js
if (sc >= 1000) return 35;  if (sc >= 300) return 25;   // pontosVendas
if (avg >= 4.8 && tot >= 10) return 25;                 // pontosAvaliacao
if (sc >= 10 && sc <= 300 && avg >= 4.5 && tot >= 5) return 15;  // oportunidade
if (vendasPorDia >= 50) return { pts: 10 };             // crescimento
if (score >= 80) return "excelente";                    // rótulo
```

Mudar «produto bom tem 300 vendas» exige editar código e reiniciar. O
product-seeker resolveu com uma tabela `parametro(chave, valor, unidade,
descricao, **fonte**, atualizado_em)` e uma função SQL `param('chave')` —
e a regra que torna isto seguro: **`PARAMS_DEFAULT` no código é fallback,
não fonte de verdade.**

**B1 · Extrair os limiares para `PARAMS_DEFAULT` num módulo próprio**, com
unidade, explicação e fonte por chave — igual ao `CATALOGO_PARAMETROS` que já
temos no front. Sem banco ainda: só tirar os números de dentro dos `if`.

**B2 · Servir e aceitar por API** (`GET/PUT /analytics/parametros`),
persistidos em tabela. Aí a tela de Parâmetros passa a mandar no motor, não só
no ecrã, e os dois conjuntos de cortes deixam de viver em sítios diferentes.

**Esforço:** B1 uma história sem migração e com testes (os valores não podem
mudar ao extrair — teste de caracterização primeiro). B2 uma história com
migração de uma tabela.

**Estado: B1 feito** (`scripts/analytics/lib/score-parametros.mjs`, 8 testes
de caracterização escritos antes da extracção). B2 por fazer.

**O que o teste de caracterização revelou, e ninguém sabia:** o score **nunca
chega a 100**. O eixo de oportunidade (15 pontos) só pontua entre 10 e 300
vendas, portanto é mutuamente exclusivo com o topo do eixo de vendas — um
campeão de volume nunca é «oportunidade», por definição já foi descoberto. O
máximo real é **85**, e o `Math.min(100)` do código é decorativo.

Não é teórico: no ranking de agora, **6 dos 30 produtos estão exactamente em
85** — no tecto — apresentados como se lhes faltassem 15 pontos de qualidade.
Faltam-lhes 15 pontos de ainda-não-ser-óbvio, que é o contrário. Corrigir a
escala é decisão de produto; fica registado em `CORTES.score_maximo`.

**Nota:** isto **não** é o `score_final` composto que o autor deles rejeitou
por escrito e que nós recusámos duas vezes. É só tirar constantes de dentro
de `if`.

---

### C · «Nada é eliminado — vira CONDICIONAL com a restrição nomeada»

A decisão de modelagem nº 1 deles, e a que mais rende por linha:

```sql
CREATE TYPE status_item AS ENUM ('ALVO', 'CONDICIONAL', 'FORA');  -- sem REPROVADO
CREATE TYPE restricao_ligante AS ENUM ('frete_expresso','ticket','capital',
  'giro','concentracao','cross_border','marca_global','markup','competencia',
  'estrutura','conformidade');
```

> «"reprovado" nunca foi veredito sobre o item — é veredito sobre o par
> *(item, nossa estrutura de hoje)*. Se alguém vende, há retorno; o que falta
> é a nossa estrutura, e estrutura muda.»

Cada item guarda **qual restrição morde primeiro** (`restricao_ligante`) e
**o que a destrava** (`gatilho`). O retorno imediato: uma consulta agrupada
mostrou que *9 itens travavam pela mesma restrição* — quase metade do backlog
destravava com um movimento só.

**O que temos hoje:** `score` 0–100 + `classific` («excelente/bom/…») +
`motivos` (string concatenada) + `faltando` (que campos faltaram para julgar).
O `faltando` já é primo disto — diz o que impede *medir*. Falta o irmão: o que
impede *aprovar*, e o que o destravaria.

**C1 · `restricaoLigante` + `gatilho` nas linhas de score.** Em vez de um
produto «bom» com 62 pontos e nada a dizer, sai «trava em `nota_fraca`,
destrava com 5 avaliações». Agrupável: «31 produtos travam por falta de
galeria» é uma tarefa, não uma lista.

Restrições plausíveis no nosso domínio (a confirmar com o dono, não inventar):
`sem_galeria`, `nota_fraca`, `sem_vendas_medidas`, `ticket_baixo`,
`categoria_fora_de_direcao`, `acessorio_fora_da_mediana`.

**Esforço:** uma história, sem migração (calculado no relatório, como o
`faltando`). Se for para persistir e agrupar no SQL, mais uma coluna.

**Porque vale:** o painel hoje ordena; isto faz o painel **dizer o que fazer
a seguir**. É o mesmo salto que o `faltando` deu.

**Estado: feito** (`scripts/analytics/lib/restricao.mjs`, 9 testes). E o
resultado deles reproduziu-se: dos 30 produtos do ranking, **27 travam na
mesma restrição** — `sem_galeria`. Um comando (`npm run pdp:enrich`) destrava
27 dos 30 melhores produtos. Era isto que estava invisível numa lista
ordenada por score.

```
 27  sem_galeria
  3  (nada trava)
```

---

### D · Procedência: guardar todas as fontes, seguir a de maior precedência

O caso real deles, num anúncio de fresa: o cadastro estruturado dizia
«Carbeto», o título dizia «Aço Rápido», a descrição dizia «aço rápido HSS».
Três fontes, uma contradição, e a escolha silenciosa trocaria o produto.

```
PRECEDENCIA_FONTE
  medido      6   alguém pegou o paquímetro. Não erra.
  fornecedor  5   ficha do fabricante, confirmada
  descricao   4   o texto que vende — e que a busca indexa
  bullet      3   destaques
  titulo      2   escrito para ranquear, não para especificar
  ficha_ml    1   preenchida pelo vendedor numa lista suspensa
```

Regra: **guardar tudo com procedência, seguir o de maior precedência, anotar a
divergência.** E a que protege o trabalho humano: *uma recoleta nunca apaga
uma medição* — reimportar substitui só o que veio da página; linhas com fonte
`medido` ou `fornecedor` sobrevivem.

**O que temos:** `dataQuality.enrichment{status, at, source, baseHash}` — uma
procedência, um valor. Nada guarda «o título dizia X e a PDP dizia Y».

**Medido em 05/09/2026, e o número mata o item:**

| | |
|---|---|
| snapshots na base | 236.864 |
| **com galeria de PDP lida** | **38** (0,016%) |
| com enriquecimento marcado | 59 |

**Não há segunda fonte com que discordar.** A precedência resolve contradição
entre fontes; nós temos uma fonte (o card da listagem) em 99,98% das linhas.
Construir o mecanismo agora seria montar o árbitro antes de existir a
discussão.

E a parte que valia por si — «recoleta nunca apaga trabalho humano» — **já
está garantida, por acidente feliz de modelagem**: `ProductCuration` é
chaveada por `product_id` sem chave estrangeira, portanto não cascateia. O
import não lhe toca (verificado em `import-output-core.mjs`) e as 3 curadorias
sobreviveram intactas à limpeza de 80 runs de ontem.

**Veredito: fora desta rodada.** Reabrir quando a leitura de PDP for rotina e
houver contradição real para arbitrar — aí o desenho deles é o certo, e este
parágrafo é o gatilho.

---

## 3 · O que analisei e **não** deve entrar

| item | motivo |
|---|---|
| `engine.js` (landed, ROI, teto FOB, régua do quilo, modais, embarque) | Confirma a recusa das rodadas 1 e 2. São 807 linhas para importador; afiliado tem 3 variáveis. |
| Dicionário PT/EN/中文 (36 atributos, 22 críticos) e casamento com fornecedor | Serve para comprar em 1688/Alibaba. Fora do escopo do afiliado. |
| `ml-sazonalidade` (Google Trends) | Já recusado: precisa de 24 meses de série; temos dias. **Sem alteração.** |
| Fórmulas duplicadas em SQL | A autópsia deles (`migracao-012`) diz que divergiu. Mantemos JS como fonte única. |
| `ml-vitrine` como leitor de página | Já recusado — o nosso PDP lê a página. **Mas o modo CDP dele entra (A4): é sobre como se obtém o browser, não sobre o que se lê.** |
| 79 migrações / modelo `gondola`, `produto_mercado`, `produto_vendedor` | O modelo deles serve um marketplace com API oficial de ofertas. O nosso snapshot já cobre o equivalente. |

---

## 4 · Ordem proposta

```
A1 aquecer()                1 história   src/scrape/humanizar.mjs — puro + teste
A2 rolarComoGente()         junto com A1
A3 intervalo com pausa longa  junto com A1 — 2 linhas no anti-ban.mjs
A4 modo --cdp                1 história   flag no lançamento do browser
B1 limiares → PARAMS_DEFAULT 1 história   teste de caracterização ANTES
C1 restricaoLigante+gatilho  1 história   calculado, sem migração
B2 parâmetros por API+tabela 1 história   migração
```

Cinco histórias. **D saiu** — ver o número na secção D.

### Estado em 05/09/2026

| | |
|---|---|
| A1–A3 sequência humana | **feito** — `src/scrape/humanizar.mjs`, 12 testes |
| A4 modo CDP | **feito** — `CDP=1`, com A/B a comprovar |
| B1 limiares fora dos `if` | **feito** — `score-parametros.mjs`, 8 testes de caracterização |
| B2 parâmetros por API + tabela | por fazer |
| C1 restrição ligante | **feito** — `restricao.mjs`, 9 testes, e visível no painel |

Suite: de 208 para **237 testes**, 0 falhas.

**A vai primeiro** porque é a única que protege a coleta: sem dados, o resto
não tem sobre o que correr. E porque a configuração que eles mediram a falhar
é a que temos hoje.

**B1 antes de C1** porque C1 vai querer nomear limiares («ticket baixo» é
abaixo de quanto?), e é melhor que já estejam num sítio só.

---

## 5 · O que não sei, e não vou supor

- ~~**Se o nosso browser é detectado como o deles era.**~~ **MEDIDO em
  05/09/2026, e é.** Ver a caixa abaixo.
Duas incógnitas que este documento tinha ficaram resolvidas antes de o
fechar, e ambas contra construir (ver secção D): a curadoria **sobrevive** a
recoleta e à limpeza de runs, e só **38 de 236.864** snapshots têm segunda
fonte lida. Ficam registadas aqui porque a próxima pessoa merece saber que
foram medidas, não presumidas.

---

## 6 · Uma nota sobre o método deles que vale mais que qualquer módulo

O cabeçalho do `coletor/categoria.js` documenta três coisas que a versão
anterior fazia «e pareciam economia»: **priorizava** (cortava o resto),
**agregava** no runtime, e **parava cedo** (uma página por categoria — 0,6%
de «fresas», impresso como veredito da categoria). As três foram removidas:

> «COLETA é exaustiva e burra. ANÁLISE é no banco, com n e cobertura sempre à
> vista.»

E os quatro defeitos que só a página real mostrou — card contado duas vezes
por dois seletores, preço lido do valor **riscado**, permalink de anúncio
patrocinado com hash rotativo (chave natural nova a cada coleta, para sempre),
e «patrocinado» detectado por texto dando sempre `false`.

Nenhum deles aparece em teste unitário. Aparecem quando alguém abre a página
e conta. Vale a pena a mesma auditoria de meia hora na nossa coleta do TikTok:
**contar à mão o que a página mostra e comparar com o que gravámos.**
