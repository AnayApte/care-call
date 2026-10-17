"""Server state. Step 1: in memory. Step 2 moves this to SQLite behind the same functions."""
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from . import config
from .models import PATIENTS

_lock = threading.Lock()
_samples: list[dict] = []
_requests: list[dict] = []
_heartbeats: dict[str, dict] = {}  # device_id -> {"at": monotonic, "rssi": int}
_acked_until: dict[str, tuple[float, dict]] = {}  # device_id -> (monotonic deadline, request)
_counter = {"s": 0, "r": 0}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _next_id(kind: str) -> str:
    _counter[kind] += 1
    return f"{kind}_{_counter[kind]}"


# Samples

def list_samples(patient_id: str) -> list[dict]:
    with _lock:
        return [s for s in _samples if s["patient_id"] == patient_id]


def add_sample(patient_id: str, label: str, vector: list[float]) -> dict:
    with _lock:
        sample = {"id": _next_id("s"), "patient_id": patient_id, "label": label,
                  "vector": vector, "created_at": now_iso()}
        _samples.append(sample)
        return sample


def delete_samples(patient_id: str) -> int:
    with _lock:
        before = len(_samples)
        _samples[:] = [s for s in _samples if s["patient_id"] != patient_id]
        return before - len(_samples)


# Requests

def create_request(patient_id: str, label: str, confidence: float, source: str) -> dict:
    word = next(w for w in PATIENTS[patient_id]["vocabulary"] if w["label"] == label)
    with _lock:
        req = {"id": _next_id("r"), "patient_id": patient_id, "label": label,
               "display": word["display"], "speech": word["speech"],
               "confidence": confidence, "source": source, "status": "open",
               "escalation_level": 0, "created_at": now_iso(),
               "acked_at": None, "acked_by": None, "ack_latency_ms": None}
        _requests.append(req)
        return dict(req)


def get_request(request_id: str) -> Optional[dict]:
    with _lock:
        for r in _requests:
            if r["id"] == request_id:
                return dict(r)
    return None


def list_requests(patient_id: Optional[str] = None, since: Optional[datetime] = None) -> list[dict]:
    with _lock:
        rows = [dict(r) for r in _requests
                if (patient_id is None or r["patient_id"] == patient_id)
                and (since is None or parse_iso(r["created_at"]) > since)]
    return sorted(rows, key=lambda r: r["created_at"], reverse=True)


def latest_open_request() -> Optional[dict]:
    open_rows = [r for r in list_requests() if r["status"] == "open"]
    return open_rows[0] if open_rows else None


def ack_request(request_id: str, by: str) -> Optional[dict]:
    """Ack an open request. Returns the request, or None if not found. Acking twice is a no-op."""
    with _lock:
        req = next((r for r in _requests if r["id"] == request_id), None)
        if req is None:
            return None
        if req["status"] == "open":
            acked_at = datetime.now(timezone.utc)
            req["status"] = "acked"
            req["acked_at"] = now_iso()
            req["acked_by"] = by
            req["ack_latency_ms"] = int((acked_at - parse_iso(req["created_at"])).total_seconds() * 1000)
            deadline = time.monotonic() + config.ACKED_DISPLAY_S
            _acked_until[config.DEFAULT_DEVICE_ID] = (deadline, dict(req))
        return dict(req)


# Device

def record_heartbeat(device_id: str, rssi: Optional[int]) -> None:
    with _lock:
        _heartbeats[device_id] = {"at": time.monotonic(), "rssi": rssi}


def last_heartbeat_age_s() -> Optional[float]:
    with _lock:
        if not _heartbeats:
            return None
        return time.monotonic() - max(h["at"] for h in _heartbeats.values())


def device_state(device_id: str) -> dict:
    with _lock:
        acked = _acked_until.get(config.DEFAULT_DEVICE_ID)  # one beacon for the demo
    if acked and acked[0] > time.monotonic():
        req = acked[1]
        return {"device_id": device_id, "mode": "acked",
                "active_request": {"id": req["id"], "display": req["display"], "created_at": req["created_at"]},
                "message": config.ACKED_MESSAGE}
    req = latest_open_request()
    if req:
        return {"device_id": device_id, "mode": "alert",
                "active_request": {"id": req["id"], "display": req["display"], "created_at": req["created_at"]},
                "message": None}
    return {"device_id": device_id, "mode": "idle", "active_request": None, "message": None}
