@echo off
setlocal EnableDelayedExpansion
rem ===========================================================================
rem  Lancador da coleta - ele nao coleta nada; garante que o que coleta esta
rem  de pe, e refaz a checagem A CADA RELIGADA.
rem
rem  Le o contrato de saida do orquestrador (cabecalho de
rem  scripts/scrape-all-categories.mjs):
rem     0  fez trabalho          -> ciclo terminou bem, espera curta e repete
rem     3  nada a fazer          -> PARAR ou outra instancia; SAI, nao insiste
rem     4  banco fora            -> espera o Postgres, nao conta como falha
rem     *  falha de coleta       -> recuo progressivo
rem
rem  Distinguir 3 e 4 de uma falha e a razao de este ficheiro existir. Um
rem  lancador que insiste contra um Postgres em baixo, ou que religa depois de
rem  o dono mandar parar, e pior do que nao ter lancador nenhum.
rem
rem  ATENCAO: este ficheiro TEM de ficar em CRLF e sem acentos. Com LF o
rem  cmd.exe parte as linhas a meio ("setlocal" chega como "ocal") e o
rem  lancador morre sem dizer porque. Ver .gitattributes.
rem ===========================================================================

cd /d "%~dp0..\.."
set "RAIZ=%CD%"
set "LOG=%RAIZ%\coleta-lancador-%DATE:~-4%%DATE:~3,2%%DATE:~0,2%.log"

call :diz "=== lancador iniciado em %DATE% %TIME% ==="

rem --- pre-voo: falhar dizendo o que fazer, nao estourar de madrugada -------
if exist "%RAIZ%\PARAR" (
  call :diz "[pre-voo] existe PARAR na raiz. Nao subo nada. Apague o ficheiro para religar."
  exit /b 3
)
where node >nul 2>&1 || (call :diz "[pre-voo] node nao esta no PATH." & exit /b 1)
where npm  >nul 2>&1 || (call :diz "[pre-voo] npm nao esta no PATH."  & exit /b 1)
if not exist "%RAIZ%\.env" (call :diz "[pre-voo] falta o .env na raiz." & exit /b 1)

set "ESPERA=30"

:ciclo
if exist "%RAIZ%\PARAR" (
  call :diz "[parar] PARAR apareceu. Encerrando o lancador."
  exit /b 3
)

call :garantir_docker || goto :recuar
call :diz "[docker] a subir o Postgres..."
docker compose -f docker-compose.postgres-local.yml up -d >nul 2>&1

call :diz "[docker] a esperar a porta 5433..."
call npm run --silent db:docker:wait >nul 2>&1
if errorlevel 1 (
  call :diz "[docker] a base nao abriu a porta. Recuando."
  goto :recuar
)

rem Schema incerto e pior do que uma hora parado.
call :diz "[schema] a aplicar migracoes..."
call npm run --silent db:migrate:deploy >nul 2>&1
if errorlevel 1 (
  call :diz "[schema] migrate deploy falhou. NAO comeco a coletar com schema incerto."
  goto :recuar
)

call :diz "[coleta] a arrancar..."
node scripts\scrape-all-categories.mjs --depois-importa %*
set "CODIGO=%ERRORLEVEL%"

if "%CODIGO%"=="0" (
  call :diz "[coleta] ciclo completo. Nova volta em 15 min."
  timeout /t 900 /nobreak >nul
  set "ESPERA=30"
  goto :ciclo
)
if "%CODIGO%"=="3" (
  call :diz "[coleta] nada a fazer (PARAR ou outra instancia). Encerrando o lancador."
  exit /b 3
)
if "%CODIGO%"=="4" (
  call :diz "[coleta] banco fora. Nao e falha de coleta - espero 2 min e reconfiro."
  timeout /t 120 /nobreak >nul
  goto :ciclo
)
call :diz "[coleta] falhou (codigo %CODIGO%)."

:recuar
call :diz "[recuo] nova tentativa em %ESPERA%s."
timeout /t %ESPERA% /nobreak >nul
if %ESPERA% LSS 120 (set "ESPERA=120") else (
  if %ESPERA% LSS 300 (set "ESPERA=300") else (set "ESPERA=900")
)
goto :ciclo

rem --------------------------------------------------------------------------
:garantir_docker
docker info >nul 2>&1 && exit /b 0
call :diz "[docker] motor nao responde. A abrir o Docker Desktop..."
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" >nul 2>&1
set /a TENTOU=0
:esperar_docker
timeout /t 20 /nobreak >nul
docker info >nul 2>&1 && exit /b 0
set /a TENTOU+=1
if %TENTOU% LSS 30 goto :esperar_docker
rem Aberto e travado e estado comum depois de desligamento sujo. Esperar nao cura.
call :diz "[docker] 10 min sem motor. A derrubar o Docker Desktop e subir de novo."
taskkill /F /IM "Docker Desktop.exe" >nul 2>&1
timeout /t 10 /nobreak >nul
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" >nul 2>&1
timeout /t 60 /nobreak >nul
docker info >nul 2>&1 && exit /b 0
exit /b 1

:diz
echo [%TIME:~0,8%] %~1
echo [%DATE% %TIME:~0,8%] %~1>>"%LOG%"
exit /b 0
