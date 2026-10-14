# Run ONCE from an elevated PowerShell. Creates two scheduled tasks:
#   FistikliBot          - starts Chrome + bot when you log on
#   FistikliBotWatchdog  - every 5 min restarts anything that died
# Chrome needs a desktop session, so use Windows auto-logon (see README_WINDOWS.md).
$ErrorActionPreference = "Stop"
$dir  = $PSScriptRoot
$user = "$env:USERDOMAIN\$env:USERNAME"
$ps   = "powershell.exe"

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

$a1 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\start_bot.ps1`"" -WorkingDirectory $dir
$t1 = New-ScheduledTaskTrigger -AtLogOn -User $user
$t1.Delay = "PT30S"
Register-ScheduledTask -TaskName "FistikliBot" -Action $a1 -Trigger $t1 -Settings $settings -Principal $principal -Force | Out-Null

$a2 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\watchdog.ps1`"" -WorkingDirectory $dir
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "FistikliBotWatchdog" -Action $a2 -Trigger $t2 -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Installed. Tasks: FistikliBot, FistikliBotWatchdog"
