import time
import os
from playwright.sync_api import TimeoutError
from logger import setup_logger
from config import (
    TH_URL_PART,
    TH_SIGNIN_URL,
    TH_PENDING_REFILL_URL,
    RELOGIN_DELAY
)
from otp_collector import wait_for_new_otp, invalidate_stale_otp
from dotenv import load_dotenv   # ✅ NEW

log = setup_logger("th_portal", "logs/th_portal.log")

# =========================
# FIND TH PAGE
# =========================
def find_th_page(context):
    for page in context.pages:
        if TH_URL_PART in page.url:
            return page
    return None


# =========================
# CREDENTIALS (ENV + .env)
# =========================
def get_credentials():
    """
    Credentials are loaded from credentials.env
    Works on Windows + Linux
    """

    load_dotenv("credentials.env")  # 🔥 THIS IS THE FIX

    username = os.getenv("TH_USERNAME")
    password = os.getenv("TH_PASSWORD")

    if not username or not password:
        raise RuntimeError(
            "❌ Missing credentials: TH_USERNAME / TH_PASSWORD not set"
        )

    return username, password


# =========================
# SAFE CLICK HELPER
# =========================
def safe_click(page, selector, timeout=5000):
    try:
        el = page.wait_for_selector(selector, timeout=timeout)
        page.evaluate("(el) => el.scrollIntoView()", el)
        el.click(force=True)
        return True
    except TimeoutError:
        log.warning(f"Element not found: {selector}")
    except Exception as e:
        log.warning(f"Click failed [{selector}]: {e}")
    return False


# =========================
# LOGIN
# =========================
def perform_login(th_page, username, password):
    try:
        # any OTP saved before this login attempt is stale
        invalidate_stale_otp()
        login_started = time.time()
        th_page.goto(TH_SIGNIN_URL, timeout=15000)

        th_page.wait_for_selector(
            "input[placeholder='Enter username']",
            timeout=15000
        )

        th_page.fill(
            "input[placeholder='Enter username']",
            username
        )
        th_page.fill(
            "input[placeholder='Enter password']",
            password
        )

        safe_click(th_page, "button:has-text('Log in')")
        log.info("Login button clicked")

        th_page.wait_for_selector(
            "input[placeholder='Enter confirmation code']",
            timeout=20000
        )

        time.sleep(5)

        otp = wait_for_new_otp(since=login_started)
        if not otp:
            log.error("OTP not received")
            return False

        th_page.fill(
            "input[placeholder='Enter confirmation code']",
            otp
        )
        safe_click(th_page, "button:has-text('Send')")

        th_page.wait_for_url(
            "**/en/admin/**",
            timeout=20000
        )

        log.info("Login successful")
        return True

    except Exception as e:
        log.error(f"Login failed: {e}")
        return False


# =========================
# GO TO PENDING REFILL
# =========================
def go_to_pending(th_page):
    try:
        if "pendingrequestrefill" in th_page.url:
            return True

        if "/en/admin/" not in th_page.url:
            return False

        links = th_page.query_selector_all(
            "a[href*='pendingrequestrefill']"
        )

        for link in links:
            try:
                if link.is_visible():
                    th_page.evaluate(
                        "(el) => el.scrollIntoView()",
                        link
                    )
                    with th_page.expect_navigation(timeout=15000):
                        link.click(force=True)
                    log.info("Navigated to Pending Refill")
                    return True
            except Exception:
                continue

        return False

    except Exception as e:
        log.error(f"go_to_pending error: {e}")
        return False


# =========================
# APPLY BUTTON CLICKER
# =========================
def click_apply_buttons(context):
    """
    Safe Apply button click for both deposit & withdraw pages
    """
    for page in context.pages:
        try:
            if (
                "pendingrequestrefill" in page.url
                or "pendingrequestwithdrawal" in page.url
            ):
                # never click while a modal is open (would hit modal buttons)
                if page.query_selector("div.modal_wrap[role='dialog']"):
                    continue
                btn = page.query_selector("button.btn.btn-success:has-text('Apply')")
                if btn and btn.is_visible():
                    page.evaluate(
                        "(el) => el.scrollIntoView()",
                        btn
                    )
                    btn.click(force=True)
                    log.debug(f"Apply clicked → {page.url}")
        except Exception as e:
            log.debug(f"Apply click skipped: {e}")
