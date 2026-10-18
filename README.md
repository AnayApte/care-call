# Beacon

After a stroke, many people can't speak or press a call button. **Beacon learns the movement a person can still make, says their request out loud, and alerts a caregiver, who answers with one button.**

> Assistive prototype, **not a medical device**. Synthetic patient ("Maria") only. Tested with teammates simulating limited dexterity, never with patients.

## What it does

1. **Teach it the person.** On the patient screen, the patient holds whatever movement they can manage for each word: *water*, *pain*, *help*, *bathroom*, plus a rest pose. That's 15 short holds per word, about a minute in total. This builds a personal classifier in the browser.
2. **Make the movement, hold it about a second.** A ring fills and a request is sent.
3. **The caregiver unit announces it.** A Raspberry Pi with a button, buzzer and light turns **red and beeps**. Its speaker says the request in a natural ElevenLabs voice: *"I would like some water, please."*
4. **One button to answer.** The light turns **green**, and the speaker says **"Help is coming."** and the patient screen shows the confirmation The patient screen goes back to listening on its own.
5. **No answer?** At **20 s** the caregiver gets an **iMessage (Photon)** with a native poll ("On my way" / "Can't come"). Tapping it, or replying `1`, answers the request. `status` lists open requests. Any other question ("what did she ask for today?") is answered by **Gemini** from the last 24 hours of requests, with no medical advice. The first answer from any channel cancels the rest, and each step happens once.
6. **It adapts.** Between sessions, a **CREAO** agent reviews how each word performed (abandoned, confused, slow). It proposes settings in plain words, e.g. *"pain was confused with help 4 times; try a longer hold and re-record pain"*. The caregiver taps **Apply** or **Dismiss**. Values are clamped to safe ranges, and nothing changes without a human.

## Why AI, specifically

Standard gesture recognisers assume a typical hand, so they fail exactly the people who need them.
- We trained a small network on **~1.05M public hand-pose samples** (HaGRIDv2, 95% validation accuracy) and use it **frozen, as an embedding**.
- A **personal kNN** compares each frame to the patient's own 15 examples per word. Adding a word or a patient is just more examples; the model never retrains.
- **Few-shot test** on 5 gesture classes held out of training: embedding **98.5%** mean vs raw landmarks **96.1%** (worst case 97.4% vs 94.1%). See `ml/report.md` and `ml/experiments.md`. This is public able-bodied data, not stroke data.

## Architecture

```
Patient laptop (web/, React + MediaPipe, personal kNN)  --POST /api/requests-->  Server (server/, FastAPI + SQLite on Railway)
                                                                                  |  ^
Caregiver Pi (edge/caregiver/: button, buzzer, light)  <--polls every 1 s---------+  |
Caregiver Pi speaker (edge/bedside/bedside.py, Bluetooth) <--polls every 1 s------+  |
/caregiver and /beacon pages (browser fallback)         <--polls every 1 s--------+  |
                                                                                  |
              Photon bridge (server/photon-bridge/, Node + spectrum-ts) <---------+---> iMessage
              ElevenLabs (cached voice clips)    Gemini (free-text answers)    CREAO (adaptation)    Sentry
```

Devices never talk to each other directly. The venue Wi-Fi blocks device-to-device traffic, so everything talks only to the cloud server.

## Sponsor tracks: what we used and where

| Track | What it does in Beacon | Where |
| --- | --- | --- |
| **Photon** | iMessage escalation at 20 s with a native poll; tap or reply to acknowledge; `status`; "already answered" updates. Photon ships only a TypeScript SDK, so a Node bridge runs next to the Python server in the same container. | `server/photon-bridge/`, `server/integrations/photon.py`, `server/routes/photon.py` |
| **ElevenLabs** | The voice of someone who can't speak: each request phrase plus "Help is coming", pre-generated and cached on the server, played by the external speaker; browser audio is off | `server/tts.py`, `POST /api/tts` |
| **Gemini** | Answers the caregiver's free-text iMessage questions from the day's request log; 3-model fallback; never gives medical advice | `server/integrations/gemini.py` |
| **CREAO** | Adaptation agent reviews session summaries and proposes clamped settings; caregiver approves with Apply. [Agent](https://agent.creao.ai/apps/ed1ff383-9e8c-4472-82e9-c62ffe28da1f), [verified run](https://agent.creao.ai/chat?threadId=e793d024-c2ad-464d-8a99-010813a1f883) | `server/integrations/creao.py`, `server/routes/adapt.py`, `/caregiver` report and Apply |
| **Sentry** | Tracing with custom spans (`request.create`, `request.ack` tagged `latency_ms`), Logs, Profiling, AI monitoring (Gemini token counts, CREAO spans), release tracking | `server/sentry_setup.py`, `docs/sentry-evidence/` |

## Run it

**Server** (Python 3.11+), from the repo root:
```bash
python3 -m venv server/.venv && server/.venv/bin/pip install -r server/requirements.txt
cp server/.env.example server/.env        # fill keys; keep the local safety switches
server/.venv/bin/python3 -m uvicorn server.main:app --port 8000   # API page: /docs
```
Deployed on Railway from `server/Dockerfile`. Full guide: [`docs/anay-server.md`](docs/anay-server.md).

**Web:**
```bash
cd web && npm ci
VITE_API_BASE=http://localhost:8000 npx vite      # /patient, /caregiver, /beacon
```

**Caregiver Pi:** `edge/caregiver/caregiver.py` (Grove Base HAT: button D5, buzzer D16, LCD on I2C), plus `edge/bedside/bedside.py` for the Bluetooth speaker. See [`docs/anay-server.md`](docs/anay-server.md) section 16.

## Honest limits

- Not a medical device; it doesn't detect or diagnose anything. Synthetic data only.
- The model was trained on able-bodied public data; "limited dexterity" was simulated by teammates.
- The caregiver unit's LCD shows colour only (its text needs 5 V; the Pi HAT gives 3.3 V).
- A phone-call escalation step is built in code but not live (it was waiting on Photon voice).
- Gesture recognition runs in the browser. Running it on the bedside Pi is future work.

## Team

Anay (server, integrations, deploy, hardware integration), Rey (web app, onboarding, ML training), Josh (computer vision, CREAO adaptation, software 2.0), Alex (hardware, QNX).

Project rules and API contract: `shared/contract.md`, `shared/contract-v2.md`.
