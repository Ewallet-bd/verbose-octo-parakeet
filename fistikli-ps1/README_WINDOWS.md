# Windows VPS setup

## 1. Install
1. Install **Google Chrome** and **Python 3.10+** (tick "Add to PATH").
2. Copy this folder to the VPS (e.g. `C:\fistikli-ps1`). Do NOT copy `credentials.env` through chat/zip; create it on the VPS.
3. In PowerShell inside the folder:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\pip install -r requirements.txt
   Copy-Item credentials.env.example credentials.env   # then fill in the values
   notepad credentials.env
   ```
   `credentials.env` needs `TH_USERNAME`, `TH_PASSWORD`, `FISTIKLI_API_KEY`.
   (No `playwright install` needed: the bot attaches to your Chrome.)

## 2. First run (manual, once)
```powershell
powershell -ExecutionPolicy Bypass -File .\start_chrome.ps1
```
In the Chrome window that opens (over RDP):
- log in to **web.reddy.team** and keep that tab open (the OTP collector reads it),
- keep the **th-managment.com** tab open.
The login is stored in `chrome-profile\`, so it survives restarts. Do not delete that folder.

Then start the bot: `powershell -ExecutionPolicy Bypass -File .\start_bot.ps1`
Check: `.\status_bot.ps1`, logs in `logs\main.log`, `logs\deposit.log`.
Stop: `.\stop_bot.ps1`.

## 3. Auto-start + auto-restart
Elevated PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\install_autostart.ps1
```
- Chrome needs a logged-in desktop. Enable Windows **auto-logon** (`netplwiz`, or Sysinternals Autologon) so a VPS reboot brings everything back.
- **Closing the RDP window** is fine (Disconnect). Do **not** "Sign out", that kills Chrome.
- If a VPS only gives you a locked screen after disconnect, Chrome still runs; just don't sign out.

## 4. Security
- Port 9222 is bound to 127.0.0.1 only. Never open it in the firewall.
- Restrict RDP (3389) to your own IP in the VPS firewall, use a strong password.
- `credentials.env`, `chrome-profile\`, `otp.json` hold secrets; never share them.

## 5. Watch these
- `logs\deposit.log` for `CRITICAL` / `UNRECONCILED` and `unreconciled.json`
  (portal confirmed, backend not: fix by hand).
- `logs\watchdog.log` shows automatic restarts.
- Run only ONE bot instance (start_bot.ps1 blocks a second one).
