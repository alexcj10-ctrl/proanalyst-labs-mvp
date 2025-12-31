# start.ps1 — ProAnalyst Labs MVP (Backend + Web)
# Ejecuta: clic derecho > "Run with PowerShell"  (o desde terminal: powershell -ExecutionPolicy Bypass -File .\start.ps1)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = Join-Path $ProjectRoot "backend"
$WebDir      = Join-Path $ProjectRoot "web"

function Open-TerminalAndRun($title, $workdir, $command) {
  $args = @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "Set-Location -LiteralPath `"$workdir`"; `$host.UI.RawUI.WindowTitle = `"$title`"; $command"
  )
  Start-Process powershell -WorkingDirectory $workdir -ArgumentList $args
}

# 1) BACKEND
$backendCmd = @"
if (!(Test-Path '.\venv\Scripts\Activate.ps1')) { Write-Host '❌ No existe backend\venv. Crea/instala el venv primero.' -ForegroundColor Red; pause; exit }
.\venv\Scripts\Activate.ps1
python -V
uvicorn main:app --reload --host 127.0.0.1 --port 8000
"@

Open-TerminalAndRun "ProAnalyst BACKEND (8000)" $BackendDir $backendCmd

# Pequeña pausa para que el backend arranque
Start-Sleep -Seconds 1

# 2) WEB
$webCmd = @"
if (!(Test-Path '.\package.json')) { Write-Host '❌ No existe web\package.json. Revisa la carpeta web.' -ForegroundColor Red; pause; exit }
npm run dev
"@

Open-TerminalAndRun "ProAnalyst WEB (5173)" $WebDir $webCmd

# 3) Abrir navegador
Start-Sleep -Seconds 1
Start-Process "http://localhost:5173"
