# Checklist — validação manual (operador)

Uso: abrir este ficheiro durante uma sessão de testes; ir tarefa a tarefa; marcar **OK** ou **Erro** no bloco **Status**; preencher **Observações** quando falhar ou houver dúvida.

Pré-requisitos habituais: `.env` com `DATABASE_URL`, `ANALYTICS_API_KEY`, chave no `frontend/.env` alinhada à API. Ver `FLUXO.md` para portas e dois terminais se não usar `dev:all`.

## Registo desta sessão

Preencher no **início** de cada corrida de validação (pode duplicar este bloco para uma nova sessão).

| Campo | Valor |
|-------|-------|
| Data do teste: |09/05/2026
| Ambiente: |dev


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
- [ ] OK
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
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Validar métricas do bloco «Última coleta»

O que fazer:
- Em pelo menos um cartão com dados, conferir linhas: colectados no total; importados nesta categoria e lojas; novos e actualizados; fora desta categoria/dedupe (se aplicável); data da última coleta e texto relativo (ex. «há X min»).

Resultado esperado:
- Números e datas coerentes com o último import conhecido; linha «fora…» só quando total ficheiro > importados nesta categoria.

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Scrapear duas categorias (botão geral)

O que fazer:
- Se o botão existir na toolbar, clicar **Scrapear as duas categorias**; aguardar conclusão.

Resultado esperado:
- Fluxo termina com mensagem de sucesso ou erro explícito; dados consolidados e import refletidos nos cartões após reload.

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Import] Importar JSON para o banco (manual)

O que fazer:
- Na raiz (sem UI), após ter `output/dados_*.json` actualizado: `npm run db:import:output` (ou repetir fluxo do painel que já importa após scrape).

Resultado esperado:
- Comando termina com código 0; no terminal, resumo de import ou mensagem de skip por `input_hash` se dados iguais.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Atualizar dados na tela após importação

O que fazer:
- Após import (pelo cartão ou CLI), fazer refresh na página `/` ou disparar novo scrape que recarrega a lista.

Resultado esperado:
- Números/datas nos cartões actualizam em conformidade com o último run (salvo skip por hash duplicado).

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] OK
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
- [ ] OK
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
- [ ] OK
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
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Analytics] Growth / Em ascensão

O que fazer:
- Abrir **Growth** / **Em ascensão**; com filtro de categoria se disponível.

Resultado esperado:
- Dados ou estado vazio coerente; filtro por URL de categoria não quebra a página.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Analytics] Product Score

O que fazer:
- Abrir **Product Score**; expandir ou ordenar colunas se existir.

Resultado esperado:
- Lista carrega; interacções básicas (ordenar, scroll) funcionam.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Analytics] Filtros de ticket

O que fazer:
- Se existir filtro por faixa de preço/ticket, aplicar um valor e limpar.

Resultado esperado:
- Lista filtra ou volta ao estado completo; URL ou estado local coerente.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Analytics] Creator Presets

O que fazer:
- Usar atalhos **Creator Presets** (se visíveis na UI de Opportunities).

Resultado esperado:
- Preset altera modo/filtros esperados sem erro.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Workspace] Abrir Product Workspace

O que fazer:
- A partir de um produto listado (Top Products, Score, etc.), abrir detalhe/workspace.

Resultado esperado:
- Página de workspace com dados do produto; fotos ou mensagem se não houver imagens.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Workspace] Creator Signals

O que fazer:
- Na página workspace, localizar secção **Creator Signals** (ou equivalente) e ler valores.

Resultado esperado:
- Secção presente ou ausência documentada; sem erro de layout.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Shortlist] Favoritar produto

O que fazer:
- No workspace (ou lista que tenha o botão), marcar produto como favorito/shortlist.

Resultado esperado:
- Estado visual de favorito activo; sem erro no console.

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] OK
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
- [ ] OK
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
- [ ] OK
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
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [À mão] Recentes em `/a-mao`

O que fazer:
- Abrir aba **Recentes**; abrir um produto recente se listado.

Resultado esperado:
- Lista ou estado vazio coerente; navegação para workspace quando clicável.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [À mão] Por estágio em `/a-mao`

O que fazer:
- Abrir **Por estágio**; percorrer estágios disponíveis.

Resultado esperado:
- Agrupamento por estágio visível; sem erro ao mudar de vista.

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] OK
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
- [ ] OK
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
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Pipeline] Persistência após refresh (localStorage)

O que fazer:
- Definir estado e/ou nota; fazer **F5** na página do workspace.

Resultado esperado:
- Estado e notas locais mantidos conforme desenho do produto (localStorage).

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Export] Export manual (Spaces ou ZIP conforme UI)

O que fazer:
- No workspace ou relatório, executar export para Spaces ou download ZIP de imagens se o botão existir e estiver configurado.

Resultado esperado:
- Sucesso com confirmação ou **503**/mensagem de config em falta — explícito, não silencioso.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [UI] Responsividade básica

O que fazer:
- Redimensionar janela (largura média e estreita); percorrer `/`, `/analytics`, workspace.

Resultado esperado:
- Conteúdo utilizável sem overflow crítico; scroll horizontal excessivo só onde aceitável (tabelas).

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Qualidade] Network sem excesso de pedidos

O que fazer:
- Abrir **Network**; filtrar por XHR/fetch; navegar numa aba de analytics com filtros.

Resultado esperado:
- Sem loops de refetch visíveis (centenas de pedidos idênticos por segundo).

Status:
- [ ] Pendente
- [ ] OK
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
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Categorias] Alertas só quando aplicável

O que fazer:
- Em operação normal recente: confirmar **ausência** de badges. Simular ou localizar dados para: **URLs misturadas** (várias URLs no bucket); **Coleta incompleta** (`status` ≠ ok no run); **Desactualizado** (coleta com mais de 72 h — difícil simular sem alterar dados ou esperar).

Resultado esperado:
- Sem alertas quando tudo OK; badge correspondente quando condição real se verifica.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Resiliência] Produto inexistente ou erro de API

O que fazer:
- Abrir URL de workspace com `productId` inválido ou forçar API offline (parar `analytics:api` mantendo Vite).

Resultado esperado:
- Mensagem de erro ou estado vazio claro; não página em branco sem feedback.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## [Fluxo] Creator ponta a ponta (resumo)

O que fazer:
- Da lista: abrir produto → workspace → ajustar pipeline e notas → favoritar → ver em `/shortlist` e `/a-mao` → abrir analytics da categoria → voltar ao workspace.

Resultado esperado:
- Fluxo completo sem perda de contexto local; encadeamento útil para operador real.

Status:
- [ ] Pendente
- [ ] OK
- [ ] Erro

Observações:
-

---

## Notas finais

- Tarefas **37–39** (alertas) podem ficar **Pendente** se não houver dados de teste para forçar o estado; registar em **Observações**.
- Para comandos e portas exactos, usar **`FLUXO.md`** como referência durante o checklist.
