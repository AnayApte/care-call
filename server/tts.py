"""ElevenLabs text-to-speech, cached on disk by hash so each phrase is paid for once.

Pre-generate the demo phrases: server/.venv/bin/python3 -m server.tts
"""
import hashlib
import logging
import os
from pathlib import Path

import httpx
import sentry_sdk

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


WAV_RATE = 22050  # mono 16-bit, for players that only take WAV (e.g. QNX "wave")


def _cache_path(text: str, fmt: str = "mp3") -> Path:
    key = f"{config.ELEVENLABS_VOICE_ID}|{config.ELEVENLABS_MODEL_ID}|{text}" + ("" if fmt == "mp3" else f"|{fmt}")
    return Path(config.TTS_CACHE_DIR) / f"{hashlib.sha256(key.encode()).hexdigest()}.{fmt}"


def _wav(pcm: bytes) -> bytes:
    import io
    import wave
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(WAV_RATE)
        w.writeframes(pcm)
    return buf.getvalue()


def speak(text: str, fmt: str = "mp3") -> bytes:
    """Audio bytes (MP3, or WAV if fmt="wav") for `text`, from the cache or ElevenLabs. Raises TtsError."""
    text = text.strip()
    path = _cache_path(text, fmt)
    if path.exists():
        sentry_sdk.set_tag("tts.cache", "hit")
        return path.read_bytes()
    sentry_sdk.set_tag("tts.cache", "miss")
    if not config.ELEVENLABS_API_KEY or not config.ELEVENLABS_VOICE_ID:
        raise TtsError(503, "ElevenLabs is not configured (ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID)")
    try:
        r = httpx.post(f"https://api.elevenlabs.io/v1/text-to-speech/{config.ELEVENLABS_VOICE_ID}",
                       params={"output_format": f"pcm_{WAV_RATE}"} if fmt == "wav" else None,
                       headers={"xi-api-key": config.ELEVENLABS_API_KEY, "Accept": "audio/mpeg"},
                       json={"text": text, "model_id": config.ELEVENLABS_MODEL_ID}, timeout=30)
    except httpx.HTTPError as exc:
        log.error("elevenlabs request failed: %s", exc)
        raise TtsError(502, "could not reach ElevenLabs")
    if r.status_code != 200:
        log.error("elevenlabs answered %s: %s", r.status_code, r.text[:200])
        raise TtsError(502, f"ElevenLabs answered {r.status_code}")
    audio = _wav(r.content) if fmt == "wav" else r.content
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_bytes(audio)
    tmp.replace(path)  # atomic, so a half-written file is never served
    log.info("tts cached %d bytes (%s) for %r", len(audio), fmt, text[:40])
    return audio


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
