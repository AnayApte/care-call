import json

from fastapi import APIRouter, HTTPException

from .. import config
from ..models import TtsIn

router = APIRouter()


@router.post("/api/tts")
def tts(body: TtsIn):
    # Step 1 stub: ElevenLabs comes in a later step.
    raise HTTPException(501, "tts not implemented yet")


@router.get("/api/benchmark")
def benchmark():
    path = config.REPO_DIR / "benchmark" / "results.json"
    if not path.exists():
        raise HTTPException(404, "benchmark/results.json does not exist yet")
    return json.loads(path.read_text())
