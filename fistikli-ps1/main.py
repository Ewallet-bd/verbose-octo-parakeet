#!/usr/bin/env python3
import time

from playwright.sync_api import sync_playwright

from logger import setup_logger
from config import (
    CDP_ENDPOINT,
    API_CHECK_INTERVAL,
    APPLY_CLICK_INTERVAL,
    RELOGIN_DELAY,
    MAIN_LOOP_SLEEP
)

from th_portal import (
    find_th_page,
    get_credentials,
    perform_login,
    go_to_pending,
    click_apply_buttons
)

from deposit_handler import auto_confirm_deposit_via_api

# ❗ Withdraw imports kept for future (NOT USED NOW)
from withdraw_handler import handle_pending_withdraw, _get_withdraw_page

# ---------------- LOGGER ----------------
log = setup_logger("main", "logs/main.log")



def main():
    username, password = get_credentials()

    log.info("Connecting to Chrome via CDP...")
    log.info(f"CDP_ENDPOINT = {CDP_ENDPOINT}")

    with sync_playwright() as p:
        # 🔥 Connect to existing Chrome (9222)
        browser = p.chromium.connect_over_cdp(CDP_ENDPOINT)

        # 🔒 SAFE CONTEXT SELECT (Windows critical)
        if not browser.contexts:
            raise RuntimeError("❌ No browser contexts found. Is Chrome opened with --remote-debugging-port=9222 ?")

        context = browser.contexts[0]
        log.info(f"Connected to browser. Contexts: {len(browser.contexts)}")

        # 🔍 Find TH page
        th_page = find_th_page(context)
        if not th_page:
            raise RuntimeError("❌ TH page not found. Open https://th-managment.com manually in Chrome first!")

        last_url = ""
        last_login_attempt = 0
        login_failures = 0
        last_api_call_time = 0
        last_apply_click_time = 0

        log.info("🚀 Main bot started (DEPOSIT ONLY MODE)")
        log.info("⚡ Apply click interval: %ss | Deposit API interval: %ss",
                 APPLY_CLICK_INTERVAL, API_CHECK_INTERVAL)

        while True:
            try:
                now = time.time()

                # ---------- STALE PAGE RECOVERY ----------
                if th_page.is_closed():
                    log.warning("TH page closed. Searching for another TH tab...")
                    th_page = find_th_page(context)
                    if not th_page:
                        log.error("No TH tab open. Retrying in 10s...")
                        time.sleep(10)
                        continue

                current_url = th_page.url.strip()

                # ---------- URL CHANGE LOG ----------
                if current_url != last_url:
                    log.info(f"URL → {current_url}")
                    last_url = current_url

                # ---------- LOGIN HANDLING ----------
                # delay grows after each failed attempt (avoids OTP spam / lockout)
                if "signin" in current_url:
                    delay = min(RELOGIN_DELAY * (2 ** login_failures), 300)
                    if now - last_login_attempt > delay:
                        log.warning("Logout detected. Re-login...")
                        last_login_attempt = time.time()
                        if perform_login(th_page, username, password):
                            login_failures = 0
                            # open withdraw tab only if not already open (no tab leak)
                            if not _get_withdraw_page(context):
                                handle_pending_withdraw(context)
                        else:
                            login_failures += 1
                            log.error("Login failed (%d in a row). Next try in %ss",
                                      login_failures,
                                      min(RELOGIN_DELAY * (2 ** login_failures), 300))

                # ---------- APPLY BUTTON (GLOBAL) ----------
                if now - last_apply_click_time >= APPLY_CLICK_INTERVAL:
                    click_apply_buttons(context)
                    last_apply_click_time = now

                # ---------- DEPOSIT API (FAST LOOP) ----------
                if now - last_api_call_time >= API_CHECK_INTERVAL:
                    refill_page = next(
                        (pg for pg in context.pages if "pendingrequestrefill" in pg.url),
                        None
                    )
                    if refill_page:
                        auto_confirm_deposit_via_api(refill_page)
                    last_api_call_time = time.time()

                # ---------- AUTO NAV TO PENDING ----------
                # only when no refill tab exists (don't yank the operator around)
                if (
                    "/en/admin/" in current_url
                    and "pending" not in current_url
                    and not any("pendingrequestrefill" in pg.url for pg in context.pages)
                ):
                    go_to_pending(th_page)

                time.sleep(MAIN_LOOP_SLEEP)

            except KeyboardInterrupt:
                log.info("🛑 Bot stopped by user (CTRL+C)")
                break

            except Exception as e:
                log.error(f"❌ Main loop error: {e}", exc_info=True)
                time.sleep(5)

        # connected over CDP: just drop the connection, never close the user's Chrome
        log.info("Disconnecting from browser (Chrome stays open)...")


if __name__ == "__main__":
    main()
