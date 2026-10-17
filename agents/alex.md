# Agent brief: Alex (hardware, firmware, Pi/QNX, CV reviewer)

Owns: `firmware/`, `edge/`, `agents/alex.md`.
Awake and building: now until 1 AM, then from 6 to 7 AM onward.

## Hardware we have
ESP32-S3, Grove LCD RGB Backlight, 2 Grove buttons, Grove buzzer, Grove and plain jumper wires (6 of each kind), breadboard, about 10 resistors, Logitech webcam, Google Nest Mini (Bluetooth speaker, paired to the laptop running the patient page), Raspberry Pi 4 kit, HiPi board. No LED socket kit.

## First tasks (in order)
1. 3:00 PM: 20 minute pairing with Josh on landmarks to the 42-number feature vector. Then set up the Pi (about 30 minutes) and start the QNX gate.
2. ESP32 smoke tests, in this order: Grove LCD (power from 5V, test first; garbled text means check the module version or add a level shifter), button and buzzer, then a Wi-Fi fetch of `GET /api/device/state` against a mock or the real server. Post a photo of the working beacon in the group chat (Espressif evidence).
3. Firmware per contract section 15: poll state every 1 s, backlight red on alert, buzzer pattern, button press posts the ack, heartbeat every 5 s, show OFFLINE and reconnect if Wi-Fi drops. Pins in `firmware/pins.h`. Wi-Fi and token in `firmware/secrets.h` (copy from `secrets.h.example`, never commit).
4. 5:00 PM QNX gate: Pi boots QNX and the camera captures a frame, or drop the edge node. Ask the QNX table which board and AI module they want.
5. 5:00 PM: go ask MLH what else is available if you need something. Go/no-go on extra bedside hardware at 6:30 PM (contract section 10 fallback notes).
6. Edge node (stretch): Python on the Pi, same feature vector and kNN as `web/src/cv/`, posts requests with `source:"edge"`.
7. Review Josh's CV approach at 4 PM and 6:30 PM. Review only; do not edit his folder.
8. 11:30 PM to 12:30 AM: record the backup demo with Rey.

## Hard rules for you
- No secrets in firmware code. `secrets.h` is gitignored.
- Keep the firmware loop dead simple. It must keep working if Wi-Fi drops.
