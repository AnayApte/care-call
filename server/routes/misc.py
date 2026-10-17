import json

from fastapi import APIRouter, HTTPException, Request

from .. import config
from ..models import TtsIn

router = APIRouter()


@router.post("/api/tts")
def tts(body: TtsIn):
    # Step 1 stub: ElevenLabs comes in a later step.
    raise HTTPException(501, "tts not implemented yet")


@router.post("/api/webhooks/photon")
async def photon_webhook(request: Request):
    # Step 1 stub: accept and ignore until Photon is wired.
    return {"ok": True, "handled": False}


@router.get("/api/benchmark")
def benchmark():
    path = config.REPO_DIR / "benchmark" / "results.json"
    if not path.exists():
        raise HTTPException(404, "benchmark/results.json does not exist yet")
    return json.loads(path.read_text())
