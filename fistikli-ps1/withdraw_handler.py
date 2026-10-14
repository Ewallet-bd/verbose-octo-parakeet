import time
import re
import hashlib
import traceback

from logger import setup_logger
from api_client import call_api
from persistence import (
    load_withdraw_sent,
    save_withdraw_sent,
    load_pendingw,
    save_pendingw
)
from config import API_CONFIG

log = setup_logger("withdraw", "logs/withdraw.log")


def _request_key(row_text, bank_name, account_number, amount):
    """
    One key per withdraw REQUEST. Includes the whole normalized row text
    (date/time/request id shown by the portal), so the same user withdrawing
    the same amount twice is no longer treated as a duplicate.
    """
    norm = re.sub(r"\s+", " ", row_text).strip().lower()
    unique = f"{bank_name}|{account_number}|{amount}|{norm}"
    return hashlib.sha256(unique.encode("utf-8")).hexdigest()


# =====================================================
# Utility: get withdraw page
# =====================================================
def _get_withdraw_page(context):
    for page in context.pages:
        if "pendingrequestwithdrawal" in page.url:
            return page
    return None


def _scroll_table(page, times=6, delay=0.4):
    try:
        div = page.query_selector("div.table-vertical.scrollbar")
        if not div:
            return
        for _ in range(times):
            page.evaluate("el => el.scrollTop = el.scrollHeight", div)
            time.sleep(delay)
    except Exception:
        pass


# =====================================================
# Open Withdraw Tab (used after login)
# =====================================================
def handle_pending_withdraw(context):
    try:
        page = context.new_page()
        page.goto(
            "https://th-managment.com/en/admin/report/pendingrequestwithdrawal",
            timeout=15000
        )
        page.wait_for_load_state("networkidle", timeout=15000)
        log.info("Withdraw page opened")

        time.sleep(1)

        try:
            btn = page.query_selector("button.btn.btn-success")
            if btn and btn.is_visible():
                btn.click(force=True)
                log.info("Apply clicked on withdraw page")
        except Exception:
            pass

    except Exception as e:
        log.error(f"handle_pending_withdraw error: {e}")


# =====================================================
# SEND WITHDRAW → API (/bc/create)
# =====================================================
def send_withdraw_to_api(context):
    sent_hashes = load_withdraw_sent()
    page = _get_withdraw_page(context)

    if not page:
        return

    _scroll_table(page)

    rows = page.query_selector_all("tr")

    for row in rows:
        try:
            text = row.inner_text()
            if "Confirm" not in text:
                continue

            tds = row.query_selector_all("td")

            bank_name = next(
                (td.inner_text().strip() for td in tds
                 if any(x in td.inner_text() for x in ["Bkash", "Nagad", "Rocket", "#"])),
                ""
            )

            amount = None
            if len(tds) > 2:
                raw = re.sub(r"[^\d.]", "", tds[2].inner_text())
                if raw:
                    amt = float(raw)
                    if 50 <= amt <= 200000:
                        amount = int(amt)

            acc_match = re.search(r"Account number\s*[:\-\s]*([0-9]+)", text, re.I)
            account_number = acc_match.group(1) if acc_match else ""

            if not (bank_name and account_number and amount):
                continue

            h = _request_key(text, bank_name, account_number, amount)

            if h in sent_hashes:
                continue

            payload = {
                "bank_name": bank_name,
                "account_number": account_number,
                "amount": amount
            }

            log.info(f"📤 API CREATE → {bank_name} {amount}")

            resp = call_api(
                API_CONFIG["CREATE_WITHDRAW_URL"],
                payload
            )

            if resp.get("success"):
                sent_hashes.add(h)
                save_withdraw_sent(sent_hashes)
                log.info(f"✅ Withdraw CREATED → {bank_name} {amount}")
                page.wait_for_timeout(500)
                return

        except Exception as e:
            log.error(f"send_withdraw_to_api error: {e}")
            log.debug(traceback.format_exc())

    save_withdraw_sent(sent_hashes)


