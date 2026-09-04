<#
  Registra a Tarefa Agendada que sobe a coleta ao logon.

  Nao precisa de administrador — a tarefa corre com o teu utilizador, que e o
  que tem o perfil do Chrome com a sessao do TikTok. Uma tarefa a correr como
  SYSTEM nao teria esse perfil e apanharia captcha em todas as categorias.

  Os ajustes que nao sao obvios, e porque:

    limite de tempo NENHUM   O padrao da Tarefa Agendada mata a tarefa ao fim
                             de 3 dias, CALADO. Seria uma parada misteriosa
                             toda terca-feira.

    instancia unica          Duas coletas pelo mesmo IP acabam em captcha. A
                             trava do Postgres ja recusa a segunda, mas e
                             melhor nem a lancar.

    atraso de 2 min          Da tempo ao Docker Desktop antes de o lancador
                             comecar a insistir.

    corre com bateria        Numa queda de energia com nobreak, a coleta nao
                             pode pausar so por estar em bateria.
#>

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$bat  = Join-Path $raiz 'scripts\win\coleta.bat'
$nome = 'tiktok-shop coleta'

if (-not (Test-Path $bat)) { throw "nao encontrei $bat" }

$acao = New-ScheduledTaskAction -Execute 'cmd.exe' `
  -Argument "/c `"$bat`"" -WorkingDirectory $raiz

$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$gatilho.Delay = 'PT2M'

$ajustes = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -RestartCount 999 `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho `
  -Settings $ajustes -Force | Out-Null

Write-Host "Tarefa '$nome' registada." -ForegroundColor Green
Write-Host ""
Write-Host "Testar sem esperar um reboot:"
Write-Host "  Start-ScheduledTask   -TaskName '$nome'"
Write-Host "  Get-ScheduledTaskInfo -TaskName '$nome'"
Write-Host ""
Write-Host "Parar de verdade (sobrevive a reboot):"
Write-Host "  New-Item '$raiz\PARAR'"
