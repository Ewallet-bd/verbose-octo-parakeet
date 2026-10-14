# ===============================
# GLOBAL CONFIGURATION FILE
# ===============================
import os
from dotenv import load_dotenv

load_dotenv("credentials.env")

# ---------- TH PORTAL ----------
TH_URL_PART = "th-managment.com"
TH_SIGNIN_URL = "https://th-managment.com/signin/"
TH_PENDING_REFILL_URL = "https://th-managment.com/en/admin/report/pendingrequestrefill"
TH_PENDING_WITHDRAW_URL = "https://th-managment.com/en/admin/report/pendingrequestwithdrawal"

# ---------- OTP ----------
OTP_FILE = "otp.json"
OTP_WAIT_TIMEOUT = 90         # seconds
OTP_MAX_AGE = 120             # ignore OTPs older than this (seconds)

# ---------- FILE STORAGE ----------
PENDING_WITHDRAW_FILE = "pending-withdraw.json"
PENDINGW_FILE = "pendingw.json"
WITHDRAW_SENT_FILE = "withdraw_sent.json"

# ---------- PLAYWRIGHT ----------
CDP_ENDPOINT = "http://127.0.0.1:9222"

# ---------- TIMING CONFIG ----------
API_CHECK_INTERVAL = 5        # 🔁 Deposit scan every 5 seconds
APPLY_CLICK_INTERVAL = 5      # 🖱 Apply button click every 5 seconds
RELOGIN_DELAY = 10            # ⏳ Prevent login spam
MAIN_LOOP_SLEEP = 0.2         # ⚡ Fast but safe loop

# ---------- API CONFIG ----------
API_CONFIG = {
    "CHECK_URL": "https://fistikli.smsbd.io/api/v1/bot/check-payout",
    "CONFIRM_URL": "https://fistikli.smsbd.io/api/v1/bot/confirm-payout",
    "CREATE_WITHDRAW_URL": "https://fistikli.smsbd.io/api/v1/bot/bc/create",
    "COMPLETE_WITHDRAW_URL": "https://fistikli.smsbd.io/api/v1/bot/bc/complete-with-info",

    # Loaded from credentials.env / environment (never hardcode)
    "API_KEY": os.getenv("FISTIKLI_API_KEY", ""),
    # Set FISTIKLI_VERIFY_SSL=0 only for debugging
    "VERIFY_SSL": os.getenv("FISTIKLI_VERIFY_SSL", "1") != "0"
}

# ---------- BUSINESS RULES ----------
DEPOSIT_MIN_AMOUNT = 100
DEPOSIT_MAX_AMOUNT = 30000

WITHDRAW_MIN_AMOUNT = 200
WITHDRAW_MAX_AMOUNT = 30000

# ---------- CHECK-PAYOUT BACKOFF (404 = no pending payout yet) ----------
CHECK_BACKOFF_STEPS = [5, 15, 30, 60, 120]   # seconds between re-checks per tx
TX_FORGET_AFTER = 3600                        # drop per-tx state after 1h

# ---------- SCAN SPEED ----------
CHECK_WORKERS = 5             # parallel check-payout calls
CHECK_TIMEOUT = 8             # seconds per check-payout call
MAX_CHECKS_PER_SCAN = 15      # remaining rows are picked up on the next scan
