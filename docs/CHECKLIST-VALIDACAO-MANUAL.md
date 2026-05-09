# Checklist — validação manual (operador)

Uso: abrir este ficheiro durante uma sessão de testes; ir tarefa a tarefa; marcar **OK** ou **Erro** no bloco **Status**; preencher **Observações** quando falhar ou houver dúvida.

Pré-requisitos habituais: `.env` com `DATABASE_URL`, `ANALYTICS_API_KEY`, chave no `frontend/.env` alinhada à API. Ver `FLUXO.md` para portas e dois terminais se não usar `dev:all`.

**Como usar este ficheiro:** o **topo** (pendências) é o **backlog operacional** extraído das **Observações** da validação — actualizar após cada sessão. Abaixo fica o **checklist completo** tarefa a tarefa.

**Sobre os checkboxes:** não basta olhar para `[x] Pendente` vs `[x] OK` — em alguns blocos o `[x]` ficou na linha errada. **Fonte de verdade para pendências:** texto em **Observações** + contexto da tarefa.

---

## Legenda (classificação das pendências)

| Classificação | Quando usar |
|---------------|-------------|
| **Bug provável** | Comportamento inconsistente com o desejado; merece repro no código. |
| **Investigação** | Pode ser dados vazios, regra de negócio ou bug — falta confirmar com dados/API. |
| **UX** | Funciona, mas navegação ou feedback confundem o operador. |
| **Clareza** | Checklist ou copy da UI pouco claros; melhorar texto/guia. |
| **Falso alarme** | Provável comportamento correcto; só documentar ou alinhar expectativa. |
| **Melhoria futura** | Nice-to-have; quando virar trabalho, copiar para **`docs/ROADMAP.md`**. |

---

# Pendências encontradas na validação

*Síntese das observações da sessão exemplo (09/05/2026, dev). Ao fechar uma linha, removê-la daqui ou marcar «(feito)» e apontar PR/commit.*

## Prioridade Alta

- **[Investigação]** **Growth / Em ascensão** com filtro **ticket alto**: operador reportou lista sem dados — verificar universo de dados vs query/filtro na API e no `frontend` (aba Growth).
- **[Investigação]** **Product Score** com **ticket alto**: idem — lista vazia; confirmar se critério exclui tudo ou bug.
- **[Investigação]** **Opportunities** modo **sem vendas** (`low_sales` / sem vendas): não aparecem produtos — confirmar se não há itens no snapshot com essa condição ou se o filtro está demasiado restritivo.
- **[Bug provável]** **Notas no workspace**: observação — nota vista no contexto de favoritos, após **refresh** a informação desapareceu — rever chaves `localStorage` (ex.: `productId` vs rota `/shortlist`) e persistência entre páginas.

## Prioridade Média

- **[UX]** **Scrape simultâneo:** ao bloquear scrape num cartão, o botão da toolbar **«Scrapear as duas categorias»** não mostra o mesmo feedback visual de bloqueio que os cartões — alinhar em `CategoriesPage.jsx` (ou mensagem global «ocupado»).
- **[Investigação / UX]** **`/a-mao`** vs **`/shortlist`:** mudanças no hub não actualizam de imediato a vista de favoritos — decidir se é limitação esperada (`localStorage` + sem evento entre rotas), bug, ou falta de copy no `FLUXO.md`; documentar ou corrigir.

## UX / Clareza

- **[UX]** **Em Ascensão / Escalar / Mapa:** não há caminho óbvio para abrir **workspace** pelo produto (só nome ou sem link) — ideia do operador: **linha inteira clicável** ou coluna «Abrir».
- **[UX]** **Enrich PDP** no workspace: fluxo «Enrich → esperar → Actualizar dados (import) → fotos» pouco claro; botão **Recarregar** sem explicação — melhorar texto de ajuda em `ProductWorkspacePage.jsx` / `FLUXO.md`.
- **[Clareza]** **Creator Signals:** micro-explicação (uma linha) de que é leitura derivada dos mesmos números do painel, sem mudar score.
- **[UX]** **Listas vazias** (ex. ticket alto): mensagem explícita («Nenhum produto neste filtro…») em vez de tabela vazia sem contexto.
- **[Clareza]** Itens do checklist **«Detalhes técnicos do cartão»**, **«Alertas só quando aplicável»**, **«Resiliência (produto inexistente / API offline)»** — operador escreveu «não entendi o que fazer»: reescrever passos no próprio `.md` (exemplos de URL inválida; quando esperar badge «URLs misturadas»; como parar só a API).

