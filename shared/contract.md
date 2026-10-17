# CONTRACT: Care Call (working name)

This file is the single source of truth. Every human and every agent reads it before touching code.
Only Anay edits this file. Everyone else proposes changes in `shared/CONTRACT_REQUESTS.md` (append a line) and tells the group chat.
If something here is wrong or missing, say so; do not silently work around it.

## 1. What we are building (say it in 2 sentences)

After a stroke, many people cannot speak or press a call button, so nobody knows they need help.
Our bedside device learns the small movement a person can still make, speaks their request aloud, and alerts the caregiver, who answers with one button.

We are building an assistive prototype, NOT a medical device. Never claim otherwise in the UI, README, pitch or video. Use only a synthetic patient ("Maria"). No real patient data.

## 2. The golden path (build this first, everything else is a layer)

1. Patient screen (`/patient`): camera on. Guided training: for each request word (water, pain, help, bathroom) plus "neutral", hold your movement for 3 seconds. A small personal classifier is built in the browser.
2. Patient makes the movement and holds it about 1 second. A progress ring fills, then a request is created: `POST /api/requests`.
3. Bedside speaks the request aloud (ElevenLabs audio, pre-generated).
4. Caregiver ESP32 unit (and `/caregiver` dashboard) alerts: buzzer, LED, OLED shows the word.
5. Caregiver presses the button: `POST /api/device/ack`. Bedside says "Help is coming."

Definition of MVP: steps 1 to 5 working live on the venue network (or a phone hotspot) with the real ESP32 (or the `/beacon` phone fallback).

Layers, in priority order, each independently cuttable:
- L2 iMessage (Photon): caregiver gets a text, can reply "1" or "on my way" to acknowledge, and can ask for status.
- L3 Phone call (ElevenLabs voice): if nobody acknowledges, a spoken call to the caregiver.
- L4 Handoff report (CREAO agent): shift-handoff summary and pattern flags from the request log.
- L5 Edge node (QNX on the Pi): a Python node on the Pi that posts events with `source: "edge"`.
- L6 Face input (head tilt, eyebrow): second input type.

## 3. Why AI, specifically (put this in the README and the pitch)

Standard gesture recognisers assume a typical hand. After a stroke, movement is atypical (weak side, tremor, limited fingers), so fixed gestures fail the people who need them.
We learn each person's own movement from about 15 samples per request, so the model is personal. Remove the learning and the product stops working for exactly its users.
Evidence: `/benchmark` compares the personal model to the generic MediaPipe gesture recogniser on atypical gestures acted out by teammates. Label it honestly: small sample, simulated limited dexterity, not patients.

## 4. Architecture (keep it dumb)

```
Browser (web/)  --events-->  Server (server/, public HTTPS)  <--poll-- ESP32 (firmware/)
  camera + MediaPipe             FastAPI + SQLite                      button, buzzer, LED, OLED
  personal kNN (in browser)      escalation timer, TTS, Photon,
                                 CREAO, Sentry
Pi/QNX edge node (edge/)  --events-->  Server    (stretch)
```
- Server is deployed to a public HTTPS host (Railway or Render) by Anay by 4:30 PM. Everything talks to it. This avoids venue Wi-Fi device-to-device blocking.
- Web is deployed to Vercel. Local dev points at the deployed server or localhost via `VITE_API_BASE`.
- The classifier runs in the browser (kNN). The server stores samples and requests, nothing heavy.
- ESP32 polls once per second. No websockets, no MQTT.

## 5. Stack (locked; do not add libraries without a CONTRACT_REQUESTS line)

| Part | Choice |
| --- | --- |
| Server | Python 3.11+, FastAPI, SQLite via SQLModel or sqlite3, httpx, sentry-sdk, run with `python3 -m uvicorn` inside a venv |
| Web | Vite 5 (`npm create vite@5`), React, TypeScript, Tailwind v4 with `@tailwindcss/vite`, shadcn/ui, `@mediapipe/tasks-vision`, `@sentry/react` |
| Firmware | ESP32-S3, Arduino framework (PlatformIO or Arduino IDE), ArduinoJson, Adafruit SSD1306 + GFX, WiFiClientSecure with `setInsecure()` (prototype only; disclose) |
| Edge | Python 3 on the Pi, OpenCV; the QNX AI module is decided by Alex after talking to QNX |
| Voice | ElevenLabs text-to-speech via the server only |
| Messaging | Photon iMessage agent via the server only |
| Handoff agent | CREAO agent on agent.creao.ai, called from the server via API Trigger |
| Observability | Sentry (server + web) |
| LLM for iMessage status Q&A | Gemini API (fast), NOT CREAO (CREAO runs take minutes) |

