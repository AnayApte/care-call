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
- L4 Adaptation agent (CREAO, committed track): between sessions, a CREAO agent reads how the patient's gestures actually performed and proposes settings tuned to that patient, which the caregiver approves. See section 19.
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
- Server is deployed to a public HTTPS host (Railway or Render) by Anay by 5:15 PM. Everything talks to it. This avoids venue Wi-Fi device-to-device blocking.
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
| `agents/<name>.md` | each person owns their own file |
| `docs/`, README sections | whoever writes them; use separate files `docs/<name>.md` |
| `shared/status/<name>.md`, `shared/changelog/<name>.md` | each person owns their own file |

Status and changelog are per-person files so nobody ever edits the same file.

Alex has CV experience and is the CV reviewer: Alex does a 20 minute pairing with Josh at 3 PM (landmarks to the 42-number vector, how to test the classifier) and reviews Josh's approach at the 4 PM and 6:30 PM checkpoints, but does not edit `web/src/cv/` (Josh does, via PR). The edge node in `edge/` reuses the same feature vector and classifier logic in Python, so it must match `web/src/cv/features.ts`.


## 7. Git rules

- Branch per person: `anay/...`, `rey/...`, `josh/...`, `alex/...`. Small PRs into `main`. Squash merge.
- `git pull --rebase origin main` before every push. Never force-push `main`.
- Push to your branch and merge a small PR to `main` at least once an hour, on the hour (4:00, 5:00, 6:00 ...) until the 12:30 AM freeze. Small and often beats big and late. Commit at least every 30 to 45 minutes. Message format: `area: what changed`.
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
| `POST /api/cv/sessions` | web | store one gesture session summary (section 19) |
| `POST /api/requests/{id}/feedback` | web | body `{correct: boolean}`; caregiver marks a request right or wrong |
| `POST /api/adapt/run` | web | starts the CREAO adaptation run for the patient, returns `{job_id}` |
| `GET /api/adapt/{job_id}` | web | `{status:"pending"|"done"|"failed", proposal: AdaptConfig|null, explanation_md}` |
| `GET /api/patients/{id}/adapt-config` | web | the approved AdaptConfig (defaults if none) |
| `PUT /api/patients/{id}/adapt-config` | web | body AdaptConfig; stores it after the caregiver taps Apply |
| `POST /api/reports/handoff` | web | optional extra: shift-handoff summary from a CREAO run, returns `{job_id}` |
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
- If the ESP32 or beacon is not working, set `ESCALATE_MESSAGE_AFTER_S=0` so the iMessage goes out immediately and is the main alert. Build iMessage before the bedside voice so it works by the 6:30 PM checkpoint.
- Extra bedside hardware (speaker or screen reading `/api/device/state`) is optional. Alex asks MLH at 5 PM. Go/no-go at the 6:30 PM checkpoint: only if the golden path works end to end and the hardware is in hand by 7:00 PM. Hard stop at 9 PM; if it is not working by then, drop it. Nothing new after the 12:30 AM freeze.

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
- Until the real piece exists, build against fixtures: Rey uses `web/src/cv/mock.ts` (Josh replaces it) with a button that fires a fake request; Alex uses `curl` against fixtures or a tiny local mock server until Anay's server is live (Anay posts the public URL in the group chat by 5:15 PM).
- `/beacon` (Rey): a phone-friendly page that behaves like the ESP32 (polls device state, shows the word, beeps, big ACK button). This is the safety net if hardware fails. It must exist by 6:30 PM.

## 14. Design (Rey owns, kept simple)

- Visually calm, high contrast, big type. Patient screen: one large word at a time, oversized targets. Caregiver dashboard: live request cards, a clear ACK button, device status, history.
- Mockups in Paper first (30 minutes maximum), then build. Tokens in `web/src/styles/tokens.css`.
- The three screens a judge will see: training, a request firing, the caregiver alert. Make those beautiful; skip everything else.
- No empty states in demo screenshots. Seed realistic history for the dashboard.

## 15. Hardware spec (Alex owns)