## Dúvidas operacionais

- **[Falso alarme provável]** Cartão **«Roupas femininas e roupas íntimas…»** após scrape: números mudam (**+0 novos**, N **actualizados**) mas **total na base** pode não subir — esperado quando não entram **product_id** novos; reforçar copy no card ou nota no `FLUXO.md`.
- **[Esperado]** **Import ignorado** (`input_hash` igual — «ScrapeRun existente») — comportamento correcto de idempotência; não é bug.
- **[Dúvida]** **Consola** só avisos **amarelos** (ex. React Router future flags em dev) — aceitável até opt-in às flags; não bloqueia validação.
- **[Melhoria futura]** **Filtros de ticket** e **Creator Presets** — operador pediu lista dedicada de cenários de teste; quando priorizar, virar tarefas no **`docs/ROADMAP.md`**.

---

## Checklist completo (tarefas detalhadas)

A seguir: **registo da sessão** e cada bloco com passos, resultado esperado, status e observações.

## Registo desta sessão

Preencher no **início** de cada corrida de validação (pode duplicar este bloco para uma nova sessão).

| Campo | Valor |
|-------|-------|
| Data do teste: |09/05/2026 |
| Ambiente: | dev |
| Banco usado: | |
| Categoria testada: | |
| URL testada: | |

*(Preencher as linhas vazias no início de cada sessão.)*

---

## [Ambiente] Subir stack com `npm run dev:all`

O que fazer:
- Na raiz do repo, executar `npm run dev:all`.
- Esperar Postgres local, API e Vite subirem sem mensagem de abort.

Resultado esperado:
- Terminal indica API em `127.0.0.1:3333` (ou porta configurada) e frontend acessível.
- Abrir no browser a URL do Vite (ex. `http://localhost:5173` — ver `FLUXO.md`).

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Ambiente] Subir só app com `npm run dev:app`

O que fazer:
- Garantir `DATABASE_URL` válida (Postgres acessível, ex. remoto ou já a correr).
- Na raiz, executar `npm run dev:app`.

Resultado esperado:
- API + Vite sobem; não é obrigatório Docker de DB local se a URL apontar para instância disponível.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Abrir dashboard de Categorias

O que fazer:
- Com o frontend no ar, abrir a rota inicial (`/`).

Resultado esperado:
- Página **Categorias** com grelha de cartões (ou mensagem vazia coerente se não houver dados importados).

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Validar estrutura geral dos cards

O que fazer:
- Ver cada cartão: título, KPI principal (produtos na base), bloco **Última coleta**, botão **Scrapear**, link **Abrir análise**.

Resultado esperado:
- Layout legível; sem sobreposição óbvia; link do cartão e botão scrape acessíveis.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:Categoria
Roupas íntimas femininas
710
produtos na base
Última coleta

215 colectados no total
110 importados nesta categoria · 102 lojas
+15 novos · 95 actualizados
105 fora desta categoria / dedupe
Última coleta: 09/05/2026, 11:23 (há 5 min)
URLs misturadas
Detalhes técnicos
Scrapear
Abrir análise →
-

---

## [Categorias] Validar métricas do bloco «Última coleta»

O que fazer:
- Em pelo menos um cartão com dados, conferir linhas: colectados no total; importados nesta categoria e lojas; novos e actualizados; fora desta categoria/dedupe (se aplicável); data da última coleta e texto relativo (ex. «há X min»).

Resultado esperado:
- Números e datas coerentes com o último import conhecido; linha «fora…» só quando total ficheiro > importados nesta categoria.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Scrapear uma categoria pelo cartão

O que fazer:
- Clicar **Scrapear** num cartão com URL válida; aguardar fim (scrape + import encadeados).

Resultado esperado:
- Estados «A scrapear…» / «A importar…» / sucesso ou mensagem de erro clara; lista de categorias recarrega após import.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:As duas estão funcionando. obs: Roupas femininas e roupas íntimas femininas testei mas ela nao atualizou os dados , acredito que seja que os produtos ja estão coletados ,  437 produtos na base Última coleta 210 colectados no total
100 importados nesta categoria · 97 lojas +0 novos · 100 actualizados
110 fora desta categoria / dedupe Última coleta: 09/05/2026, 11:46 (agora há pouco)
URLs misturadas Detalhes técnicos Scrapear Abrir análise →
-