# =====================================================
# COMPLETE WITHDRAW (/complete-with-info)
# =====================================================
def auto_confirm_withdrawal_via_api(context):
    page = _get_withdraw_page(context)
    if not page:
        return

    _scroll_table(page)

    rows = page.query_selector_all("tr")

    for row in rows:
        try:
            text = row.inner_text()
            if "Confirm" not in text:
                continue

            tds = row.query_selector_all("td")

            bank_name = next(
                (td.inner_text().strip() for td in tds
                 if any(x in td.inner_text() for x in ["Bkash", "Nagad", "Rocket", "#"])),
                ""
            )

            amount = None
            if len(tds) > 2:
                raw = re.sub(r"[^\d.]", "", tds[2].inner_text())
                if raw:
                    amt = float(raw)
                    if 50 <= amt <= 200000:
                        amount = int(amt)

            acc_match = re.search(r"Account number\s*[:\-\s]*([0-9]+)", text, re.I)
            account_number = acc_match.group(1) if acc_match else ""

            if not (bank_name and account_number and amount):
                continue

            confirm_link = row.query_selector("a:has-text('Confirm')")
            if not (confirm_link and confirm_link.is_visible()):
                continue

            payload = {
                "bank_name": bank_name,
                "account_number": account_number,
                "amount": amount
            }

            log.info(f"📤 API COMPLETE → {bank_name} {amount}")

            resp = call_api(
                API_CONFIG["COMPLETE_WITHDRAW_URL"],
                payload
            )

            if not resp.get("success"):
                continue

            trx_id = resp.get("data", {}).get("transaction_id")
            if not trx_id:
                continue

            confirm_link.click(force=True)

            modal = page.wait_for_selector(
                "div.modal_wrap[role='dialog']",
                timeout=5000
            )

            comment_input = modal.query_selector("input[placeholder*='omment']")
            if comment_input:
                comment_input.fill(trx_id)

            modal.query_selector("button.btn-success").click(force=True)

            log.info(f"✅ WITHDRAW CONFIRMED → {bank_name} {amount} | TRX {trx_id}")
            page.wait_for_timeout(2000)
            return

        except Exception as e:
            log.error(f"auto_confirm_withdrawal_via_api error: {e}")
            log.debug(traceback.format_exc())


# =====================================================
# COLLECT → pendingw.json (SAFE)
# =====================================================
def collect_pending_withdraw_to_pendingw(context):
    page = _get_withdraw_page(context)
    if not page:
        return

    _scroll_table(page, times=10)

    existing = load_pendingw()
    existing_keys = {
        (e.get("user_id"), e.get("amount"), e.get("bank_name"))
        for e in existing
        if e.get("user_id")
    }

    rows = page.query_selector_all("tr")
    new_items = []

    for row in rows:
        try:
            text = row.inner_text()
            if "Confirm" not in text:
                continue

            tds = row.query_selector_all("td")

            bank_name = next(
                (td.inner_text().strip() for td in tds
                 if any(x in td.inner_text() for x in ["Bkash", "Nagad", "Rocket", "#"])),
                ""
            )

            amount = next(
                (td.inner_text().strip() for td in tds
                 if td.inner_text().strip().isdigit()),
                ""
            )

            user_id = next(
                (re.sub(r"[^\d]", "", td.inner_text())
                 for td in tds
                 if len(re.sub(r"[^\d]", "", td.inner_text())) >= 8),
                ""
            )

            acc_match = re.search(r"Account number\s*[:\-\s]*([0-9]+)", text, re.I)
            account_number = acc_match.group(1) if acc_match else ""

            if not (bank_name and amount and user_id):
                continue

            key = (user_id, amount, bank_name)
            if key in existing_keys:
                continue

            new_items.append({
                "bank_name": bank_name,
                "user_info": text[:300],
                "account_number": account_number,
                "amount": amount,
                "user_id": user_id,
                "status": "pending",
                "collected_at": time.strftime("%Y-%m-%d %H:%M:%S")
            })

            existing_keys.add(key)

        except Exception:
            continue

    if new_items:
        existing.extend(new_items)
        save_pendingw(existing)
        log.info(f"📥 Collected {len(new_items)} new withdraw requests")
