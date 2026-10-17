"""Photon iMessage. Placeholder: logs only, until we decide how to reach the spectrum-ts SDK."""
import logging

from .. import config

log = logging.getLogger("carecall.photon")


def send_message(text: str) -> bool:
    """Send a text to the caregiver. Returns True if it was sent."""
    if not config.ENABLE_PHOTON:
        log.info("photon disabled, would send: %s", text)
        return False
    log.warning("photon enabled but not implemented yet, did not send: %s", text)
    return False
