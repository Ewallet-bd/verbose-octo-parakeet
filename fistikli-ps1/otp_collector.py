import time
import json
import os
import re
import sys
from playwright.sync_api import sync_playwright

from config import OTP_FILE, CDP_ENDPOINT, OTP_MAX_AGE, OTP_WAIT_TIMEOUT
from logger import setup_logger

# Named logger: importing this module must not hijack the root logger
# (main.py imports wait_for_new_otp from here).
_log = setup_logger("otp", "logs/otp_collector.log")


class _LogProxy:
    def __getattr__(self, name):
        return getattr(_log, name)


logging = _LogProxy()
REDDY_URL_PART = "web.reddy.team"

LAST_PROCESSED_OTP = None


# ================== Main Bot new otp wait ==================
def _write_otp_file(data: dict):
    """Atomic write so the reader never sees a half-written file."""
    tmp = OTP_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, OTP_FILE)


def invalidate_stale_otp():
    """Call right before triggering a login: any OTP saved earlier is stale."""
    try:
        if os.path.exists(OTP_FILE):
            with open(OTP_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("status") == "new":
                data["status"] = "used"
                _write_otp_file(data)
    except Exception as e:
        logging.warning(f"Could not invalidate old OTP: {e}")


def wait_for_new_otp(timeout: int = OTP_WAIT_TIMEOUT, since: float | None = None) -> str | None:
    """
    Wait for an OTP with status 'new' that is fresh.
    `since` = unix time of the login attempt; OTPs saved before it are ignored.
    """
    logging.info("🔄 Main Bot: Waiting for OTP from Collector...")
    start_time = time.time()
    since = since or start_time - OTP_MAX_AGE

    while time.time() - start_time < timeout:
        try:
            if os.path.exists(OTP_FILE):
                with open(OTP_FILE, 'r', encoding="utf-8") as f:
                    data = json.load(f)

                current_otp = str(data.get("otp", "")).strip()
                ts = data.get("timestamp") or 0

                if current_otp and data.get("status") == "new" and ts >= since:
                    data["status"] = "used"
                    _write_otp_file(data)
                    logging.info("✅ Main Bot: OTP Received")
                    return current_otp
        except json.JSONDecodeError:
            pass
        except Exception as e:
            logging.warning(f"Error reading OTP file: {e}")

        time.sleep(1)

    logging.warning(f"⏱️ Timeout: No OTP received in {timeout} seconds")
    return None


# ================== OTP Collection related functions ==================
def save_new_otp(otp_code: str):

    try:
        otp_code = otp_code.strip()
        otp_data = {
            "otp": otp_code,
            "timestamp": time.time(),
            "status": "new"
        }
        _write_otp_file(otp_data)
        logging.info("✅ [SAVED] Fresh OTP")
        return True
    except Exception as e:
        logging.error(f"Failed to save OTP: {e}")
        return False


def get_absolute_last_otp(page) -> str | None:

    try:
        messages = page.query_selector_all(".message__content__block")
        if not messages:
            logging.debug("❌ No message blocks found")
            return None


        last_msg_block = messages[-1]


        otp_element = last_msg_block.query_selector(".message-text span")
        if otp_element:
            text = otp_element.inner_text().strip()
            match = re.search(r'(?<![\d.,])\d{6}(?![\d.,])', text) or re.search(r'(?<![\d.,])\d{4,8}(?![\d.,])', text)
            if match:
                return match.group(0)


        fallback_text = last_msg_block.inner_text().strip()
        match = re.search(r'(?<![\d.,])\d{6}(?![\d.,])', fallback_text) or re.search(r'(?<![\d.,])\d{4,8}(?![\d.,])', fallback_text)
        if match:
            return match.group(0)

        return None

    except Exception as e:
        logging.debug(f"Extraction error: {e}")
        return None


def scroll_to_load_messages(page):

    try:
        for _ in range(4):
            page.evaluate("window.scrollTo(0, 0)")
            time.sleep(0.3)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.5)
        logging.debug("✓ Messages scrolled and loaded")
    except Exception as e:
        logging.warning(f"Scroll failed: {e}")


# ================== Collector Mode - standalone ্য ==================
def start_collector():

    global LAST_PROCESSED_OTP

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_ENDPOINT)
            context = browser.contexts[0]
            logging.info("✓ Connected to Chrome via CDP")

            # Reddy tab
            reddy_page = None
            for page in context.pages:
                if REDDY_URL_PART in page.url:
                    reddy_page = page
                    logging.info(f"✓ Reddy chat tab found: {page.url}")
                    break

            if not reddy_page:
                raise RuntimeError("Reddy tab not found! Keep the chat open in the browser.")


            scroll_to_load_messages(reddy_page)
            LAST_PROCESSED_OTP = get_absolute_last_otp(reddy_page)
            if LAST_PROCESSED_OTP:
                logging.info(f"🔍 Monitoring started. Ignoring existing OTP")
            else:
                logging.info("🔍 Monitoring started. No existing OTP found on screen.")

            logging.info("=" * 60)
            logging.info("🚀 OTP Collector ACTIVE - Scanning for new OTPs...")
            logging.info("=" * 60)

            errors = 0
            while True:
                try:
                    scroll_to_load_messages(reddy_page)
                    current_otp = get_absolute_last_otp(reddy_page)

                    if current_otp and current_otp != LAST_PROCESSED_OTP:
                        logging.info(f"")
                        logging.info(f"╔═══════════════════════════════════════╗")
                        logging.info(f"║ 🎯 NEW OTP DETECTED                ║")
                        logging.info(f"╚═══════════════════════════════════════╝")
                        logging.info(f"")

                        LAST_PROCESSED_OTP = current_otp
                        save_new_otp(current_otp)

                        logging.info(f"💾 Saved to otp.json")
                        logging.info(f"⏳ Waiting for Main Bot to submit...")
                        logging.info(f"")

                    time.sleep(2)

                except KeyboardInterrupt:
                    logging.info("⏹️ OTP Collector stopped by user")
                    raise
                except Exception as e:
                    errors += 1
                    logging.error(f"⚠️ Error in main loop: {e}")
                    if errors >= 5:
                        raise  # page/connection likely dead → reconnect
                    time.sleep(5)
                else:
                    errors = 0

        except KeyboardInterrupt:
            raise
        except Exception as e:
            logging.error(f"❌ Collector error: {e}")


# ================== Main Entry Point ==================
if __name__ == "__main__":

    # reconnect forever instead of exiting on CDP/tab errors
    while True:
        try:
            start_collector()
        except KeyboardInterrupt:
            break
        time.sleep(10)