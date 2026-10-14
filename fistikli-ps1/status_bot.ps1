$procs = Get-CimInstance Win32_Process -Filter "Name like 'python%'" |
    Where-Object { $_.CommandLine -match "(main|otp_collector)\.py" }

if ($procs) {
    Write-Host "BOT IS RUNNING ✅"
    $procs | Select-Object ProcessId, Name, CommandLine
} else {
    Write-Host "BOT IS STOPPED ❌"
}
