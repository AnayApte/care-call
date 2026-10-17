"""Wire shapes from contract section 8 and request bodies from section 9."""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

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


class LabelStats(BaseModel):
    model_config = ConfigDict(extra="allow")
    attempts: int = Field(ge=0)
    fired: int = Field(ge=0)
    abandoned: int = Field(ge=0)
    mean_conf: Optional[float] = None
    min_conf: Optional[float] = None
    mean_hold_frames_to_fire: Optional[float] = None


class Confusion(BaseModel):
    intended: str
    predicted: str
    count: int = Field(ge=0)


class SessionIn(BaseModel):
    """Gesture session summary from web/src/cv/session.ts (contract section 19)."""
    model_config = ConfigDict(extra="allow")
    patient_id: str
    started_at: str
    ended_at: str
    config_version: int = 1
    labels: dict[str, LabelStats] = {}
    confusions: list[Confusion] = []
    false_triggers_neutral: int = Field(default=0, ge=0)


class LabelOverride(BaseModel):
    model_config = ConfigDict(extra="allow")
    min_confidence: Optional[float] = None
    hold_frames: Optional[int] = None


class SuggestReplace(BaseModel):
    label: str
    reason: str = ""


class AdaptConfigIn(BaseModel):
    """Types only. The browser (web/src/cv/adapt.ts) clamps the values."""
    model_config = ConfigDict(extra="allow")
    version: int
    hold_frames: int
    min_confidence: float
    labels: dict[str, LabelOverride] = {}
    retrain_labels: list[str] = []
    suggest_replace: list[SuggestReplace] = []


class AdaptRunIn(BaseModel):
    patient_id: str = "p_demo"


class HandoffIn(BaseModel):
    patient_id: str = "p_demo"
