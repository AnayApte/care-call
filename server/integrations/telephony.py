"""Phone call escalation (contract L3), built by Anay with Rey's OK.

At ESCALATE_CALL_AFTER_S the server calls place_call(request). ElevenLabs' voice agent
dials the caregiver through a SIP trunk to Photon (sip.spectrum.photon.codes), so the
call comes from our Photon number. Raises on failure; the server never retries.

Needs: ELEVENLABS_API_KEY (with ElevenAgents write access), ELEVENLABS_AGENT_ID,
ELEVENLABS_AGENT_PHONE_NUMBER_ID (the imported Photon SIP number), CAREGIVER_PHONE.
"""
import logging
import os
from datetime import datetime, timezone

import httpx

from .. import config, store
from .photon import e164

log = logging.getLogger("carecall.telephony")


def place_call(request: dict) -> None:
    api_key = config.ELEVENLABS_API_KEY
    agent_id = os.environ.get("ELEVENLABS_AGENT_ID", "")
    number_id = os.environ.get("ELEVENLABS_AGENT_PHONE_NUMBER_ID", "")
    if not (api_key and agent_id and number_id and config.CAREGIVER_PHONES):
        raise RuntimeError("phone call not configured: need ELEVENLABS_AGENT_ID, "
                           "ELEVENLABS_AGENT_PHONE_NUMBER_ID, ELEVENLABS_API_KEY and CAREGIVER_PHONE")

    waited = int((datetime.now(timezone.utc) - store.parse_iso(request["created_at"])).total_seconds())
    first = (f"Hi, this is Care Call, calling about Maria. She said: {request['speech']} "
             f"Nobody has answered for {waited} seconds. Can you go to her now?")
    to = e164(config.CAREGIVER_PHONES[0])
    r = httpx.post(
        "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call",
        headers={"xi-api-key": api_key},
        json={"agent_id": agent_id, "agent_phone_number_id": number_id, "to_number": to,
              "conversation_initiation_client_data": {
                  "dynamic_variables": {"request_id": request["id"], "request_display": request["display"],
                                        "request_speech": request["speech"], "waited_seconds": waited},
                  "conversation_config_override": {"agent": {"first_message": first}}},
              "telephony_call_config": {"ringing_timeout_secs": 30}},
        timeout=30)
    if r.status_code != 200 or not r.json().get("success"):
        raise RuntimeError(f"ElevenLabs outbound call failed ({r.status_code}): {r.text[:300]}")
    log.info("call placed for %s: conversation %s", request["id"], r.json().get("conversation_id"))
