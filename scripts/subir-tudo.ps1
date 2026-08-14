# Sobe os tres servicos do pipeline scraper -> MoneyPrinterTurbo num so comando.
#
# Evita as tres causas de instabilidade que ja mordemos:
# 1. Docker Desktop nao roda sozinho -> inicia e espera o daemon responder.
# 2. Log da API dentro da pasta do projeto -> node --watch entra em loop de
#    reinicio ao ver o proprio log mudar. Log vai para %TEMP%.
# 3. Streamlit trava no prompt de e-mail da primeira execucao (sem terminal
#    pra responder) -> credentials.toml vazio criado antes de subir.
#
# Todos os processos sobem via Start-Process, desacoplados deste shell -- nao
# morrem quando este script termina.

$ErrorActionPreference = "Stop"

$scraper = "C:\Users\abelm\OneDrive\Documentos\GitHub\projeto_tiktok-Categorias_v02"
$mpt = "C:\Users\abelm\OneDrive\Documentos\MoneyPrinterTurbo"
$py = "C:\Users\abelm\.venvs\moneyprinterturbo\Scripts\python.exe"
$logDir = "$env:TEMP\nexa-pipeline-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-PortListening($port) {
    return (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) -ne $null
}

# --- 1. Docker Desktop ---
Write-Host "Verificando Docker..."
$dockerReady = $false
try { docker info *> $null; $dockerReady = $true } catch {}

if (-not $dockerReady) {
    Write-Host "Docker parado, iniciando Docker Desktop..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    $tentativas = 0
    while (-not $dockerReady -and $tentativas -lt 40) {
        Start-Sleep -Seconds 3
        try { docker info *> $null; $dockerReady = $true } catch {}
        $tentativas++
    }
}

if (-not $dockerReady) {
    Write-Host "ERRO: Docker nao respondeu a tempo. Abra o Docker Desktop manualmente e rode este script de novo."
    exit 1
}
Write-Host "Docker OK."

# --- 2. Postgres do scraper ---
Write-Host "Subindo Postgres do scraper..."
Push-Location $scraper
docker compose -f docker-compose.postgres-local.yml up -d | Out-Null
Pop-Location

$tentativas = 0
while (-not (Test-PortListening 5433) -and $tentativas -lt 20) {
    Start-Sleep -Seconds 2
    $tentativas++
}
if (-not (Test-PortListening 5433)) {
    Write-Host "ERRO: Postgres nao respondeu na porta 5433."
    exit 1
}
Write-Host "Postgres OK (5433)."

# --- 3. API do scraper (3333) ---
if (Test-PortListening 3333) {
    Write-Host "API ja esta rodando (3333), pulando."
} else {
    Write-Host "Subindo API do scraper..."
    Start-Process -FilePath "npm.cmd" -ArgumentList "run","api:dev" `
        -WorkingDirectory $scraper -WindowStyle Hidden `
        -RedirectStandardOutput "$logDir\scraper_api.log" `
        -RedirectStandardError "$logDir\scraper_api.err.log"
}

# --- 4. Frontend do scraper (5173) ---
if (Test-PortListening 5173) {
    Write-Host "Frontend ja esta rodando (5173), pulando."
} else {
    Write-Host "Subindo frontend do scraper..."
    Start-Process -FilePath "npm.cmd" -ArgumentList "run","frontend:dev" `
        -WorkingDirectory $scraper -WindowStyle Hidden `
        -RedirectStandardOutput "$logDir\scraper_front.log" `
        -RedirectStandardError "$logDir\scraper_front.err.log"
}

# --- 5. MoneyPrinterTurbo / Streamlit (8501) ---
$credPath = "$env:USERPROFILE\.streamlit\credentials.toml"
if (-not (Test-Path $credPath)) {
    New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.streamlit" | Out-Null
    Set-Content -Path $credPath -Value "[general]`nemail = `"`"" -Encoding utf8
}

# Streamlit multipagina: sem isto, abrir/recarregar direto numa sub-pagina
# (ex.: /Produtos) faz o app adivinhar a URL do servidor usando a pagina
# atual, errar (404 em _stcore/health e _stcore/host-config) e so acertar na
# segunda tentativa (raiz). window.__streamlit e o gancho oficial do proprio
# Streamlit para dizer isso explicitamente. Idempotente: reaplica sozinho se
# o Streamlit for reinstalado/atualizado no venv e o index.html voltar ao
# original.
$streamlitIndex = "$py\..\..\Lib\site-packages\streamlit\static\index.html"
if ((Test-Path $streamlitIndex) -and -not (Select-String -Path $streamlitIndex -Pattern "window.__streamlit" -Quiet)) {
    Write-Host "Aplicando correcao de base URL no Streamlit..."
    (Get-Content $streamlitIndex -Raw) -replace `
        '<script type="module" crossorigin src="\./static/js/index\.[^"]+\.js"></script>', `
        "`n    <script>window.__streamlit = { BACKEND_BASE_URL: window.location.origin + `"/`" }</script>`n    `$0" |
        Set-Content -Path $streamlitIndex -Encoding utf8 -NoNewline
}

if (Test-PortListening 8501) {
    Write-Host "MoneyPrinterTurbo ja esta rodando (8501), pulando."
} else {
    Write-Host "Subindo MoneyPrinterTurbo..."
    $env:PYTHONPATH = $mpt
    Start-Process -FilePath $py -ArgumentList "-m","streamlit","run","webui/Main.py","--server.port","8501","--browser.serverAddress","127.0.0.1" `
        -WorkingDirectory $mpt -WindowStyle Hidden `
        -RedirectStandardOutput "$logDir\mpt_streamlit.log" `
        -RedirectStandardError "$logDir\mpt_streamlit.err.log"
}

# --- 6. Espera todo mundo responder ---
Write-Host "Aguardando os servicos ficarem prontos..."
$portas = @(3333, 5173, 8501)
foreach ($porta in $portas) {
    $tentativas = 0
    while (-not (Test-PortListening $porta) -and $tentativas -lt 30) {
        Start-Sleep -Seconds 2
        $tentativas++
    }
    if (Test-PortListening $porta) {
        Write-Host "  Porta $porta : OK"
    } else {
        Write-Host "  Porta $porta : NAO SUBIU -- ver log em $logDir"
    }
}

Write-Host ""
Write-Host "Scraper (ranking):  http://localhost:5173"
Write-Host "API do scraper:     http://127.0.0.1:3333"
Write-Host "MoneyPrinterTurbo:  http://127.0.0.1:8501"
Write-Host "Logs em:            $logDir"
