from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import config, store

router = APIRouter()


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/api/device/health")
def device_health():
    age = store.last_heartbeat_age_s()
    if age is None or age > config.DEVICE_HEARTBEAT_TIMEOUT_S:
        return JSONResponse({"error": "no device heartbeat in the last 15 s", "last_heartbeat_age_s": age},
                            status_code=503)
    return {"ok": True, "last_heartbeat_age_s": round(age, 1)}
