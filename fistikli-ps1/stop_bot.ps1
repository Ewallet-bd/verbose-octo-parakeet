Write-Host "Stopping bot..."

# match by command line, so it works with venv OR system python
Get-CimInstance Win32_Process -Filter "Name like 'python%'" |
    Where-Object { $_.CommandLine -match "(main|otp_collector)\.py" } |
    ForEach-Object {
        Write-Host "Stopping PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force
    }

Write-Host "Bot stopped."
