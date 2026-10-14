import json
import hashlib
import requests
import urllib3
from logger import setup_logger
from config import API_CONFIG

log = setup_logger("api", "logs/api.log")

if not API_CONFIG.get("VERIFY_SSL", True):
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def normalize_amount(payload: dict):
    """
    Keep amount type consistent with your original logic
    """
    if "amount" not in payload:
        return payload

    try:
        amount_float = float(payload["amount"])
        payload["amount"] = int(amount_float) if amount_float.is_integer() else amount_float
    except Exception:
        log.error("Invalid amount format in payload")
        raise ValueError("Invalid amount format")

    return payload


def call_api(url: str, payload: dict):
    """
    Universal API caller
    - SHA256 payload hash
    - API KEY header
    - JSON body
    """

    response = None
    try:
        if not API_CONFIG.get("API_KEY"):
            raise RuntimeError("FISTIKLI_API_KEY is not set")

        payload = normalize_amount(dict(payload))

        json_payload = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":")
        )

        hash_value = hashlib.sha256(json_payload.encode("utf-8")).hexdigest()

        headers = {
            "Content-Type": "application/json",
            "X-API-KEY": API_CONFIG["API_KEY"],
            "X-PAYLOAD-HASH": hash_value
        }

        log.info(f"API → {url} | Payload={json_payload} | Hash={hash_value[:10]}...")

        response = requests.post(
            url,
            data=json_payload.encode("utf-8"),
            headers=headers,
            timeout=15,
            verify=API_CONFIG.get("VERIFY_SSL", True)
        )

        response.raise_for_status()
        return response.json()

    except requests.exceptions.RequestException as e:
        error_body = ""
        status = None
        if response is not None:
            status = response.status_code
            error_body = response.text[:200]

        log.error(f"API FAILED → {url} | {e} | Body={error_body}")
        return {
            "success": False,
            "status_code": status,
            "message": str(e)
        }

    except Exception as e:
        log.error(f"Unexpected API error → {url} | {e}")
        return {
            "success": False,
            "message": f"Unexpected error: {e}"
        }
