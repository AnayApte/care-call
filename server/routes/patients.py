from fastapi import APIRouter, Depends, HTTPException, Query

from .. import store
from ..deps import get_patient
from ..models import AdaptConfigIn, SampleIn
from ..adaptation import clean_settings

router = APIRouter(prefix="/api/patients")


@router.get("/{patient_id}")
def patient(p: dict = Depends(get_patient)):
    return p


@router.get("/{patient_id}/samples")
def samples(p: dict = Depends(get_patient)):
    return store.list_samples(p["id"])


@router.post("/{patient_id}/samples", status_code=201)
def add_sample(body: SampleIn, p: dict = Depends(get_patient)):
    return store.add_sample(p["id"], body.label, body.vector)


@router.delete("/{patient_id}/samples")
def reset_samples(p: dict = Depends(get_patient)):
    return {"deleted": store.delete_samples(p["id"])}


@router.get("/{patient_id}/adapt-config")
def get_adapt_config(p: dict = Depends(get_patient)):
    return store.get_adapt_config(p["id"])


@router.get("/{patient_id}/sessions")
def session_reports(p: dict = Depends(get_patient)):
    return store.recent_sessions(p["id"], 5)


@router.put("/{patient_id}/adapt-config")
def put_adapt_config(body: AdaptConfigIn, p: dict = Depends(get_patient),
                     expected_version: int | None = Query(default=None, ge=1)):
    """Called only when the caregiver taps Apply."""
    try:
        return store.set_adapt_config(p["id"], clean_settings(body.model_dump(exclude_none=True)), expected_version)
    except ValueError as exc:
        raise HTTPException(409, "Settings changed. Refresh and request a new suggestion.") from exc