---

## [Categorias] Scrapear duas categorias (botão geral)

O que fazer:
- Se o botão existir na toolbar, clicar **Scrapear as duas categorias**; aguardar conclusão.

Resultado esperado:
- Fluxo termina com mensagem de sucesso ou erro explícito; dados consolidados e import refletidos nos cartões após reload.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Bloqueio de scrape simultâneo

O que fazer:
- Iniciar um scrape longo num cartão; durante a execução, tentar **Scrapear** noutro cartão ou o botão das duas.

Resultado esperado:
- Segundo pedido bloqueado (botões disabled ou erro da API tipo ocupado); primeiro fluxo conclui sem misturar estados.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:se eu escrapear geral ele bloqueia os botoes do card e se executar o do card o outro bloqueia aparece o icone de blequio no outro card porem no botão geral nao aparece o icone de bloqueio.
-

---

## [Import] Importar JSON para o banco (manual)

O que fazer:
- Na raiz (sem UI), após ter `output/dados_*.json` actualizado: `npm run db:import:output` (ou repetir fluxo do painel que já importa após scrape).

Resultado esperado:
- Comando termina com código 0; no terminal, resumo de import ou mensagem de skip por `input_hash` se dados iguais.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações: Importação ignorada: este output já foi importado.(ScrapeRun existente: cmoyhkhtr0000rizxpc6ohr5l | inputHash: a4127f6244b7888b336b098b4a32927e4e8f430ee8a4a35f4715e95d0f49901)
-

---

## [Categorias] Atualizar dados na tela após importação

O que fazer:
- Após import (pelo cartão ou CLI), fazer refresh na página `/` ou disparar novo scrape que recarrega a lista.

Resultado esperado:
- Números/datas nos cartões actualizam em conformidade com o último run (salvo skip por hash duplicado).

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Abrir análise filtrada da categoria

O que fazer:
- Clicar **Abrir análise →** num cartão.

Resultado esperado:
- Navegação para rota `/categoria/...` com analytics filtrados pela categoria; sem 404 por segmento inválido.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Analytics] Dashboard global

O que fazer:
- Abrir **Analytics global** (link a partir de `/` ou rota `/analytics` conforme UI).

Resultado esperado:
- Página carrega abas/relatórios; dados ou mensagens vazias coerentes; sem spinner infinito.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Analytics] Top Products

O que fazer:
- Na vista global, abrir secção/tab **Top Products** (ou nome equivalente); opcional filtro por categoria se existir.

Resultado esperado:
- Tabela ou lista com produtos; ordenação/filtros reagem; sem erro visível.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Analytics] Opportunities

O que fazer:
- Abrir **Opportunities**; testar chip de **modo** (ex. classic / low_sales) se existir.

Resultado esperado:
- Lista muda ou nota de regra visível; sem crash ao mudar modo.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:sem venda nao aparece o produto, nao sei dizer se não tem o o produto sem venda , temos que investigar 
-

---

## [Analytics] Growth / Em ascensão

O que fazer:
- Abrir **Growth** / **Em ascensão**; com filtro de categoria se disponível.

Resultado esperado:
- Dados ou estado vazio coerente; filtro por URL de categoria não quebra a página.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:Ticket alto nao aparece nehum dados temso que investigar.

-

---

## [Analytics] Product Score

O que fazer:
- Abrir **Product Score**; expandir ou ordenar colunas se existir.

Resultado esperado:
- Lista carrega; interacções básicas (ordenar, scroll) funcionam.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:Ticket alto nao tem produtos temos que investigar
-

---

## [Analytics] Filtros de ticket

O que fazer:
- Se existir filtro por faixa de preço/ticket, aplicar um valor e limpar.

Resultado esperado:
- Lista filtra ou volta ao estado completo; URL ou estado local coerente.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações:Vamos fazer uma lista de tarefas para os filtros e ticket
-

---

## [Analytics] Creator Presets

O que fazer:
- Usar atalhos **Creator Presets** (se visíveis na UI de Opportunities).

