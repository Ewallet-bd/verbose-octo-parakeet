# Runs every few minutes (Task Scheduler). Restarts whatever has died.
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "logs\watchdog.log"
if (!(Test-Path "logs")) { New-Item -ItemType Directory logs | Out-Null }

$procs = Get-CimInstance Win32_Process -Filter "Name like 'python%'"
$main  = $procs | Where-Object { $_.CommandLine -match "main\.py" }
$otp   = $procs | Where-Object { $_.CommandLine -match "otp_collector\.py" }
$chromeUp = $false
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:9222/json/version" | Out-Null; $chromeUp = $true } catch {}

if ($main -and $otp -and $chromeUp) { exit 0 }

"$(Get-Date -Format s) restart: main=$([bool]$main) otp=$([bool]$otp) chrome=$chromeUp" | Add-Content $log
& "$PSScriptRoot\start_bot.ps1"
