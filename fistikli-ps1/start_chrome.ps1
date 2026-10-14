# Starts Chrome with the remote-debugging port the bot connects to.
# Port is bound to 127.0.0.1 ONLY (never expose 9222 to the internet).
Set-Location $PSScriptRoot

function Test-Cdp {
    try {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:9222/json/version" | Out-Null
        return $true
    } catch { return $false }
}

if (Test-Cdp) { Write-Host "Chrome (CDP 9222) already running."; exit 0 }

$candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Error "Chrome not found. Install Google Chrome first."; exit 1 }

# Dedicated profile: keeps the Reddy/TH logins between restarts
# (recent Chrome versions refuse remote debugging on the default profile).
$profile = Join-Path $PSScriptRoot "chrome-profile"

Start-Process $chrome -ArgumentList @(
    "--remote-debugging-port=9222",
    "--remote-debugging-address=127.0.0.1",
    "--user-data-dir=`"$profile`"",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "https://th-managment.com/signin/",
    "https://web.reddy.team/"
)

for ($i = 0; $i -lt 30; $i++) {
    if (Test-Cdp) { Write-Host "Chrome ready on 127.0.0.1:9222"; exit 0 }
    Start-Sleep -Seconds 1
}
Write-Error "Chrome started but CDP port 9222 is not responding."
exit 1