Secrets live only in `server/.env` and Vercel env vars. Never in the browser or firmware repo code. Never commit `.env`. The only secret on the ESP32 is `DEVICE_TOKEN` and Wi-Fi credentials, kept in `firmware/secrets.h` (gitignored).

## 6. Folder ownership (the main merge-conflict defence)

You may only edit files in your own folders. Need a change elsewhere? Message the owner or add a line to `shared/CONTRACT_REQUESTS.md`.

| Path | Owner |
| --- | --- |
| `shared/contract.md`, `shared/fixtures/*` | Anay (locked) |
| `server/` core (`main.py`, `routes/`, `models.py`, `db.py`, `escalation.py`, `tts.py`, `sentry_setup.py`) | Anay |
| `server/integrations/photon.py`, `server/integrations/elevenlabs.py` | Anay |
| `server/integrations/creao.py`, `server/integrations/telephony.py` | Rey |
| `web/` (everything except `web/src/cv/`) | Rey |
| `web/src/cv/`, `benchmark/` | Josh |
| `firmware/`, `edge/` | Alex |

Alex has CV experience and is the CV reviewer: Alex does a 20 minute pairing with Josh at 2 PM (landmarks to the 42-number vector, how to test the classifier) and reviews Josh's approach at the 3 PM and 6 PM checkpoints, but does not edit `web/src/cv/` (Josh does, via PR). The edge node in `edge/` reuses the same feature vector and classifier logic in Python, so it must match `web/src/cv/features.ts`.
| `docs/`, README sections | whoever writes them; use separate files `docs/<name>.md` |
| `shared/status/<name>.md`, `shared/changelog/<name>.md` | each person owns their own file |

Status and changelog are per-person files so nobody ever edits the same file.

## 7. Git rules

- Branch per person: `anay/...`, `rey/...`, `josh/...`, `alex/...`. Small PRs into `main`. Squash merge.
- `git pull --rebase origin main` before every push. Never force-push `main`.
- Commit at least every 30 to 45 minutes. Message format: `area: what changed`.
- Create the root `.gitignore` BEFORE the first commit (provided). Never commit `.env`, `secrets.h`, `node_modules`, `.venv`, model files.
- Final code freeze is 8:00 AM Sunday. 8:00 to 11:00 AM is reserved for the demo video, README, track evidence and Devpost; only bug fixes merge after 8:00 AM. Submit target 11:00 AM, with 11:00 to 12:00 as buffer.
- Merge freezes: see the plan doc. After 12:30 AM only Josh (4 to 6 AM) and the morning crew merge, and only to their own folders.
- If a merge conflict happens, the file's owner resolves it. Do not "fix" someone else's file.

## 8. Data models (JSON on the wire)

Patient (hard-coded demo patient, served by `GET /api/patients/p_demo`):
```json
{"id":"p_demo","name":"Maria","vocabulary":[
 {"label":"water","display":"Water","speech":"I would like some water, please."},
 {"label":"pain","display":"Pain","speech":"I am in pain. Please come."},
 {"label":"help","display":"Help","speech":"I need help. Please come."},
 {"label":"bathroom","display":"Bathroom","speech":"I need to use the bathroom."}]}
```
Sample: `{"id":"s_1","patient_id":"p_demo","label":"water","vector":[42 floats],"created_at":"ISO8601"}`
Feature vector (Josh owns the exact function in `web/src/cv/features.ts`): 21 hand landmarks, subtract the wrist, divide by the max distance from the wrist, flatten x and y, giving 42 numbers. "neutral" is a class like any other.
Request:
```json
{"id":"r_1","patient_id":"p_demo","label":"water","display":"Water","speech":"I would like some water, please.",
 "confidence":0.91,"source":"browser","status":"open","escalation_level":0,
 "created_at":"ISO8601","acked_at":null,"acked_by":null,"ack_latency_ms":null}
```
`status`: `open` or `acked`. `escalation_level`: 0 none, 1 message sent, 2 call placed. `acked_by`: `button`, `dashboard`, `imessage`, `call`.
DeviceState (what the ESP32 polls):
```json
{"device_id":"beacon_1","mode":"alert","active_request":{"id":"r_1","display":"Water","created_at":"ISO8601"},"message":null}
```
`mode`: `idle`, `alert`, `acked`. When acked, `message` is a short string like "On the way" shown for 5 seconds on the OLED.

