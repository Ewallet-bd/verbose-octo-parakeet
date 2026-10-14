import time
import re
import random
from concurrent.futures import ThreadPoolExecutor
from collections import deque
from logger import setup_logger
from api_client import call_api
from persistence import save_unreconciled
from config import (
    API_CONFIG,
    DEPOSIT_MIN_AMOUNT,
    DEPOSIT_MAX_AMOUNT,
    CHECK_BACKOFF_STEPS,
    TX_FORGET_AFTER,
    CHECK_WORKERS,
    CHECK_TIMEOUT,
    MAX_CHECKS_PER_SCAN,
)

log = setup_logger("deposit", "logs/deposit.log")

# ======================================================
# GLOBAL STATE
# ======================================================
CONFIRMATION_QUEUE = deque()
PROCESSING_TX = set()      # queued or in-flight
DONE_TX = set()            # finished (completed / given up) - never re-queued
MAX_RETRY = 5              # UI-stage retries
MAX_API_RETRY = 10         # backend confirm retries once the UI step is done

# ext_trn_id -> {"first_seen", "next_check", "step"}
# Replaces the old "5 min then PERMANENT BLOCK" TTL: a tx whose payout is not
# found yet is re-checked with growing delays instead of being blocked forever.
TX_STATE = {}

ID_RE = re.compile(r"ext_trn_id\s*([A-Za-z0-9]+)")
AMOUNT_RE = re.compile(r"^\d{1,7}(\.\d{1,2})?$")   # excludes phone numbers / IDs
MODAL = "div.modal_wrap[role='dialog']"


# ======================================================
# HELPERS
# ======================================================
def _row_ext_id(row):
    """Exact ext_trn_id of a row (None if the row has none)."""
    info_cell = row.query_selector("td:has-text('ext_trn_id')")
    if not info_cell:
        return None
    m = ID_RE.search(info_cell.inner_text())
    return m.group(1).strip() if m else None


def _find_row(page, ext_trn_id):
    """Exact-match row lookup (no substring / nested <tr> mix-ups)."""
    for row in page.query_selector_all("tr"):
        try:
            if _row_ext_id(row) == ext_trn_id:
                return row
        except Exception:
            continue
    return None


def _scrape_amount(row):
    for td in row.query_selector_all("td"):
        txt = re.sub(r"[\s,]+", "", td.inner_text().strip())
        if AMOUNT_RE.match(txt):
            return float(txt)
    return None


def _check_due(ext_trn_id, now):
    """Backoff gate for the check-payout API. Returns True if we may call it."""
    st = TX_STATE.get(ext_trn_id)
    if st is None:
        TX_STATE[ext_trn_id] = {"first_seen": now, "next_check": 0, "step": 0}
        return True
    return now >= st["next_check"]


def _check_failed(ext_trn_id, now):
    st = TX_STATE[ext_trn_id]
    delay = CHECK_BACKOFF_STEPS[min(st["step"], len(CHECK_BACKOFF_STEPS) - 1)]
    st["step"] += 1
    st["next_check"] = now + delay


def _cleanup_state(now):
    for k in [k for k, v in TX_STATE.items() if now - v["first_seen"] > TX_FORGET_AFTER]:
        TX_STATE.pop(k, None)
        DONE_TX.discard(k)


def _finish(ext_trn_id):
    PROCESSING_TX.discard(ext_trn_id)
    DONE_TX.add(ext_trn_id)


# ======================================================
# STEP 1+2: SCAN & QUEUE
# ======================================================
def _scan_and_queue(th_page):
    try:
        table_div = th_page.query_selector("div.table-vertical.scrollbar")
        if table_div:
            prev_height = 0
            for _ in range(5):
                th_page.evaluate("el => el.scrollTop = el.scrollHeight", table_div)
                time.sleep(0.3)
                height = th_page.evaluate("el => el.scrollHeight", table_div)
                if height == prev_height:
                    break
                prev_height = height
    except Exception as e:
        log.warning(f"Scroll failed: {e}")

    now = time.time()
    _cleanup_state(now)

    # ---------- phase 1: cheap DOM read, pick candidates ----------
    candidates = []
    for row in th_page.query_selector_all("tr"):
        if len(candidates) >= MAX_CHECKS_PER_SCAN:
            break  # rest are handled on the next scan
        try:
            confirm_btn = row.query_selector("a:has-text('Confirm')")
            if not confirm_btn or not confirm_btn.is_visible():
                continue

            ext_trn_id = _row_ext_id(row)
            if not ext_trn_id:
                continue

            # full token is captured now, so a lowercase char means a foreign ID
            if any(c.islower() for c in ext_trn_id):
                continue

            if (
                ext_trn_id in DONE_TX
                or ext_trn_id in PROCESSING_TX
                or any(q["ext_trn_id"] == ext_trn_id for q in CONFIRMATION_QUEUE)
                or any(c[0] == ext_trn_id for c in candidates)
            ):
                continue

            if not _check_due(ext_trn_id, now):
                continue

            scraped_amount = _scrape_amount(row)
            if scraped_amount is None:
                continue

            candidates.append((ext_trn_id, scraped_amount))

        except Exception as e:
            log.error(f"Scan error: {e}")

    if not candidates:
        return

    # ---------- phase 2: API checks in parallel (no Playwright in threads) ----------
    def _check(item):
        return call_api(
            API_CONFIG["CHECK_URL"],
            {"transaction_id": item[0]},
            timeout=CHECK_TIMEOUT,
        )

    with ThreadPoolExecutor(max_workers=min(CHECK_WORKERS, len(candidates))) as ex:
        responses = list(ex.map(_check, candidates))

    # ---------- phase 3: validate + queue ----------
    for (ext_trn_id, scraped_amount), check_resp in zip(candidates, responses):
        try:
            if not (check_resp.get("success") or check_resp.get("status") == "processing"):
                _check_failed(ext_trn_id, time.time())
                continue

            api_data = check_resp.get("data") or {}
            payout_id = api_data.get("payout_id")

            try:
                api_amount = float(api_data.get("amount", 0))
            except (TypeError, ValueError):
                log.error(f"❌ Bad amount from API for {ext_trn_id}: {api_data.get('amount')}")
                _check_failed(ext_trn_id, time.time())
                continue

            if not payout_id:
                log.error(f"❌ Missing payout_id for {ext_trn_id}")
                _check_failed(ext_trn_id, time.time())
                continue

            if not (DEPOSIT_MIN_AMOUNT <= api_amount <= DEPOSIT_MAX_AMOUNT):
                log.error(f"❌ SECURITY BLOCK {ext_trn_id} AMT={api_amount}")
                _check_failed(ext_trn_id, time.time())
                continue

            CONFIRMATION_QUEUE.append({
                "ext_trn_id": ext_trn_id,
                "payout_id": payout_id,
                "api_amount": api_amount,
                "scraped_amount": scraped_amount,
                "comment": "AA" if api_amount != scraped_amount else "",
                "retry": 0,
                "ui_done": False,      # portal confirm already submitted?
                "api_retry": 0,
                "not_before": 0,
            })
            PROCESSING_TX.add(ext_trn_id)
            log.info(f"➕ QUEUED {ext_trn_id} | Queue={len(CONFIRMATION_QUEUE)}")

        except Exception as e:
            log.error(f"Queue error {ext_trn_id}: {e}")


