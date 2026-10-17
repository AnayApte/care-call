"""Escalation timer (contract section 10).

0 s: request exists, beacon alerts (device state), bedside speaks (web).
ESCALATE_MESSAGE_AFTER_S: iMessage, if ENABLE_PHOTON.
ESCALATE_CALL_AFTER_S: phone call, if ENABLE_PHONE_CALL.
An ack stops everything: each step re-checks the request is still open, and
store.claim_escalation lets only one caller ever run a step, so nothing is sent twice.
"""
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from . import config, store
from .integrations import photon

log = logging.getLogger("carecall.escalation")


def _message_text(req: dict) -> str:
    return (f"Maria needs: {req['display']}. \"{req['speech']}\"\n"
            "Nobody has answered the bedside alert yet. Tap On my way below, or reply 1.")


def _send_message(request_id: str) -> None:
    req = store.get_request(request_id)
    if not req or req["status"] != "open" or not config.ENABLE_PHOTON:
        return
    if store.claim_escalation(request_id, 1):
        log.info("escalation.message %s", request_id)
        try:
            photon.send_message(_message_text(req), req["id"], f"Maria needs: {req['display']}")
        except Exception:
            log.exception("escalation.message failed for %s", request_id)


def _place_call(request_id: str) -> None:
    req = store.get_request(request_id)
    if not req or req["status"] != "open" or not config.ENABLE_PHONE_CALL:
        return
    try:
        # Rey owns telephony.py; its interface is not in the contract yet.
        from .integrations import telephony  # type: ignore[attr-defined]
    except ImportError:
        log.warning("escalation.call skipped for %s: integrations/telephony.py does not exist yet", request_id)
        return
    if store.claim_escalation(request_id, 2):
        log.info("escalation.call %s", request_id)
        try:
            telephony.place_call(req)
        except Exception:
            log.exception("escalation.call failed for %s", request_id)


def acknowledge(request_id: str, by: str) -> Optional[dict]:
    """Ack from any channel. If the caregiver was already texted, tell them it is handled."""
    before = store.get_request(request_id)
    req = store.ack_request(request_id, by)
    if before and req and before["status"] == "open" and req["escalation_level"] >= 1 and by != "imessage":
        seconds = round((req["ack_latency_ms"] or 0) / 1000)
        text = f"Update: {req['display']} was answered ({by}) after {seconds} s. No need to come."
        threading.Thread(target=photon.send_message, args=(text,), daemon=True).start()
    return req


def _after(seconds: float, fn, request_id: str) -> None:
    timer = threading.Timer(max(seconds, 0), fn, args=(request_id,))
    timer.daemon = True
    timer.start()


def start(req: dict) -> None:
    """Schedule the remaining escalation steps for an open request."""
    age = (datetime.now(timezone.utc) - store.parse_iso(req["created_at"])).total_seconds()
    if req["escalation_level"] < 1:
        _after(config.ESCALATE_MESSAGE_AFTER_S - age, _send_message, req["id"])
    if req["escalation_level"] < 2:
        _after(config.ESCALATE_CALL_AFTER_S - age, _place_call, req["id"])


def resume_all() -> None:
    """After a restart, pick up open requests where they left off."""
    for req in store.open_requests():
        start(req)
