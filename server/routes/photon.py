"""Inbound iMessage from the Photon bridge (contract section 10, "Photon inbound")."""
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .. import config, escalation, store
from ..integrations import gemini, photon

router = APIRouter()

ACK_WORDS = ("1", "ok", "ack", "on my way")
HELP_TEXT = "Reply 1 or \"on my way\" to answer Maria's request, or \"status\" to see what is open."


class InboundIn(BaseModel):
    text: str
    request_id: Optional[str] = None  # set when the caregiver tapped a poll option
    from_: str = Field(default="", alias="from")


def _age(req: dict) -> str:
    s = int((datetime.now(timezone.utc) - store.parse_iso(req["created_at"])).total_seconds())
    return f"{s} s" if s < 120 else f"{s // 60} min"


def handle(text: str, request_id: Optional[str]) -> str:
    t = text.strip().lower()
    if t.startswith(ACK_WORDS):
        req = store.get_request(request_id) if request_id else None
        if not req or req["status"] != "open":
            req = store.latest_open_request()
        if not req:
            return "Nothing is open right now. Maria is okay."
        req = escalation.acknowledge(req["id"], "imessage")
        return f"Thanks. {req['display']} is marked as handled. Maria will hear \"Help is coming.\""
    if t.startswith("can't come") or t.startswith("cant come"):
        return "Okay. The alert stays open and the next step will still go out."
    if t.startswith("status"):
        open_reqs = store.open_requests()
        if not open_reqs:
            return "Nothing is open right now."
        lines = [f"- {r['display']} ({_age(r)} ago)" for r in open_reqs]
        return "Open requests:\n" + "\n".join(lines)
    # Free-text questions go to Gemini with the last 24 hours as context (contract section 10).
    return gemini.answer(text) or HELP_TEXT


@router.post("/api/webhooks/photon")
def photon_webhook(body: InboundIn, x_bridge_secret: str = Header(default="")):
    if not config.BRIDGE_SECRET or not secrets.compare_digest(x_bridge_secret, config.BRIDGE_SECRET):
        raise HTTPException(401, "bad or missing X-Bridge-Secret")
    if not photon.is_caregiver(body.from_):
        return {"reply": None}
    return {"reply": handle(body.text, body.request_id)}


class CallAckIn(BaseModel):
    request_id: Optional[str] = None


@router.post("/api/webhooks/call")
def call_ack(body: CallAckIn, x_bridge_secret: str = Header(default="")):
    """ElevenLabs agent tool: the caregiver said on the phone that they are going. Acks with by="call"."""
    if not config.BRIDGE_SECRET or not secrets.compare_digest(x_bridge_secret, config.BRIDGE_SECRET):
        raise HTTPException(401, "bad or missing X-Bridge-Secret")
    req = store.get_request(body.request_id) if body.request_id else None
    if not req or req["status"] != "open":
        req = store.latest_open_request()
    if not req:
        return {"ok": True, "message": "Nothing is open any more. Someone already answered."}
    req = escalation.acknowledge(req["id"], "call")
    return {"ok": True, "message": f"Marked {req['display']} as handled. Maria will hear that help is coming."}
