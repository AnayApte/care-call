#!/usr/bin/env python3
"""Bedside Pi (contract section 15): says "Help is coming." when the caregiver answers.

Polls the server (never the caregiver Pi). Speaks once per new DeviceState.last_ack,
so a missed poll on bad Wi-Fi never loses it. Standard library + an MP3 player (mpg123).
Run:  python3 bedside.py      (settings in .env next to this file, see .env.example)
"""
import json
import os
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path


def load_env(path: Path) -> None:
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.split("#")[0].strip())


HERE = Path(__file__).resolve().parent
load_env(HERE / ".env")
load_env(HERE.parent / ".env")

SERVER = os.environ.get("SERVER_URL", "https://care-call-production.up.railway.app").rstrip("/")
TOKEN = os.environ["DEVICE_TOKEN"]
DEVICE_ID = os.environ.get("DEVICE_ID", "bedside_1")
PHRASE = "Help is coming."
CLIP = Path.home() / ".carecall" / "help_is_coming.mp3"


def call(method, path, body=None, timeout=10):
    req = urllib.request.Request(f"{SERVER}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-Device-Token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_clip() -> bool:
    """Download the ElevenLabs clip once and keep it on the Pi."""
    if CLIP.exists() and CLIP.stat().st_size > 1000:
        return True
    try:
        CLIP.parent.mkdir(parents=True, exist_ok=True)
        CLIP.write_bytes(call("POST", "/api/tts", {"text": PHRASE}, timeout=30))
        print(f"[bedside] saved {CLIP.name}")
        return True
    except Exception as exc:
        print(f"[bedside] could not fetch the voice clip yet: {exc}")
        return False


def speak() -> None:
    player = os.environ.get("PLAYER") or next((p for p in ("mpg123", "ffplay", "cvlc") if shutil.which(p)), None)
    if fetch_clip() and player:
        args = {"mpg123": ["mpg123", "-q"], "ffplay": ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet"],
                "cvlc": ["cvlc", "--play-and-exit", "--quiet"]}.get(player, [player])
        subprocess.run(args + [str(CLIP)], check=False)
    elif shutil.which("espeak-ng") or shutil.which("espeak"):
        subprocess.run([shutil.which("espeak-ng") or "espeak", PHRASE], check=False)  # robotic, but never silent
    else:
        print("[bedside] no audio player: run  sudo apt install -y mpg123")


def main():
    def heartbeat():
        while True:
            try:
                call("POST", "/api/device/heartbeat", {"device_id": DEVICE_ID, "rssi": 0}, timeout=5)
            except Exception:
                pass
            time.sleep(5)

    threading.Thread(target=heartbeat, daemon=True).start()
    fetch_clip()
    print(f"[bedside] {DEVICE_ID} -> {SERVER}")

    spoken = None  # request id we last spoke for; old acks from before start are ignored
    first = True
    offline = False
    while True:
        try:
            state = json.loads(call("GET", f"/api/device/state?device_id={DEVICE_ID}", timeout=5))
            if offline:
                print("[bedside] back online")
                offline = False
            ack = state.get("last_ack")
            ack_id = ack["request_id"] if ack else None
            if first:
                spoken, first = ack_id, False
            elif ack_id and ack_id != spoken:
                spoken = ack_id
                print(f"[bedside] {ack['display']} answered by {ack['acked_by']}: \"{PHRASE}\"")
                speak()
            elif state.get("mode") == "alert" and state.get("active_request"):
                pass  # the patient page speaks the request itself
        except Exception as exc:
            if not offline:
                print(f"[bedside] offline, retrying: {exc}")
                offline = True
        time.sleep(1)


if __name__ == "__main__":
    main()
