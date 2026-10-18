"""Shared route helpers."""
import secrets

from fastapi import Header, HTTPException

from . import config, store
from .models import PATIENTS


def require_device_token(x_device_token: str = Header(default="")) -> None:
    if not config.DEVICE_TOKEN:
        raise HTTPException(503, "DEVICE_TOKEN is not set on the server")
    if not secrets.compare_digest(x_device_token, config.DEVICE_TOKEN):
        raise HTTPException(401, "bad or missing X-Device-Token")


def get_patient(patient_id: str) -> dict:
    patient = PATIENTS.get(patient_id)
    if patient is None:
        raise HTTPException(404, f"unknown patient {patient_id}")
    return {**patient, "vocabulary": store.vocabulary(patient_id)}
