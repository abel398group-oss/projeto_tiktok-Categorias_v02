# Manter a coleta de pé sem ninguém a olhar

**30/08/2026.** A coleta rende de noite, e é de noite que ninguém está a ver.
Este documento é a cadeia de elos que faz a máquina voltar sozinha depois de
qualquer coisa — apagão, reboot, Docker travado, Postgres em baixo.

Adaptado do `product-seeker` (`docs/rodar-24-7-windows.md`), que já pagou
estas lições. O que muda aqui: o nosso pré-voo é Docker + Prisma em vez de
token do Mercado Livre, e o contrato de saída é o do
`scripts/scrape-all-categories.mjs`.

## O contrato que faz o lançador funcionar

O lançador não é um `while true`. Ele lê o código de saída e trata cada um
de maneira diferente — é a diferença entre uma rede de segurança e um
processo teimoso:

| código | significa | o lançador faz |
|---|---|---|
| `0` | fez trabalho | espera 15 min e recomeça |
| `3` | nada a fazer (`PARAR`, ou outra instância) | **sai**, e não volta |
| `4` | banco fora | espera 2 min e reconfere — não conta como falha |
| outro | falha de coleta | recuo 30 s → 2 → 5 → 15 min |

O `3` e o `4` são a razão de o ficheiro existir. Insistir contra um Postgres
em baixo não cura nada, e religar depois de o dono mandar parar é pior do que
não ter lançador nenhum.

## Os elos, do metal para cima

**1 · BIOS/UEFI: religar quando a energia voltar.**
Procure *Restore on AC Power Loss* / *After Power Failure* e ponha em
**Power On**. Sem isto, todos os outros elos são teoria: a máquina fica
desligada até alguém carregar no botão.

Um nobreak não é luxo aqui. Não é pelos minutos de autonomia — é para o
desligamento ser limpo. Corte seco no meio de uma escrita do Postgres dá
recuperação de WAL na volta, e às vezes dá pior.

**2 · Logon automático.** `netplwiz` → desmarcar *"Os utilizadores têm de
introduzir o nome e a palavra-passe"*. A tarefa corre **ao logon**, com o teu
utilizador — e tem de ser o teu, porque é o teu perfil que tem a sessão do
TikTok no Chrome. Uma tarefa a correr como SYSTEM apanharia captcha em todas
as categorias.

**3 · Docker Desktop ao entrar.** Definições → *Start Docker Desktop when you
log in*. O lançador espera por ele de qualquer forma, mas assim começa antes.

**4 · A Tarefa Agendada.**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\win\instalar-tarefa.ps1
```

Não precisa de administrador. Os ajustes que não são óbvios estão comentados
no próprio `.ps1`; os dois que mais importam:

- **limite de tempo nenhum.** O padrão da Tarefa Agendada mata a tarefa ao
  fim de 3 dias, **calado**. Seria uma parada misteriosa toda terça-feira.
- **instância única** (`IgnoreNew`). A trava do Postgres já recusa a segunda
  coleta, mas é melhor nem a lançar.

Testar sem esperar um reboot:

```powershell
Start-ScheduledTask   -TaskName 'tiktok-shop coleta'
Get-ScheduledTaskInfo -TaskName 'tiktok-shop coleta'
```

**5 · O lançador `scripts\win\coleta.bat`.**
Ele não coleta; garante que o que coleta está de pé, e **refaz a checagem a
cada religada**:

1. espera o `docker info` responder. Se o Docker Desktop estiver aberto e
   travado ao fim de 10 min, **derruba e sobe de novo** — aberto e travado é
   estado comum depois de desligamento sujo, e esperar mais não cura;
2. `docker compose up -d` do Postgres e espera a porta 5433;
3. `prisma migrate deploy`. Se falhar, **não começa a coletar**: schema
   incerto é pior do que uma hora parado;
4. `node scripts\scrape-all-categories.mjs --depois-importa`;
5. trata o código de saída pela tabela acima.

Pré-voo antes de tudo: existe `PARAR`? existe `node`? existe `npm`? existe
`.env`? Cada um falha dizendo o que fazer.

Log próprio com rotação diária: `coleta-lancador-AAAAMMDD.log` na raiz,
coberto pelo `*.log` do `.gitignore`.

> **O `.bat` tem de ficar em CRLF e sem acentos.** Com LF o `cmd.exe` parte as
> linhas a meio — `setlocal` chega como `ocal` — e o lançador morre sem dizer
> porquê. Custou uma depuração em 30/08/2026. O `.gitattributes` fixa isso
> com `*.bat text eol=crlf`; se editar o ficheiro noutro editor, confirme.

## Parar de verdade

```powershell
New-Item PARAR        # na raiz do repositório
```

A coleta encerra ao fim da categoria em andamento, e o lançador confere a
sentinela antes de cada religada — então ele também para, **e continua parado
nos próximos boots**. Para religar: apague o ficheiro e
`Start-ScheduledTask`.

Fechar a janela do `.bat` **não** é parada definitiva: mata o processo, mas o
próximo logon sobe tudo outra vez. É por isso que o `PARAR` existe, e é por
isso que ele não é apagado no arranque.

Para só pausar a corrida de hoje, sem impedir a de amanhã, use a outra
sentinela: `output/scrape-all.stop`.

## O que acontece numa queda de internet

O Postgres é local, então a internet só afecta o TikTok. A cadeia:

- as categorias começam a falhar; o **disjuntor de captcha** para a corrida
  ao fim de 3 bloqueios seguidos, sem penalizar as categorias barradas;
- o lançador recebe código diferente de 0 e recua 30 s → 2 → 5 → 15 min;
- a internet volta e o ciclo seguinte funciona. Ninguém faz nada.

## O único teste que vale

Com a coleta a correr há uns minutos, **puxe o cabo da tomada**. Espere um
minuto, religue e não toque em mais nada. Em 10 a 15 minutos os dois logs do
dia devem ter linhas novas.

Um teste mais gentil, que valida os elos 2 a 5 mas **não** o 1, é
`shutdown /r /t 0`. Faça esse primeiro; o do cabo depois, porque é o único
que prova a BIOS.

## Manutenção que não se resolve sozinha

- **os logs crescem.** Rotacionam por dia, mas ninguém os apaga. Limpeza
  mensal dos `coleta-lancador-*.log` com mais de 30 dias.
- **a base cresce.** `npm run db:inventario` mostra linhas × disco × quem lê.
  Em 23/08/2026 mediu 886 MB com 350 MB em duas tabelas sem leitor. A poda
  de `RawPayload` já impede o crescimento, mas `DELETE` no Postgres não
  devolve espaço ao sistema — só `VACUUM FULL` encolhe o ficheiro.
- **backup.** Não existe ainda, e merece Tarefa Agendada própria. O ficheiro
  tem de sair da máquina: backup no mesmo disco não é backup.
- **`npm install` depois de um `git pull`** que mexa em dependência. O
  lançador não faz isso de propósito — instalar pacote sozinho de madrugada é
  como um laço automático vira um problema difícil de diagnosticar.
