import json
import os
from logger import setup_logger
from config import (
    WITHDRAW_SENT_FILE,
    PENDING_WITHDRAW_FILE,
    PENDINGW_FILE
)

log = setup_logger("persistence", "logs/persistence.log")


# ==========================================
# WITHDRAW SENT HASH (withdraw_sent.json)
# ==========================================
class OrderedSet:
    """Insertion-ordered set so 'keep last 1000' really keeps the newest."""

    def __init__(self, items=()):
        self._d = dict.fromkeys(items)

    def add(self, x):
        self._d.pop(x, None)
        self._d[x] = None

    def __contains__(self, x):
        return x in self._d

    def __iter__(self):
        return iter(self._d)

    def __len__(self):
        return len(self._d)


def load_withdraw_sent():
    """
    Load already sent withdraw hashes
    """
    if os.path.exists(WITHDRAW_SENT_FILE):
        try:
            with open(WITHDRAW_SENT_FILE, "r", encoding="utf-8") as f:
                return OrderedSet(json.load(f))
        except (json.JSONDecodeError, IOError) as e:
            log.warning(f"Failed to load {WITHDRAW_SENT_FILE}: {e}")
            return OrderedSet()
    return OrderedSet()


def save_withdraw_sent(sent_hashes):
    """
    Save last 1000 withdraw hashes
    """
    try:
        hashes_to_save = list(sent_hashes)[-1000:]
        with open(WITHDRAW_SENT_FILE, "w", encoding="utf-8") as f:
            json.dump(hashes_to_save, f, ensure_ascii=False)
        log.debug(f"Saved {len(hashes_to_save)} withdraw hashes")
    except IOError as e:
        log.error(f"Failed to save {WITHDRAW_SENT_FILE}: {e}")


# ==========================================
# PENDING WITHDRAW (pending-withdraw.json)
# ==========================================
def save_pending_withdraw(data: list):
    """
    Save pending withdraw summary
    """
    try:
        with open(PENDING_WITHDRAW_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        log.info(f"Saved {len(data)} items → {PENDING_WITHDRAW_FILE}")
    except Exception as e:
        log.error(f"Failed to save pending withdraw: {e}")


def load_pending_withdraw():
    """
    Load pending withdraw summary
    """
    if not os.path.exists(PENDING_WITHDRAW_FILE):
        return []

    try:
        with open(PENDING_WITHDRAW_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"Failed to load {PENDING_WITHDRAW_FILE}: {e}")
        return []


# ==========================================
# PENDINGW (pendingw.json – detailed)
# ==========================================
def load_pendingw():
    """
    Load detailed pending withdraw list
    """
    if not os.path.exists(PENDINGW_FILE):
        return []

    try:
        with open(PENDINGW_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"Failed to load {PENDINGW_FILE}: {e}")
        return []


def save_pendingw(data: list):
    """
    Save detailed pending withdraw list
    """
    try:
        with open(PENDINGW_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        log.info(f"Saved {len(data)} items → {PENDINGW_FILE}")
    except Exception as e:
        log.error(f"Failed to save pendingw: {e}")


# ==========================================
# UNRECONCILED DEPOSITS (portal confirmed, backend confirm failed)
# ==========================================
UNRECONCILED_FILE = "unreconciled.json"


def save_unreconciled(job: dict):
    """Append a job that needs manual reconciliation."""
    try:
        items = []
        if os.path.exists(UNRECONCILED_FILE):
            with open(UNRECONCILED_FILE, "r", encoding="utf-8") as f:
                items = json.load(f)
        items.append({k: v for k, v in job.items()})
        tmp = UNRECONCILED_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
        os.replace(tmp, UNRECONCILED_FILE)
    except Exception as e:
        log.error(f"Failed to save unreconciled job: {e}")
