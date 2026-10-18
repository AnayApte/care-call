#!/usr/bin/env python3
"""Bedside Pi (contract section 15): the bedside voice.

Speaks each new request once ("I would like some water, please.") and says "Help is coming."
once per new acknowledgement (DeviceState.last_ack, so a missed poll on bad Wi-Fi never loses it).
Use it as the ONLY bedside voice: leave the patient laptop's sound off so nothing speaks twice.
Polls the server (never the caregiver Pi). Standard library + an MP3 player (mpg123).
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
CLIPS = Path.home() / ".carecall"
SPEAK_REQUESTS = os.environ.get("SPEAK_REQUESTS", "true").lower() == "true"


def call(method, path, body=None, timeout=10):
    req = urllib.request.Request(f"{SERVER}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-Device-Token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def clip_for(text: str):
    """Download the ElevenLabs clip for `text` once and keep it on the Pi. Returns the path or None."""
    import hashlib
    path = CLIPS / (hashlib.sha256(text.encode()).hexdigest()[:16] + ".mp3")
    if path.exists() and path.stat().st_size > 1000:
        return path
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(call("POST", "/api/tts", {"text": text}, timeout=30))
        print(f"[bedside] saved clip for {text!r}")
        return path
    except Exception as exc:
        print(f"[bedside] could not fetch the voice clip yet: {exc}")
        return None


def speak(text: str = PHRASE) -> None:
    player = os.environ.get("PLAYER") or next((p for p in ("mpg123", "ffplay", "cvlc") if shutil.which(p)), None)
    clip = clip_for(text)
    if clip and player:
        args = {"mpg123": ["mpg123", "-q"], "ffplay": ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet"],
                "cvlc": ["cvlc", "--play-and-exit", "--quiet"]}.get(player, [player])
        subprocess.run(args + [str(clip)], check=False)
    elif shutil.which("espeak-ng") or shutil.which("espeak"):
        subprocess.run([shutil.which("espeak-ng") or "espeak", text], check=False)  # robotic, but never silent
    else:
        print("[bedside] no audio player: run  sudo apt install -y mpg123")


def request_speech(request_id: str):
    try:
        return json.loads(call("GET", f"/api/requests/{request_id}", timeout=5)).get("speech")
    except Exception as exc:
        print(f"[bedside] could not read {request_id}: {exc}")
        return None


def main():
    def heartbeat():
        while True:
            try:
                call("POST", "/api/device/heartbeat", {"device_id": DEVICE_ID, "rssi": 0}, timeout=5)
            except Exception:
                pass
            time.sleep(5)

    threading.Thread(target=heartbeat, daemon=True).start()
    clip_for(PHRASE)
    print(f"[bedside] {DEVICE_ID} -> {SERVER} (speak requests: {SPEAK_REQUESTS})")

    spoken = None  # request id we last said "Help is coming" for; acks from before start are ignored
    announced = None  # request id we last read out
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
            active = state.get("active_request") or {}
            if first:
                spoken, announced, first = ack_id, active.get("id"), False
            if state.get("mode") == "alert" and active.get("id") and active["id"] != announced:
                announced = active["id"]
                text = request_speech(announced) if SPEAK_REQUESTS else None
                if text:
                    print(f"[bedside] new request {announced}: {text!r}")
                    speak(text)
            if ack_id and ack_id != spoken:
                spoken = ack_id
                print(f"[bedside] {ack['display']} answered by {ack['acked_by']}: \"{PHRASE}\"")
                speak(PHRASE)
        except Exception as exc:
            if not offline:
                print(f"[bedside] offline, retrying: {exc}")
                offline = True
        time.sleep(1)


if __name__ == "__main__":
    main()
