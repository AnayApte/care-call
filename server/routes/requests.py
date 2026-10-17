from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException

from .. import escalation, store
from ..deps import get_patient
from ..models import AckIn, FeedbackIn, RequestIn

router = APIRouter(prefix="/api/requests")


@router.post("", status_code=201)
def create_request(body: RequestIn):
    patient = get_patient(body.patient_id)
    labels = {w["label"] for w in patient["vocabulary"]}
    if body.label not in labels:
        raise HTTPException(422, f"label must be one of {sorted(labels)} (never neutral)")
    req = store.create_request(body.patient_id, body.label, body.confidence, body.source)
    escalation.start(req)
    return req


@router.get("")
def list_requests(patient_id: Optional[str] = None, since: Optional[str] = None):
    since_dt: Optional[datetime] = None
    if since:
        try:
            since_dt = store.parse_iso(since)
        except ValueError:
            raise HTTPException(422, "since must be an ISO 8601 timestamp")
    return store.list_requests(patient_id, since_dt)


@router.post("/{request_id}/ack")
def ack(request_id: str, body: AckIn):
    req = store.ack_request(request_id, body.by)
    if req is None:
        raise HTTPException(404, f"unknown request {request_id}")
    return req


@router.post("/{request_id}/feedback", status_code=201)
def feedback(request_id: str, body: FeedbackIn):
    fb = store.add_feedback(request_id, body.correct)
    if fb is None:
        raise HTTPException(404, f"unknown request {request_id}")
    return fb