# ======================================================
# STEP 3a: PORTAL (UI) CONFIRM
# ======================================================
def _ui_confirm(th_page, job):
    """Returns True once the portal confirm was submitted."""
    curr_id = job["ext_trn_id"]

    # make sure no stale modal is open from an earlier failure
    if th_page.query_selector(MODAL):
        th_page.keyboard.press("Escape")
        time.sleep(0.5)

    row = _find_row(th_page, curr_id)
    if row is None:
        raise Exception("Row not found (page refresh?)")

    btn = row.query_selector("a:has-text('Confirm')")
    if not btn or not btn.is_visible():
        raise Exception("Confirm button hidden")

    btn.click(force=True)
    th_page.wait_for_selector(MODAL, state="visible", timeout=9000)

    modal = th_page.locator(MODAL)
    modal.locator("input[placeholder='Amount']").fill(str(job["api_amount"]))
    if job["comment"]:
        modal.locator("input[placeholder='Comment']").fill(job["comment"])

    modal.locator("button.btn-success").click()

    try:
        th_page.wait_for_selector(MODAL, state="hidden", timeout=10000)
    except Exception:
        # Ambiguous: submit may have gone through. If the row is gone the
        # portal accepted it, so do NOT click again.
        if _find_row(th_page, curr_id) is None:
            log.warning(f"Modal slow but row {curr_id} is gone → treating as submitted")
        else:
            raise

    time.sleep(random.uniform(1, 2))
    return True


# ======================================================
# STEP 3b: SERIAL EXECUTION (one job per call → main loop stays responsive)
# ======================================================
def _pop_ready_job():
    now = time.time()
    for _ in range(len(CONFIRMATION_QUEUE)):
        job = CONFIRMATION_QUEUE.popleft()
        if job["not_before"] <= now:
            return job
        CONFIRMATION_QUEUE.append(job)
    return None


def _process_one(th_page):
    job = _pop_ready_job()
    if job is None:
        return

    curr_id = job["ext_trn_id"]
    log.info(f"🎯 PROCESSING {curr_id}" + (" (API stage only)" if job["ui_done"] else ""))

    # ---------- UI stage ----------
    if not job["ui_done"]:
        try:
            job["ui_done"] = _ui_confirm(th_page, job)
        except Exception as e:
            job["retry"] += 1
            log.error(f"⚠️ ERROR {curr_id} retry={job['retry']} | {e}")
            try:
                th_page.keyboard.press("Escape")
            except Exception:
                pass

            # Row vanished with no submit on our side: someone else handled it.
            if "Row not found" in str(e) and job["retry"] >= 3:
                log.error(f"❌ GIVING UP {curr_id}: row gone, not confirmed by bot")
                _finish(curr_id)
            elif job["retry"] <= MAX_RETRY:
                job["not_before"] = time.time() + 1
                CONFIRMATION_QUEUE.append(job)
                log.info(f"🔁 REQUEUED {curr_id}")
            else:
                log.error(f"❌ FAILED AFTER RETRY {curr_id}")
                _finish(curr_id)
            return

    # ---------- backend confirm stage (never touches the UI again) ----------
    confirm_resp = call_api(API_CONFIG["CONFIRM_URL"], {"payout_id": job["payout_id"]})

    if confirm_resp.get("success"):
        log.info(f"✅ COMPLETED {curr_id}")
        _finish(curr_id)
        return

    job["api_retry"] += 1
    log.error(f"⚠️ CONFIRM API FAILED {curr_id} try={job['api_retry']} | {confirm_resp.get('message')}")

    if job["api_retry"] < MAX_API_RETRY:
        job["not_before"] = time.time() + min(10 * job["api_retry"], 60)
        CONFIRMATION_QUEUE.append(job)
    else:
        # portal is confirmed but backend isn't: persist for manual reconcile
        log.critical(f"🚨 UNRECONCILED {curr_id} payout_id={job['payout_id']} "
                     f"(portal confirmed, backend NOT) → unreconciled.json")
        save_unreconciled(job)
        _finish(curr_id)


def auto_confirm_deposit_via_api(th_page):
    _scan_and_queue(th_page)
    _process_one(th_page)
