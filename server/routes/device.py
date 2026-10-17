from fastapi import APIRouter, Depends, HTTPException

from .. import config, escalation, store
from ..deps import require_device_token
from ..models import DeviceAckIn, HeartbeatIn

router = APIRouter(prefix="/api/device", dependencies=[Depends(require_device_token)])


@router.get("/state")
def state(device_id: str = config.DEFAULT_DEVICE_ID):
    return store.device_state(device_id)


@router.post("/ack")
def ack(body: DeviceAckIn):
    req = store.latest_open_request()
    if req is None:
        raise HTTPException(409, "no open request to acknowledge")
    return escalation.acknowledge(req["id"], "button")


@router.post("/heartbeat")
def heartbeat(body: HeartbeatIn):
    store.record_heartbeat(body.device_id, body.rssi)
    return {"ok": True}