Resultado esperado:
- Preset altera modo/filtros esperados sem erro.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações:vamso criar depois uma lista pra ele para testarmos.
-

---

## [Workspace] Abrir Product Workspace

O que fazer:
- A partir de um produto listado (Top Products, Score, etc.), abrir detalhe/workspace.

Resultado esperado:
- Página de workspace com dados do produto; fotos ou mensagem se não houver imagens.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações: 📈 Em Ascensão 🔥 Escalar🧭 Mapa esse ai nao tem a opção de clicar no nome e abrir o espaço do produto que acredito que seja o workspace, minha ideia ao inves de clicar no nome do produto pra abrir , colocar para clicar na linha e abre ele
-

---

## [Workspace] Creator Signals

O que fazer:
- Na página workspace, localizar secção **Creator Signals** (ou equivalente) e ler valores.

Resultado esperado:
- Secção presente ou ausência documentada; sem erro de layout.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações: O que tem la  Creator Signal sLeitura rápida a partir dos mesmos números do painel — não altera score nem API.

⚠️ Saturado💳 Ticket Médio🏅 Rating alto
-

---

## [Shortlist] Favoritar produto

O que fazer:
- No workspace (ou lista que tenha o botão), marcar produto como favorito/shortlist.

Resultado esperado:
- Estado visual de favorito activo; sem erro no console.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Shortlist] Remover favorito

O que fazer:
- Desmarcar o mesmo produto.

Resultado esperado:
- Favorito removido; lista local coerente.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Shortlist] Sincronização na mesma aba

O que fazer:
- Com dois separadores ou duas áreas que leem shortlist (se aplicável), favoritar numa e verificar na outra na **mesma aba** (navegação interna).

Resultado esperado:
- `localStorage` partilhado: segundo sítio reflecte após navegação ou evento de actualização.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Shortlist] Página `/shortlist`

O que fazer:
- Abrir rota `/shortlist` pelo menu ou URL directa.

Resultado esperado:
- Lista de favoritos; produtos adicionados aparecem; vazio se nenhum.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [À mão] Hub `/a-mao`

O que fazer:
- Abrir `/a-mao` (hub operacional).

Resultado esperado:
- Página carrega com abas ou secções previstas (Recentes, Por estágio, Shortlist).

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações:  se eu alterar o a -mao ele nao atualiza dde imediato na pagina dos favoritos (Preciso entender melhor essa funcção pra que que serve e se faz sentido em nosso projeto, ) na minha concpçao tinha que ser automatico ou nao ter. 
-

---

## [À mão] Recentes em `/a-mao`

O que fazer:
- Abrir aba **Recentes**; abrir um produto recente se listado.

Resultado esperado:
- Lista ou estado vazio coerente; navegação para workspace quando clicável.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações:se eu alterar o a -mao ele nao atualiza dde imediato na pagina dos favoritos (Preciso entender melhor essa funcção pra que que serve e se faz sentido em nosso projeto, ) na minha concpçao tinha que ser automatico ou nao ter.
-

---

## [À mão] Por estágio em `/a-mao`

O que fazer:
- Abrir **Por estágio**; percorrer estágios disponíveis.

Resultado esperado:
- Agrupamento por estágio visível; sem erro ao mudar de vista.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [À mão] Pré-visualização Shortlist em `/a-mao`

O que fazer:
- Na área de resumo shortlist do hub, verificar prévia com favoritos existentes.

Resultado esperado:
- Contagens ou lista resumida alinhadas com `/shortlist`.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Pipeline] Estados do criador no workspace

O que fazer:
- No workspace, alterar estado do pipeline para: **descoberto** → **em_analise** → **em_teste** → **conteudo_produzido** → **publicado**; testar também **descartado** num produto de teste.

Resultado esperado:
- Cada transição guarda e persiste (ver tarefa de refresh); valores legados migrados se aplicável.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Pipeline] Notas locais no workspace

O que fazer:
- Escrever nota curta no campo de notas (se existir); sair e voltar ao mesmo produto.

Resultado esperado:
- Nota reaparece; sem perda ao navegar dentro da mesma origem de dados local.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:a nota apareceu nos favoritos , atualizei a pagina e nao pedeu a informação
-

---

## [Pipeline] Persistência após refresh (localStorage)

O que fazer:
- Definir estado e/ou nota; fazer **F5** na página do workspace.