- Hardware we actually have (MLH rental): Grove LCD RGB Backlight (I2C, 16x2; use it instead of an OLED, and its backlight colour replaces the LEDs: red alert, green acked, dim idle), Grove button x2, Grove buzzer, Grove and plain jumper wires (6 of each kind), breadboard, about 10 resistors, Logitech webcam, Google Nest Mini (Bluetooth speaker, paired to the laptop that runs the patient page), Raspberry Pi 4 kit plus our HiPi board, ESP32-S3. No LED socket kit.
- Pins in `firmware/pins.h` (check the S3 board's own pin numbers). Components: button (INPUT_PULLUP, debounced), active buzzer, I2C Grove LCD (power from the 5V pin; test it first, and if the display is garbled add a level shifter or check the module version).
- Loop: every 1 s `GET /api/device/state`; `alert` → buzzer pattern, backlight red, LCD shows `display`; `acked` → backlight green, LCD shows `message` for 5 s; `idle` → backlight dim, LCD shows "Ready". Every 5 s `POST /api/device/heartbeat`. Button press → `POST /api/device/ack`.
- Must keep working if Wi-Fi drops: show "OFFLINE" on the LCD and reconnect in a loop.
- Edge (stretch): Python on the Pi captures a camera frame, runs hand landmarks, and posts the same Request with `source:"edge"`. Gate: only continue if QNX boots with the camera working by 5 PM.

## 16. Definition of done per role

- Anay: server routes per section 9, deployed, escalation, TTS, Photon, Sentry, handoff note before leaving.
- Rey: `/patient`, `/caregiver`, `/beacon`, polished, consuming the real API, plus the CREAO adaptation agent and its Apply card (section 19); the phone call only if time allows.
- Josh: `useGestureTrigger()` hook, training flow, kNN, benchmark and `results.json`, `session.ts` and `adapt.ts` (section 19), plus the stretch model comparison in section 18.
- Rey (also): leads the simulated-impairment data collection in section 18 at 9 PM, with Josh.
- Alex: firmware on the real ESP32 hitting the live server, physical build, optional Pi/QNX node, demo hardware set.

## 17. Track evidence checklist (README sections, owner in brackets)

- Sentry: traces, a real bug story, replay, uptime alert screenshot [everyone, Anay compiles].
- CREAO: agent ID, a share link to a run and the Apply card screenshot in the README [Rey].
- Photon: screenshot of the iMessage thread [Anay].
- QNX: photo of the board running our node plus the AI module used [Alex].
- Espressif: photo of the ESP32 unit working [Alex].
- ElevenLabs: voice output used for the bedside and the call [Anay].
- Paper: link to the design file [Rey]. Devin: note on what Devin built, with a screenshot [whoever uses it].

## 18. Model and data (Rey's idea: train on stroke-like movement)

We have no stroke patients and no verified public dataset of post-stroke hand movement, and we will not claim either. What we can do honestly is collect our own data from teammates simulating limited dexterity, and show that a personal model beats a generic one on it.

- Simulated impairment (about 30 minutes, 9 PM, Rey and Josh, Alex helps): each teammate records the same 3 request labels plus "neutral" in 3 conditions: normal hand, 2 fingers taped together, and non-dominant hand wearing a glove. Use the collect page in `benchmark/` (Josh builds it from the training flow, it exports `benchmark/data/*.json`, one file per person and condition). Label every file with `simulated: true`.
- Models compared on that data (Josh, in `benchmark/`): (1) MediaPipe generic gesture recognizer, (2) personal kNN (the shipped model), (3) stretch: a small model such as logistic regression or a tiny MLP trained on the same 42-number features. Report accuracy per condition in `benchmark/results.json`. Leave-one-out within a person; never test on the same samples used to train.
- The shipped model stays kNN unless the stretch model is clearly better and still trains in under 5 seconds in the browser. Do not change the training UI for the stretch model.
- Pitch and README wording: "tested with teammates simulating limited dexterity", never "tested on stroke patients". Add the line "assistive prototype, not a medical device".
- Cut order: if short on time, drop (3), then drop the extra conditions, keep (1) vs (2).

## 19. CREAO: the Adaptation agent (committed track)

We are committing to the CREAO track, and the agent is part of how the product works, not an add-on. The idea: a stroke patient's movement changes day to day (fatigue, tremor, a better or worse day). The agent looks at how the patient's gestures actually performed and proposes settings that fit them better, so the system adapts to the patient instead of the patient adapting to the system.

CREAO rules require a CREAO agent on agent.creao.ai doing real core work, so the agent is built and run there. CREAO runs take minutes and do not stream, so it never classifies frames and never sits on the live path. It tunes between sessions. The browser kNN stays the real-time classifier and works with the agent off.

**What the browser collects (Josh, `web/src/cv/session.ts`):** a session summary per use, posted with `POST /api/cv/sessions` when the patient page closes or every 10 minutes:
```json
{"patient_id":"p_demo","started_at":"...","ended_at":"...",
 "config_version":1,
 "labels":{"water":{"attempts":9,"fired":6,"abandoned":3,"mean_conf":0.84,"min_conf":0.61,"mean_hold_frames_to_fire":15},
           "pain":{"attempts":7,"fired":2,"abandoned":5,"mean_conf":0.71,"min_conf":0.48,"mean_hold_frames_to_fire":22}},
 "confusions":[{"intended":"pain","predicted":"help","count":4}],
 "false_triggers_neutral":2}
```
Caregiver feedback ("that was wrong" on a request in `/caregiver`, Rey's UI) calls `POST /api/requests/{id}/feedback`.

**What goes to the agent (Anay's route `POST /api/adapt/run`, calling Rey's `creao.py`):** the patient, the current AdaptConfig, the last 5 session summaries and the recent feedback, as JSON.

**What the agent returns (an AdaptConfig proposal plus a plain-words explanation):**
```json
{"version":2,"hold_frames":14,"min_confidence":0.8,
 "labels":{"pain":{"min_confidence":0.7,"hold_frames":18}},
 "retrain_labels":["pain"],
 "suggest_replace":[{"label":"pain","reason":"often confused with help"}],
 "explanation_md":"Pain was abandoned 5 of 7 times and mixed up with help 4 times. Suggest a slightly longer hold and re-recording pain."}
```

**Human in the loop and safety rails:** the caregiver sees the proposal and the explanation on `/caregiver` with Apply and Dismiss. Nothing changes without a tap. `web/src/cv/adapt.ts` (Josh) clamps every value (`hold_frames` 6 to 30, `min_confidence` 0.6 to 0.95) and ignores unknown keys, so a bad agent output can never break the trigger. Apply calls `PUT /api/patients/{id}/adapt-config`; the patient page reads the config at start. "Retrain" labels open the existing training flow for just those labels.

**Interface between folders (Rey writes `server/integrations/creao.py`, Anay's routes call it):** `start_adaptation(patient: dict, config: dict, sessions: list[dict], feedback: list[dict]) -> str` returns a job id; `get_adaptation(job_id: str) -> {"status":"pending"|"done"|"failed","proposal":dict|None,"explanation_md":str|None}`. If the job fails, show "Could not generate a suggestion" and change nothing. Never invent a fallback proposal.

**Demo data (Anay, `server/seed.py`):** seed 3 to 5 synthetic session summaries for Maria, shaped like the example above (one flaky label, one confusion pair), so the agent has real input. Josh's live sessions append to the same table.

**Demo plan:** runs take minutes, so run the agent before the demo on the seeded data and keep the finished result. Live, show: the session summary showing the flaky label, the "Suggest adjustments" card with the finished CREAO result and a link to the run, tap Apply, then the benchmark or training screen showing the effect. Say plainly in the demo that the run was done ahead because it takes a few minutes.

**Optional extra (only if everything else is done):** the same agent also writes a shift-handoff summary from the request log (`POST /api/reports/handoff`). Cut this first.

**Order of work:** Rey builds the agent on agent.creao.ai first, with a pasted sample session summary and no server, and gets one good run and a share link by about 8 PM. Then wire `creao.py`. Josh needs `session.ts` and `adapt.ts` working before the 9 PM data collection ends. CREAO comes before the phone call.

**Evidence for Devpost (Rey, save in `docs/`):** the agent ID, a share link to one real run, a screenshot of the agent on agent.creao.ai, and the Apply card in `/caregiver`. Select the CREAO track on Devpost.

**Honesty:** the agent tunes settings from synthetic data. It does not train the model, diagnose, or give clinical advice. Describe it as "adapts the settings to how this person actually moves", not as treating or monitoring a real patient.
