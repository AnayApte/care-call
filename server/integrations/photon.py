"""Photon iMessage, through the local bridge in server/photon-bridge (spectrum-ts is TypeScript only)."""
import logging
import re
from typing import Optional

import httpx

from .. import config

log = logging.getLogger("carecall.photon")


def e164(phone: str) -> str:
    """'+1 (555) 123-4567' or '5551234567' -> '+15551234567' (US default)."""
    digits = re.sub(r"\D", "", phone)
    return f"+1{digits}" if len(digits) == 10 else f"+{digits}"


def send_message(text: str, request_id: Optional[str] = None, poll_title: Optional[str] = None) -> bool:
    """Text every caregiver, optionally followed by an "On my way" / "Can't come" poll. True if sent."""
    if not config.ENABLE_PHOTON:
        log.info("photon disabled, would send: %s", text)
        return False
    if not config.CAREGIVER_PHONES:
        log.warning("photon enabled but CAREGIVER_PHONE is empty, did not send: %s", text)
        return False
    try:
        r = httpx.post(f"{config.PHOTON_BRIDGE_URL}/send", timeout=20,
                       headers={"X-Bridge-Secret": config.BRIDGE_SECRET},
                       json={"to": [e164(p) for p in config.CAREGIVER_PHONES], "text": text,
                             "request_id": request_id, "poll_title": poll_title})
        r.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        log.error("photon send failed: %s", exc)
        return False


def _digits(handle: str) -> str:
    return re.sub(r"\D", "", handle)[-10:]


def is_caregiver(handle: str) -> bool:
    """Only listed caregivers can ack or ask for status. Compares the last 10 digits."""
    return bool(_digits(handle)) and any(_digits(handle) == _digits(p) for p in config.CAREGIVER_PHONES)