Resultado esperado:
- Estado e notas locais mantidos conforme desenho do produto (localStorage).

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Enrich] Enrich PDP manual (se disponível)

O que fazer:
- Se existir acção ou fluxo documentado em `FLUXO.md` para **PDP enrich**, disparar para 1 produto de teste.

Resultado esperado:
- Pedido aceite ou mensagem clara de indisponível; terminal/API sem crash.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações: Ao clicar no enriquecer o produto ele abre o cmd e eceuta , depois tenho que clicar no atualizar dados , ai aparece as fotos, uma duvidaé o que ele mais pega n ao enriquecer? depois de clicar no botão atualizar produto ai aparece as fotos que veio do pdp, tem um botão carregar que nao sei pra que serve.(Mas provalvel que vou mudar onde fazer o enriquecimento , deve ser automatico ao exportar mas esta em sandbay ainda)
-

---

## [Export] Export manual (Spaces ou ZIP conforme UI)

O que fazer:
- No workspace ou relatório, executar export para Spaces ou download ZIP de imagens se o botão existir e estiver configurado.

Resultado esperado:
- Sucesso com confirmação ou **503**/mensagem de config em falta — explícito, não silencioso.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:Baixei as imagens no pc deu certo fiz com um produto so. 
-

---

## [UI] Responsividade básica

O que fazer:
- Redimensionar janela (largura média e estreita); percorrer `/`, `/analytics`, workspace.

Resultado esperado:
- Conteúdo utilizável sem overflow crítico; scroll horizontal excessivo só onde aceitável (tabelas).

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Qualidade] Consola sem erros vermelhos críticos

O que fazer:
- Abrir DevTools → **Console**; percorrer fluxos principais (/, scrape, analytics).

Resultado esperado:
- Sem erros vermelhos repetidos que impeçam uso; avisos amarelos documentados em observações se aceitáveis.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:bom vermelho é erro neh, te amarelo so 
-

---

## [Qualidade] Network sem excesso de pedidos

O que fazer:
- Abrir **Network**; filtrar por XHR/fetch; navegar numa aba de analytics com filtros.

Resultado esperado:
- Sem loops de refetch visíveis (centenas de pedidos idênticos por segundo).

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Detalhes técnicos do cartão

O que fazer:
- Expandir **Detalhes técnicos** num cartão; ver hash, id do import, estado bruto, datas.

Resultado esperado:
- Conteúdo presente e legível; fechado por defeito não oculta o resumo operacional.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações: nao entendi o que fazer
-

---

## [Categorias] Alertas só quando aplicável

O que fazer:
- Em operação normal recente: confirmar **ausência** de badges. Simular ou localizar dados para: **URLs misturadas** (várias URLs no bucket); **Coleta incompleta** (`status` ≠ ok no run); **Desactualizado** (coleta com mais de 72 h — difícil simular sem alterar dados ou esperar).

Resultado esperado:
- Sem alertas quando tudo OK; badge correspondente quando condição real se verifica.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações:nao entendi o que fazer 
-

---

## [Resiliência] Produto inexistente ou erro de API

O que fazer:
- Abrir URL de workspace com `productId` inválido ou forçar API offline (parar `analytics:api` mantendo Vite).

Resultado esperado:
- Mensagem de erro ou estado vazio claro; não página em branco sem feedback.

Status:
- [x] Pendente
- [ ] OK
- [ ] Erro

Observações:nao entendi o qu efazer
-

---

## [Fluxo] Creator ponta a ponta (resumo)

O que fazer:
- Da lista: abrir produto → workspace → ajustar pipeline e notas → favoritar → ver em `/shortlist` e `/a-mao` → abrir analytics da categoria → voltar ao workspace.

Resultado esperado:
- Fluxo completo sem perda de contexto local; encadeamento útil para operador real.

Status:
- [ ] Pendente
- [x] OK
- [ ] Erro

Observações:
-

---

## Notas finais

- **Backlog operacional:** ver secção **«Pendências encontradas na validação»** no topo deste ficheiro (prioridades + UX + dúvidas); actualizar quando fechar itens.
- Tarefas **37–39** (alertas) podem ficar **Pendente** se não houver dados de teste para forçar o estado; registar em **Observações**.
- Para comandos e portas exactos, usar **`FLUXO.md`** como referência durante o checklist.
