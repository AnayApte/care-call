from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import config, store

router = APIRouter()


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/api/device/health")
def device_health(device_id: Optional[str] = None):
    """200 if `device_id` (or, without it, any device) sent a heartbeat in the last 15 s, else 503."""
    age = store.last_heartbeat_age_s(device_id)
    devices = store.device_heartbeats()
    if age is None or age > config.DEVICE_HEARTBEAT_TIMEOUT_S:
        who = device_id or "any device"
        return JSONResponse({"error": f"no heartbeat from {who} in the last 15 s",
                             "last_heartbeat_age_s": age, "devices": devices}, status_code=503)
    return {"ok": True, "last_heartbeat_age_s": round(age, 1), "devices": devices}
