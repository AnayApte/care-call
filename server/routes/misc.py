import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .. import config, tts as tts_engine
from ..models import TtsIn

router = APIRouter()


@router.post("/api/tts")
def tts(body: TtsIn):
    """MP3 for the bedside speaker. Cached, so repeat phrases are instant and free."""
    try:
        audio = tts_engine.speak(body.text, body.format)
    except tts_engine.TtsError as exc:
        raise HTTPException(exc.status, str(exc))
    media = "audio/wav" if body.format == "wav" else "audio/mpeg"
    return Response(audio, media_type=media, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/api/benchmark")
def benchmark():
    path = config.REPO_DIR / "benchmark" / "results.json"
    if not path.exists():
        raise HTTPException(404, "benchmark/results.json does not exist yet")
    return json.loads(path.read_text())