## 9. HTTP API (all JSON unless noted; base URL is `PUBLIC_BASE_URL`)

| Method and path | Who calls | Purpose |
| --- | --- | --- |
| `GET /health` | Sentry Uptime | 200 if server is up |
| `GET /api/device/health` | Sentry Uptime | 200 if a device heartbeat arrived in the last 15 s, else 503 |
| `GET /api/patients/{id}` | web | patient and vocabulary |
| `GET /api/patients/{id}/samples` | web | all stored samples |
| `POST /api/patients/{id}/samples` | web | store one sample `{label, vector}` |
| `DELETE /api/patients/{id}/samples` | web | reset training (demo) |
| `POST /api/requests` | web, edge | body `{patient_id,label,confidence,source}` creates a request, starts escalation, returns the Request |
| `GET /api/requests?patient_id=&since=` | web | list, newest first; `since` is an ISO timestamp |
| `POST /api/requests/{id}/ack` | web | body `{by}` acknowledge from the dashboard |
| `GET /api/device/state?device_id=` | ESP32 | header `X-Device-Token`; returns DeviceState |
| `POST /api/device/ack` | ESP32 | header `X-Device-Token`; body `{device_id}`; acks the active request with `by:"button"` |
| `POST /api/device/heartbeat` | ESP32 | header `X-Device-Token`; body `{device_id,rssi}` |
| `POST /api/tts` | web | body `{text}`; returns `audio/mpeg`; cached on disk by hash |
| `POST /api/webhooks/photon` | Photon | inbound iMessage; parse acknowledgements and status questions |
| `POST /api/reports/handoff` | web | starts a CREAO run, returns `{job_id}` |
| `GET /api/reports/handoff/{job_id}` | web | `{status:"pending"|"done"|"failed", summary_md}` |
| `GET /api/benchmark` | web | contents of `benchmark/results.json` |

Errors: JSON `{"error":"message"}` with a correct HTTP status. The web UI must handle a down server without crashing.

## 10. Behaviour rules

- Trigger (Josh): same non-neutral label for 12 consecutive frames (about 1 second) with kNN confidence at least 0.8, then an 8 second cooldown. Show a progress ring so the person sees it filling. Never fire on "neutral".
- Training (Josh): 15 samples per label, captured over a 3 second hold. After training, show leave-one-out accuracy as a percentage.
- Escalation (Anay, server): at 0 s create request, beacon alert, bedside voice. At `ESCALATE_MESSAGE_AFTER_S=20` send the iMessage. At `ESCALATE_CALL_AFTER_S=75` place the call (only if `ENABLE_PHONE_CALL=true`). Stop everything on ack. Idempotent: never send the same escalation twice.
- Ack (Anay): from any channel, sets `status=acked`, records `ack_latency_ms`, sets the device state to `acked` for 5 seconds, and the bedside speaks "Help is coming."
- Photon inbound (Anay): a message starting with `1`, `ok`, `ack` or `on my way` acks the latest open request. `status` returns open requests. Other free text goes to Gemini with the last 24 hours of requests as context.
- Feature flags (env): `ENABLE_PHOTON`, `ENABLE_PHONE_CALL`, `ENABLE_CREAO`. If a layer is off or failing, the golden path must still work.
- Honest labels: any summary the CREAO agent fails to produce is replaced by a template and labelled "template summary".

### Fallback and optional hardware

- Only the Pi, its camera and the ESP32 are guaranteed. Gesture recognition always runs in the browser on a laptop or phone webcam; the Pi is only for the optional edge node.
- If the ESP32 or beacon is not working, set `ESCALATE_MESSAGE_AFTER_S=0` so the iMessage goes out immediately and is the main alert. Build iMessage before the bedside voice so it works by the 6 PM checkpoint.
- Extra bedside hardware (speaker or screen reading `/api/device/state`) is optional. Alex asks MLH at 5 PM. Go/no-go at the 6 PM checkpoint: only if the golden path works end to end and the hardware is in hand by 6:30 PM. Hard stop at 9 PM; if it is not working by then, drop it. Nothing new after the 12:30 AM freeze.

