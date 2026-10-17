"""ElevenLabs text-to-speech, cached on disk by hash so each phrase is paid for once.

Pre-generate the demo phrases: server/.venv/bin/python3 -m server.tts
"""
import hashlib
import logging
import os
from pathlib import Path

import httpx

from . import config
from .models import PATIENT

log = logging.getLogger("carecall.tts")

HELP_IS_COMING = "Help is coming."
# Everything the bedside says in the golden path.
DEMO_PHRASES = [w["speech"] for w in PATIENT["vocabulary"]] + [HELP_IS_COMING]


class TtsError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _cache_path(text: str) -> Path:
    key = f"{config.ELEVENLABS_VOICE_ID}|{config.ELEVENLABS_MODEL_ID}|{text}"
    return Path(config.TTS_CACHE_DIR) / f"{hashlib.sha256(key.encode()).hexdigest()}.mp3"


def speak(text: str) -> bytes:
    """MP3 bytes for `text`, from the cache or ElevenLabs. Raises TtsError."""
    text = text.strip()
    path = _cache_path(text)
    if path.exists():
        return path.read_bytes()
    if not config.ELEVENLABS_API_KEY or not config.ELEVENLABS_VOICE_ID:
        raise TtsError(503, "ElevenLabs is not configured (ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID)")
    try:
        r = httpx.post(f"https://api.elevenlabs.io/v1/text-to-speech/{config.ELEVENLABS_VOICE_ID}",
                       headers={"xi-api-key": config.ELEVENLABS_API_KEY, "Accept": "audio/mpeg"},
                       json={"text": text, "model_id": config.ELEVENLABS_MODEL_ID}, timeout=30)
    except httpx.HTTPError as exc:
        log.error("elevenlabs request failed: %s", exc)
        raise TtsError(502, "could not reach ElevenLabs")
    if r.status_code != 200:
        log.error("elevenlabs answered %s: %s", r.status_code, r.text[:200])
        raise TtsError(502, f"ElevenLabs answered {r.status_code}")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_bytes(r.content)
    tmp.replace(path)  # atomic, so a half-written file is never served
    log.info("tts cached %d bytes for %r", len(r.content), text[:40])
    return r.content


def warm() -> None:
    """Generate every demo phrase ahead of time."""
    for phrase in DEMO_PHRASES:
        try:
            speak(phrase)
            print(f"ok   {phrase}")
        except TtsError as exc:
            print(f"fail {phrase}: {exc}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    warm()
