"""CREAO adaptation routes (contract section 19).

The agent itself lives in Rey's integrations/creao.py:
  start_adaptation(patient, config, sessions, feedback) -> job_id
  get_adaptation(job_id) -> {"status", "proposal", "explanation_md"}
Rule: if anything goes wrong we report failure. We never make up a proposal.
"""
import logging

import sentry_sdk
from fastapi import APIRouter, HTTPException

from .. import config, store
from ..deps import get_patient
from ..models import AdaptRunIn, HandoffIn, SessionIn

log = logging.getLogger("carecall.adapt")
router = APIRouter()

FAILED = {"status": "failed", "proposal": None, "explanation_md": None}


@router.get("/api/adapt/setup")
def adapt_setup():
    from ..integrations.creao import configuration_status
    return configuration_status()


def _creao():
    if not config.ENABLE_CREAO:
        raise HTTPException(503, "CREAO is turned off (ENABLE_CREAO=false)")
    try:
        from ..integrations import creao  # type: ignore[attr-defined]
    except ImportError:
        raise HTTPException(503, "integrations/creao.py does not exist yet")
    if not creao.configuration_status()["ready"]:
        raise HTTPException(503, "CREAO is not connected yet")
    return creao


@router.post("/api/cv/sessions", status_code=201)
def store_session(body: SessionIn):
    get_patient(body.patient_id)
    try:
        return store.add_session(body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/api/adapt/run", status_code=202)
def adapt_run(body: AdaptRunIn):
    patient = get_patient(body.patient_id)
    creao = _creao()
    inputs = {
        "patient": patient,
        "config": store.get_adapt_config(patient["id"]),
        "sessions": store.recent_usage(patient["id"], 5),
        "feedback": store.recent_feedback(patient["id"]),
    }
    try:
        with sentry_sdk.start_span(op="gen_ai.invoke_agent", name="invoke_agent creao-adaptation") as span:
            span.set_data("gen_ai.system", "creao")
            span.set_data("gen_ai.operation.name", "invoke_agent")
            span.set_data("gen_ai.agent.name", "creao-adaptation")
            span.set_data("sessions", len(inputs["sessions"]))
            span.set_data("feedback", len(inputs["feedback"]))
            job_id = creao.start_adaptation(**inputs)
    except Exception:
        log.exception("creao.start_adaptation failed")
        raise HTTPException(502, "could not start the CREAO run")
    if not isinstance(job_id, str) or not job_id:
        log.error("creao.start_adaptation returned %r, not a job id", job_id)
        raise HTTPException(502, "could not start the CREAO run")
    log.info("adapt.run started %s with %d sessions", job_id, len(inputs["sessions"]))
    return {"job_id": job_id, "base_config": inputs["config"]}


@router.get("/api/adapt/{job_id}")
def adapt_status(job_id: str):
    try:
        creao = _creao()
    except HTTPException:
        return FAILED
    try:
        with sentry_sdk.start_span(op="gen_ai.invoke_agent", name="poll creao-adaptation") as span:
            span.set_data("gen_ai.system", "creao")
            span.set_data("job_id", job_id)
            result = creao.get_adaptation(job_id)
    except Exception:
        log.exception("creao.get_adaptation failed for %s", job_id)
        return FAILED
    if not isinstance(result, dict) or result.get("status") not in ("pending", "done", "failed"):
        log.error("creao.get_adaptation returned an unexpected shape for %s", job_id)
        return FAILED
    if result["status"] == "pending":
        return {"status": "pending", "proposal": None, "explanation_md": None}
    proposal = result.get("proposal")
    if result["status"] == "failed" or not isinstance(proposal, dict):
        return FAILED
    explanation = result.get("explanation_md") or proposal.get("explanation_md")
    return {"status": "done", "proposal": proposal, "explanation_md": explanation}


# Optional extra (contract section 19, cut first). Not built.

@router.post("/api/reports/handoff", status_code=202)
def handoff_run(body: HandoffIn):
    get_patient(body.patient_id)
    raise HTTPException(501, "handoff summary not built")


@router.get("/api/reports/handoff/{job_id}")
def handoff_status(job_id: str):
    return {"status": "failed", "summary_md": None}