## 11. Sentry (Anay sets up, everyone keeps it healthy)

- Server: `sentry_sdk.init` with FastAPI integration, traces on, logs on. Custom spans: `request.create`, `escalation.message`, `escalation.call`, `request.ack`. Set tag `latency_ms` on ack.
- Web: `@sentry/react`, browser tracing, Session Replay on.
- Uptime monitors: `/health` and `/api/device/health`.
- Everyone: when you hit a real bug that a trace, log or replay helped you find, screenshot it and drop it in `docs/sentry-evidence/` with a one-line caption. This is our Sentry judging story; do not fake it.

## 12. Environment variables (`server/.env`, example in `.env.example`)

`PUBLIC_BASE_URL`, `DEVICE_TOKEN`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `PHOTON_*` (decided after reading Photon docs), `CAREGIVER_PHONE`, `CREAO_API_KEY`, `CREAO_AGENT_ID`, `GEMINI_API_KEY`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT=hackathon`, `ESCALATE_MESSAGE_AFTER_S`, `ESCALATE_CALL_AFTER_S`, `ENABLE_PHOTON`, `ENABLE_PHONE_CALL`, `ENABLE_CREAO`.
Web: `VITE_API_BASE`, `VITE_SENTRY_DSN`.
CREAO keys (`capi_...`) never go in the browser or firmware.

## 13. Fixtures and mocks (so nobody is blocked)

- `shared/fixtures/request_open.json`, `device_state_alert.json`, `device_state_idle.json`, `patient.json`.
- Until the real piece exists, build against fixtures: Rey uses `web/src/cv/mock.ts` (Josh replaces it) with a button that fires a fake request; Alex uses `curl` against fixtures or a tiny local mock server until Anay's server is live (Anay posts the public URL in the group chat by 4:30 PM).
- `/beacon` (Rey): a phone-friendly page that behaves like the ESP32 (polls device state, shows the word, beeps, big ACK button). This is the safety net if hardware fails. It must exist by 6 PM.

## 14. Design (Rey owns, kept simple)

- Visually calm, high contrast, big type. Patient screen: one large word at a time, oversized targets. Caregiver dashboard: live request cards, a clear ACK button, device status, history.
- Mockups in Paper first (30 minutes maximum), then build. Tokens in `web/src/styles/tokens.css`.
- The three screens a judge will see: training, a request firing, the caregiver alert. Make those beautiful; skip everything else.
- No empty states in demo screenshots. Seed realistic history for the dashboard.

## 15. Hardware spec (Alex owns)

- Pins in `firmware/pins.h` (check the S3 board's own pin numbers). Components: button (INPUT_PULLUP, debounced), active buzzer, LED(s), I2C OLED.
- Loop: every 1 s `GET /api/device/state`; `alert` → buzzer pattern, LED red, OLED shows `display`; `acked` → LED green, OLED shows `message` for 5 s; `idle` → LED dim, OLED shows "Ready". Every 5 s `POST /api/device/heartbeat`. Button press → `POST /api/device/ack`.
- Must keep working if Wi-Fi drops: show "OFFLINE" on the OLED and reconnect in a loop.
- Edge (stretch): Python on the Pi captures a camera frame, runs hand landmarks, and posts the same Request with `source:"edge"`. Gate: only continue if QNX boots with the camera working by 5 PM.

## 16. Definition of done per role

- Anay: server routes per section 9, deployed, escalation, TTS, Photon, Sentry, handoff note before leaving.
- Rey: `/patient`, `/caregiver`, `/beacon`, polished, consuming the real API, plus CREAO and telephony integrations after 9 PM.
- Josh: `useGestureTrigger()` hook, training flow, kNN, benchmark and `results.json`.
- Alex: firmware on the real ESP32 hitting the live server, physical build, optional Pi/QNX node, demo hardware set.

## 17. Track evidence checklist (README sections, owner in brackets)

- Sentry: traces, a real bug story, replay, uptime alert screenshot [everyone, Anay compiles].
- CREAO: agent ID and a share link to a run in the README [Rey].
- Photon: screenshot of the iMessage thread [Anay].
- QNX: photo of the board running our node plus the AI module used [Alex].
- Espressif: photo of the ESP32 unit working [Alex].
- ElevenLabs: voice output used for the bedside and the call [Anay].
- Paper: link to the design file [Rey]. Devin: note on what Devin built, with a screenshot [whoever uses it].
