"""Settings from server/.env (plain KEY=VALUE lines) and the real environment."""
import os
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
REPO_DIR = SERVER_DIR.parent


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        # Real environment variables win over the file.
        os.environ.setdefault(key.strip(), value.strip())


_load_env_file(SERVER_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
ESCALATE_MESSAGE_AFTER_S = float(os.environ.get("ESCALATE_MESSAGE_AFTER_S", "20"))
ESCALATE_CALL_AFTER_S = float(os.environ.get("ESCALATE_CALL_AFTER_S", "75"))
ENABLE_PHOTON = env_bool("ENABLE_PHOTON")
ENABLE_PHONE_CALL = env_bool("ENABLE_PHONE_CALL")
ENABLE_CREAO = env_bool("ENABLE_CREAO")

DEVICE_HEARTBEAT_TIMEOUT_S = 15
ACKED_DISPLAY_S = 5
ACKED_MESSAGE = "On the way"
DEFAULT_DEVICE_ID = "beacon_1"

# Photon bridge (server/photon-bridge). Shares a secret with the Python server.
PHOTON_BRIDGE_URL = os.environ.get("PHOTON_BRIDGE_URL", "http://127.0.0.1:8787")
BRIDGE_SECRET = os.environ.get("BRIDGE_SECRET") or DEVICE_TOKEN
# One or more caregiver phones, comma separated, e.g. +15551234567
CAREGIVER_PHONES = [p.strip() for p in os.environ.get("CAREGIVER_PHONE", "").split(",") if p.strip()]

# ElevenLabs text-to-speech. Audio is cached on disk by hash (on the Railway volume).
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "")
ELEVENLABS_MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
TTS_CACHE_DIR = os.environ.get("TTS_CACHE_DIR", str(SERVER_DIR / "cache" / "tts"))

# Gemini answers free-text iMessage questions (contract section 10).
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Tried in order: a model that is overloaded (503) or retired (404) falls through to the next.
GEMINI_MODELS = [m.strip() for m in os.environ.get("GEMINI_MODELS", "gemini-3.5-flash,gemini-flash-latest,gemini-3.1-flash-lite").split(",") if m.strip()]
