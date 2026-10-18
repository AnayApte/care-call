from fastapi import APIRouter, Depends, HTTPException, Query

from .. import store
from ..deps import get_patient
from ..models import AdaptConfigIn, SampleIn, SampleBatchIn, VocabularyIn, LiveSessionIn
from ..adaptation import clean_settings

router = APIRouter(prefix="/api/patients")


@router.get("/{patient_id}")
def patient(p: dict = Depends(get_patient)):
    return p


@router.post("/{patient_id}/vocabulary", status_code=201)
def add_word(body: VocabularyIn, p: dict = Depends(get_patient)):
    """Adds a request word after onboarding. Returns the updated patient."""
    if not store.add_word(p["id"], body.label, body.display, body.speech):
        raise HTTPException(409, f"{body.label} is already a word")
    return {**p, "vocabulary": store.vocabulary(p["id"])}


@router.delete("/{patient_id}/vocabulary")
def clear_vocabulary(p: dict = Depends(get_patient)):
    """Called on Retrain: removes added words and their recordings, keeps the defaults."""
    return {"deleted": store.clear_vocabulary(p["id"])}


@router.get("/{patient_id}/samples")
def samples(p: dict = Depends(get_patient)):
    return store.list_samples(p["id"])


@router.post("/{patient_id}/samples", status_code=201)
def add_sample(body: SampleIn, p: dict = Depends(get_patient)):
    return store.add_sample(p["id"], body.label, body.vector)


@router.put("/{patient_id}/samples/{label}")
def replace_label_samples(label: str, body: SampleBatchIn, p: dict = Depends(get_patient)):
    if label not in {w["label"] for w in p["vocabulary"]} | {"neutral"}:
        raise HTTPException(422, "unknown movement label")
    return store.replace_samples(p["id"], label, body.vectors)


@router.delete("/{patient_id}/samples")
def reset_samples(p: dict = Depends(get_patient)):
    return {"deleted": store.delete_samples(p["id"])}


@router.get("/{patient_id}/adapt-config")
def get_adapt_config(p: dict = Depends(get_patient)):
    return store.get_adapt_config(p["id"])


@router.get("/{patient_id}/sessions")
def session_reports(p: dict = Depends(get_patient)):
    return store.recent_sessions(p["id"], 5)


@router.get("/{patient_id}/usage")
def usage_report(p: dict = Depends(get_patient)):
    return store.recent_usage(p["id"], 5)


@router.put("/{patient_id}/live-session")
def live_session(body: LiveSessionIn, p: dict = Depends(get_patient)):
    if body.patient_id != p["id"]:
        raise HTTPException(422, "patient does not match the report")
    return store.update_live_session(body.model_dump(exclude_none=True))


@router.get("/{patient_id}/feedback")
def feedback_history(p: dict = Depends(get_patient)):
    return store.recent_feedback(p["id"], 100)


@router.put("/{patient_id}/adapt-config")
def put_adapt_config(body: AdaptConfigIn, p: dict = Depends(get_patient),
                     expected_version: int | None = Query(default=None, ge=1)):
    """Called only when the caregiver taps Apply."""
    try:
        return store.set_adapt_config(p["id"], clean_settings(body.model_dump(exclude_none=True)), expected_version)
    except ValueError as exc:
        raise HTTPException(409, "Settings changed. Refresh and request a new suggestion.") from exc
