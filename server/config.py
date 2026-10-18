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
