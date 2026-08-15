@echo off
SETLOCAL

REM Diretório do script
SET "SCRIPT_DIR=%~dp0"

REM Inicia frontend (npm dev) em nova janela
SET "FRONTEND_LOG=%USERPROFILE%\Desktop\frontend.log"

REM Verifica e libera porta 5173 se ocupado
SET "PID="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173"') do set "PID=%%a"
IF DEFINED PID (
  echo Encontrado PID %PID% usando a porta 5173. Tentando finalizar.>"%FRONTEND_LOG%"
  taskkill /PID %PID% /F >> "%FRONTEND_LOG%" 2>&1
  timeout /t 1 >nul
)

REM Re-checa a porta e decide a porta a usar
SET "PID2="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173"') do set "PID2=%%a"
IF DEFINED PID2 (
  echo Porta 5173 ainda ocupada. Iniciando Vite em 5174 >> "%FRONTEND_LOG%"
  start "Frontend" cmd /k "cd /d "%SCRIPT_DIR%frontend" && npm run dev -- --port 5174"
) ELSE (
  echo Iniciando Vite na porta 5173 >> "%FRONTEND_LOG%"
  start "Frontend" cmd /k "cd /d "%SCRIPT_DIR%frontend" && npm run dev"
)

REM Inicia servidor Python (MoneyPrinterTurbo) em nova janela
SET "PY_DIR=C:\Users\abelm\OneDrive\Documentos\MoneyPrinterTurbo"
IF EXIST "%PY_DIR%\\.venv_quick\\Scripts\\activate.bat" (
  start "MoneyPrinterTurbo" cmd /k "cd /d "%PY_DIR%" && call "%PY_DIR%\\.venv_quick\\Scripts\\activate.bat" && python main.py"
) ELSE IF EXIST "%PY_DIR%\\.venv\\Scripts\\activate.bat" (
  start "MoneyPrinterTurbo" cmd /k "cd /d "%PY_DIR%" && call "%PY_DIR%\\.venv\\Scripts\\activate.bat" && python main.py"
) ELSE (
  start "MoneyPrinterTurbo" cmd /k "cd /d "%PY_DIR%" && python main.py"
)

REM Abre Docker Desktop (caminho padrão); se não existir, abre prompt com 'docker version'
IF EXIST "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
  start "Docker" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) ELSE (
  start "Docker CLI" cmd /k "docker version || pause"
)

REM Abre pastas do Start Menu/Drive fornecidas
start "Drive1" "C:\ProgramData\Microsoft\Windows\Start Menu\Programs"
start "Drive2" "C:\Users\abelm\AppData\Roaming\Microsoft\Windows\Start Menu\Programs"

echo Comandos emitidos. Feche esta janela ou pressione qualquer tecla para sair.
pause

ENDLOCAL
