#!/usr/bin/env python3
"""Caregiver Pi (contract section 15): buzzer + Grove LCD alert, button acknowledges.

Talks only to the server (never to the bedside Pi). Standard library + gpiozero only.
Run:  python3 caregiver.py      (settings in .env next to this file, see .env.example)
"""
import json
import os
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
DEVICE_ID = os.environ.get("DEVICE_ID", "caregiver_1")
BUTTON_PIN = int(os.environ.get("BUTTON_PIN", "5"))    # BCM number (Grove HAT port D5 = GPIO5)
BUZZER_PIN = int(os.environ.get("BUZZER_PIN", "16"))   # BCM number (Grove HAT port D16 = GPIO16)
USE_LCD = os.environ.get("USE_LCD", "true").lower() == "true"


# ---------- server ----------

def call(method, path, body=None, timeout=5):
    req = urllib.request.Request(f"{SERVER}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-Device-Token": TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}


# ---------- Grove LCD RGB Backlight (I2C) ----------

class Lcd:
    TEXT = 0x3E

    def __init__(self):
        self.bus = None
        if not USE_LCD:
            return
        try:
            try:
                from smbus2 import SMBus
            except ImportError:
                from smbus import SMBus
            self.bus = SMBus(1)
            self.rgb = 0x62
            try:
                self.bus.read_byte(self.rgb)
            except OSError:
                self.rgb = 0x30  # newer Grove LCD (v5) uses 0x30
            for cmd in (0x01, 0x0C, 0x28):  # clear, display on, 2 lines
                self._cmd(cmd)
                time.sleep(0.05)
        except Exception as exc:  # no LCD: keep going, print instead
            print(f"[lcd] not available ({exc}); printing to the console instead")
            self.bus = None

    def _cmd(self, c):
        self.bus.write_byte_data(self.TEXT, 0x80, c)

    def color(self, r, g, b):
        if not self.bus:
            return
        try:
            if self.rgb == 0x62:
                for reg, val in ((0, 0), (1, 0), (0x08, 0xAA), (4, r), (3, g), (2, b)):
                    self.bus.write_byte_data(self.rgb, reg, val)
            else:
                for reg, val in ((0x00, 0x07), (0x04, 0x15), (0x06, r), (0x07, g), (0x08, b)):
                    self.bus.write_byte_data(self.rgb, reg, val)
        except OSError as exc:
            print(f"[lcd] color failed: {exc}")

    def show(self, line1: str, line2: str = ""):
        print(f"[lcd] {line1} | {line2}")
        if not self.bus:
            return
        try:
            self._cmd(0x01)
            time.sleep(0.05)
            for row, text in ((0x80, line1), (0xC0, line2)):
                self._cmd(row)
                for ch in text[:16].ljust(16):
                    self.bus.write_byte_data(self.TEXT, 0x40, ord(ch))
        except OSError as exc:
            print(f"[lcd] write failed: {exc}")


RED, GREEN, DIM, AMBER = (255, 0, 0), (0, 255, 0), (20, 20, 40), (255, 120, 0)


# ---------- main loop ----------

def main():
    from gpiozero import Button, Buzzer

    lcd = Lcd()
    button = Button(BUTTON_PIN, bounce_time=0.05)
    buzzer = Buzzer(BUZZER_PIN)
    shown = {"key": None}

    def press():
        lcd.show("Sending...", "")
        code, _ = call("POST", "/api/device/ack", {"device_id": DEVICE_ID})
        print(f"[button] ack -> {code}" + (" (nothing open)" if code == 409 else ""))
        buzzer.off()

    button.when_pressed = lambda: threading.Thread(target=press, daemon=True).start()

    def heartbeat():
        while True:
            try:
                call("POST", "/api/device/heartbeat", {"device_id": DEVICE_ID, "rssi": 0})
            except Exception:
                pass
            time.sleep(5)

    threading.Thread(target=heartbeat, daemon=True).start()
    print(f"[caregiver] {DEVICE_ID} -> {SERVER} (button GPIO{BUTTON_PIN}, buzzer GPIO{BUZZER_PIN})")

    while True:
        try:
            code, state = call("GET", f"/api/device/state?device_id={DEVICE_ID}")
            if code != 200:
                raise RuntimeError(f"state {code}")
            mode = state["mode"]
            active = state.get("active_request") or {}
            key = (mode, active.get("id"))
            if key != shown["key"]:
                shown["key"] = key
                if mode == "alert":
                    lcd.color(*RED)
                    lcd.show(active.get("display", "Help").upper(), "Press to answer")
                    buzzer.beep(on_time=0.3, off_time=0.7, background=True)
                elif mode == "acked":
                    buzzer.off()
                    lcd.color(*GREEN)
                    lcd.show(state.get("message") or "On the way", active.get("display", ""))
                else:
                    buzzer.off()
                    lcd.color(*DIM)
                    lcd.show("Ready", "Care Call")
        except Exception as exc:
            if shown["key"] != "offline":
                shown["key"] = "offline"
                buzzer.off()
                lcd.color(*AMBER)
                lcd.show("OFFLINE", "Retrying...")
                print(f"[caregiver] offline: {exc}")
        time.sleep(1)


if __name__ == "__main__":
    main()
