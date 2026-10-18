"""Wire shapes from contract section 8 and request bodies from section 9."""
from typing import Literal, Optional
import math

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    "min_confidence": 0.65,
    "labels": {},
    "retrain_labels": [],
    "suggest_replace": [],
}

AckBy = Literal["button", "dashboard", "imessage", "call"]


class SampleIn(BaseModel):
    label: str
    vector: list[float] = Field(min_length=42, max_length=42)

    @field_validator("vector")
    @classmethod
    def finite_vector(cls, vector):
        if not all(math.isfinite(x) for x in vector):
            raise ValueError("vector must contain finite numbers")
        return vector


class SampleBatchIn(BaseModel):
    vectors: list[list[float]] = Field(min_length=15, max_length=15)

    @field_validator("vectors")
    @classmethod
    def valid_batch(cls, vectors):
        for vector in vectors:
            if len(vector) != 42 or not all(math.isfinite(x) for x in vector):
                raise ValueError("each vector must contain 42 finite numbers")
        return vectors


class VocabularyIn(BaseModel):
    """A word added after onboarding. Same label rule as web/src/cv/types.ts LABEL_PATTERN."""
    label: str = Field(pattern=r"^[a-z][a-z0-9_]{0,23}$")
    display: str = Field(min_length=1, max_length=40)
    speech: str = Field(min_length=1, max_length=200)


class RequestIn(BaseModel):
    patient_id: str
    label: str
    confidence: float = Field(ge=0, le=1)
    source: str = "browser"
    client_request_id: Optional[str] = Field(default=None, min_length=1, max_length=100)


class AckIn(BaseModel):
    by: AckBy = "dashboard"


class DeviceAckIn(BaseModel):
    device_id: str
    request_id: Optional[str] = None


class HeartbeatIn(BaseModel):
    device_id: str
    rssi: Optional[int] = None


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    format: Literal["mp3", "wav"] = "mp3"  # wav for players that cannot decode MP3 (QNX)


class FeedbackIn(BaseModel):
    correct: bool
    intended_label: Optional[Literal["water", "pain", "help", "bathroom", "neutral"]] = None


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
    session_id: Optional[str] = Field(default=None, min_length=1, max_length=100)
    started_at: str
    ended_at: str
    config_version: int = 1
    labels: dict[str, LabelStats] = {}
    confusions: list[Confusion] = []
    false_triggers_neutral: int = Field(default=0, ge=0)


class LiveSessionIn(SessionIn):
    session_id: str = Field(min_length=1, max_length=100)

    @field_validator("started_at", "ended_at")
    @classmethod
    def valid_time(cls, value):
        from datetime import datetime
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("time must include a timezone")
        return value


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
