"""Wire shapes from contract section 8 and request bodies from section 9."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

PATIENT = {
    "id": "p_demo",
    "name": "Maria",
    "vocabulary": [
        {"label": "water", "display": "Water", "speech": "I would like some water, please."},
        {"label": "pain", "display": "Pain", "speech": "I am in pain. Please come."},
        {"label": "help", "display": "Help", "speech": "I need help. Please come."},
        {"label": "bathroom", "display": "Bathroom", "speech": "I need to use the bathroom."},
    ],
}
PATIENTS = {PATIENT["id"]: PATIENT}

# Default AdaptConfig, matching the trigger rules in contract section 10.
DEFAULT_ADAPT_CONFIG = {
    "version": 1,
    "hold_frames": 12,
    "min_confidence": 0.8,
    "labels": {},
    "retrain_labels": [],
    "suggest_replace": [],
}

AckBy = Literal["button", "dashboard", "imessage", "call"]


class SampleIn(BaseModel):
    label: str
    vector: list[float] = Field(min_length=42, max_length=42)


class RequestIn(BaseModel):
    patient_id: str
    label: str
    confidence: float = Field(ge=0, le=1)
    source: str = "browser"


class AckIn(BaseModel):
    by: AckBy = "dashboard"


class DeviceAckIn(BaseModel):
    device_id: str


class HeartbeatIn(BaseModel):
    device_id: str
    rssi: Optional[int] = None


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class FeedbackIn(BaseModel):
    correct: bool


class AdaptRunIn(BaseModel):
    patient_id: str = "p_demo"


class HandoffIn(BaseModel):
    patient_id: str = "p_demo"
