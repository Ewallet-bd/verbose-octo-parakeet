$ErrorActionPreference = "Stop"

# run from the script's own folder (no hardcoded path)
Set-Location $PSScriptRoot

# Load credentials.env (skips comments/blank lines, strips quotes)
if (Test-Path "credentials.env") {
    Get-Content credentials.env | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $name, $value = $line -split "=", 2
            $value = $value.Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($name.Trim(), $value)
        }
    }
}

# Single-instance guard: two bots would double-confirm deposits
$running = Get-CimInstance Win32_Process -Filter "Name like 'python%'" |
    Where-Object { $_.CommandLine -match "main\.py" }
if ($running) { Write-Host "Bot already running (PID $($running.ProcessId)). Exiting."; exit 0 }

# Chrome (CDP) must be up first
& "$PSScriptRoot\start_chrome.ps1"
if ($LASTEXITCODE -ne 0) { Write-Error "Chrome not ready"; exit 1 }

# Use the venv interpreter directly
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (!(Test-Path $python)) { $python = "python" }

if (!(Test-Path "logs")) { New-Item -ItemType Directory logs | Out-Null }

# NOTE: python logs to logs\main.log / logs\otp_collector.log itself.
# Console output goes to *_console.log so two writers never share one file.
$otpRunning = Get-CimInstance Win32_Process -Filter "Name like 'python%'" |
    Where-Object { $_.CommandLine -match "otp_collector\.py" }
if (-not $otpRunning) {
Write-Host "Starting OTP Collector..."
Start-Process $python `
    -ArgumentList "otp_collector.py" `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput "logs\otp_console.log" `
    -RedirectStandardError  "logs\otp_err.log"
}

Start-Sleep -Seconds 3

Write-Host "Starting Main Bot..."
Start-Process $python `
    -ArgumentList "main.py" `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput "logs\main_console.log" `
    -RedirectStandardError  "logs\main_err.log"

Write-Host "BOT STARTED SUCCESSFULLY"
Write-Host "Terminal can be closed safely."
