"""CREAO adaptation routes (contract section 19). Step 1 stubs; real plumbing in step 3."""
from fastapi import APIRouter

from ..deps import get_patient
from ..models import AdaptRunIn, HandoffIn

router = APIRouter()


@router.post("/api/cv/sessions", status_code=201)
def store_session(body: dict):
    return {"ok": True}


@router.post("/api/adapt/run", status_code=202)
def adapt_run(body: AdaptRunIn):
    get_patient(body.patient_id)
    return {"job_id": "stub"}


@router.get("/api/adapt/{job_id}")
def adapt_status(job_id: str):
    # Never invent a proposal: the stub always reports failure.
    return {"status": "failed", "proposal": None, "explanation_md": None}


@router.post("/api/reports/handoff", status_code=202)
def handoff_run(body: HandoffIn):
    get_patient(body.patient_id)
    return {"job_id": "stub"}


@router.get("/api/reports/handoff/{job_id}")
def handoff_status(job_id: str):
    return {"status": "failed", "summary_md": None}
