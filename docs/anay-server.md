# Care Call server: handoff guide (Anay's parts)

Everything Anay built, how it works, how to change it, and how to fix it. Written for teammates working on it while Anay is offline.

No secret values are in this file. **Every live value is in Railway → `care-call` → Variables → Raw Editor.** Never commit `.env`, and never paste keys in the group chat.

---

## 1. The 60-second version

- **Live server:** `https://care-call-production.up.railway.app`. Interactive API page: `/docs`.
- **What it does:** stores requests and training samples. Runs the escalation: beacon/Pi alert at 0 s, iMessage at 20 s, phone call at 75 s. Takes acks from the button, dashboard, iMessage or call. Speaks with ElevenLabs. Answers iMessage questions with Gemini. Reports to Sentry. Holds the CREAO adaptation plumbing.
- **Code:** `server/` (Python FastAPI + SQLite) and `server/photon-bridge/` (small Node program for iMessage). Pi scripts are in `edge/`.
- **Deploys:** Railway builds `server/Dockerfile` from **`main`**. If it doesn't deploy on its own after a merge, use **Railway → ⌘K → "Deploy latest commit"**. **Redeploy** re-runs the *old* commit.
- **Golden rules:**
  1. **Only one Photon bridge may run at a time.** Never run the server locally with `ENABLE_PHOTON=true`; the live server already runs it, and two bridges both answer every iMessage.
  2. Never commit `.env` or keys. ElevenLabs auto-disables keys it finds on GitHub.
  3. `shared/contract.md` is the source of truth for API shapes.

### Branches (as of ~8 PM Saturday)

| Branch | What | State |
| --- | --- | --- |
| `main` | Everything in this guide: server, Photon bridge, TTS, Sentry, Gemini, phone-call code (off until section 13 is done), Pi scripts in `edge/` | Live on Railway after "Deploy latest commit" |

No open branches from Anay. Pi scripts (`edge/`) were merged by Anay; Alex owns that folder from here.

--- | --- | --- |
| `main` | Everything below except the two branches in this table | Live on Railway |
| `anay/phone-call` | Phone call at 75 s (ElevenLabs agent over Photon SIP), `/api/webhooks/call`, full `server/.env.example`, handoff notes, this doc | Safe to merge: calls stay off until `ENABLE_PHONE_CALL=true`. Needs the setup in section 13. |
| `anay/caregiver-pi` | `edge/caregiver/caregiver.py`, `edge/caregiver/test_lcd.py`, `edge/bedside/bedside.py` | Caregiver Pi tested live. **Alex: review and merge.** |

---

## 2. How the pieces fit

```
Patient page (web, Rey/Josh) --POST /api/requests--> SERVER (Railway) <--poll 1 s-- Caregiver Pi (button, buzzer, LCD)
                                                        |    ^         <--poll 1 s-- Bedside Pi (speaker: "Help is coming")
                                   localhost HTTP       |    |         <--poll 1 s-- /beacon page (phone fallback, Rey)
                                                        v    |
                                          Photon bridge (Node, same container) <--> iMessage on caregiver's phone
                                                        |
                    ElevenLabs (TTS + phone agent) <----+----> Gemini (free-text answers)    Sentry (everything)
```

- The Pis **never talk to each other**; the server relays everything. That's why venue Wi-Fi blocking device-to-device traffic doesn't matter.
- One request goes: created → caregiver Pi/beacon turns **red + beeps** → **20 s**: iMessage text + poll → **75 s**: phone call → the first ack from any channel stops everything → device shows **green "On the way"** for 5 s → the bedside says **"Help is coming."**

---

## 3. Accounts and access (everyone was added as a collaborator)

| Service | Used for | Where | Key names |
| --- | --- | --- | --- |
| GitHub | code | `AnayApte/care-call` | — |
| Railway | hosts server + bridge | project `care-call` | all server variables |
| Photon | iMessage text, poll, replies; SMS number for calls | app.photon.codes, project `lahacks` | `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET` |
| ElevenLabs | bedside voice (voice "Sarah" `EXAVITQu4vr4xnSDxMaL`); phone agent | Anay's account | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID` |
| Sentry | errors, traces, logs, profiling, AI spans | team `#lahacks`, project `care-call` | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` |
| Google AI Studio | Gemini replies | Anay's Gmail. Anyone can make a free key and swap it in Railway. | `GEMINI_API_KEY` |
| CREAO | adaptation agent | Rey | `CREAO_API_KEY`, `CREAO_AGENT_ID` |
| Vercel | web app | Rey | `VITE_API_BASE`, `VITE_SENTRY_DSN` |

---

## 4. Environment variables

Live values: Railway → Variables. Local template: `server/.env.example` (copy it to `server/.env`).

| Variable | Meaning | Live | Local |
| --- | --- | --- | --- |
| `PUBLIC_BASE_URL` | the server's own URL | Railway URL | `http://localhost:8000` |
| `DEVICE_TOKEN` | shared secret for the Pis, `/beacon`, the bridge and the call tool (header `X-Device-Token`) | long random string | `dev-token` |
| `BRIDGE_SECRET` | optional; secret for bridge ↔ server and the call tool. Defaults to `DEVICE_TOKEN`. | unset | unset |
| `ESCALATE_MESSAGE_AFTER_S` | seconds before the iMessage | `20` | `20` |
| `ESCALATE_CALL_AFTER_S` | seconds before the phone call | `75` | `75` |
| `ENABLE_PHOTON` | run the iMessage bridge and send texts | `true` | **`false`** |
| `ENABLE_PHONE_CALL` | place the 75 s call | `false` until section 13 is done | **`false`** |
| `ENABLE_CREAO` | allow adapt runs | Rey decides | `false` |
| `CAREGIVER_PHONE` | who gets texts and calls; E.164, comma-separated for several | Anay's number. **Change it to tonight's caregiver.** | empty |
| `PHOTON_PROJECT_ID` / `PHOTON_PROJECT_SECRET` | Photon project credentials | set | copy if needed |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | TTS (and the call, once the key has ElevenAgents write) | set | copy |
| `ELEVENLABS_AGENT_ID` / `ELEVENLABS_AGENT_PHONE_NUMBER_ID` | phone call agent and imported Photon number | after section 13 | — |
| `GEMINI_API_KEY` | Gemini | set | copy |
| `GEMINI_MODELS` | optional; tried in order | default `gemini-3.5-flash,gemini-flash-latest,gemini-3.1-flash-lite` | same |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` | Sentry | `hackathon` | **`local`** |
| `SEED_DEMO` | reseed demo data on every boot | `true` | unset |
| `DB_PATH` | SQLite file | `/data/carecall.db` (set in the Dockerfile, on a Railway volume) | `server/carecall.db` |
| `TTS_CACHE_DIR` | saved voice clips | `/data/tts-cache` (Dockerfile) | `server/cache/tts` |
| `RAILWAY_DOCKERFILE_PATH` | tells Railway where the Dockerfile is | `server/Dockerfile` | — |

The server reads `server/.env` itself; no python-dotenv. Real environment variables win over the file. Duplicate lines: the **first** one wins, so don't leave an empty `KEY=` above a filled one.

---

## 5. Run it on your laptop

```bash
cd lahacks-starter
/opt/homebrew/bin/python3.12 -m venv server/.venv           # any Python 3.11+
server/.venv/bin/pip install -r server/requirements.txt
cp server/.env.example server/.env                           # fill keys from Railway, keep the safety switches
server/.venv/bin/python3 -m uvicorn server.main:app --port 8000
# open http://localhost:8000/docs
```

- Run from the **repo root**. The app is `server.main:app`.
- Demo data locally: `server/.venv/bin/python3 -m server.seed`
- Pre-generate the voice clips: `server/.venv/bin/python3 -m server.tts`

---

## 6. Deploy (Railway)

- Builds `server/Dockerfile` with the **repo root** as build context. Stage 1 installs the Node bridge; stage 2 is Python plus the node binary.
- Starts with `server/start.sh`:
  1. creates `/data`;
  2. reseeds if `SEED_DEMO=true`;
  3. pre-generates TTS in the background if an ElevenLabs key is set;
  4. starts the Photon bridge in a restart loop **only if `ENABLE_PHOTON=true`**;
  5. `exec uvicorn` on `$PORT`.
- **Volume** mounted at `/data`: the database and voice clips survive redeploys.
- **To deploy after a merge:** Railway → care-call → ⌘K → **Deploy latest commit**. Check the deploy shows the new commit hash.
- **Logs:** Deployments → active deploy → **Deploy Logs**.
  - Python logs start with `carecall.`.
  - Bridge logs start with `[bridge]`. Every inbound iMessage event is logged as `[bridge] inbound {...}`.
- **Is it live?** `curl https://care-call-production.up.railway.app/health` should return `{"ok":true}`.

---

## 7. Code map (`server/`)

| File | What's in it |
| --- | --- |
| `main.py` | App setup, CORS (open), JSON error handlers (`{"error": "..."}`), Sentry init, lifespan (DB init + resume escalation timers after restart) |
| `config.py` | All settings + the `.env` loader |
| `models.py` | Maria's patient record + vocabulary (hard-coded), default AdaptConfig, request body models |
| `db.py` | SQLite schema (`samples`, `requests`, `devices`, `cv_sessions`, `feedback`, `adapt_configs`), one short connection per call |
| `store.py` | Every database read/write. Requests are stored as integer `n` and exposed as `r_<n>`. Device state + `last_ack`, heartbeats. |
| `escalation.py` | Timers (`threading.Timer`), `claim_escalation` makes each step run once, `acknowledge()` (every ack goes through it: Sentry span + "already answered" iMessage) |
| `deps.py` | `X-Device-Token` check, patient lookup |
| `tts.py` | ElevenLabs TTS + disk cache (sha256 of voice+model+text). `python3 -m server.tts` pre-generates. |
| `seed.py` | 4 synthetic CREAO sessions + 10 answered requests (`source: "seed"`); also deletes `smoke_test` requests |
| `sentry_setup.py` | Sentry init (does nothing without `SENTRY_DSN`) |
| `routes/health.py` | `/health`, `/api/device/health` |
| `routes/patients.py` | patient, samples, adapt-config |
| `routes/requests.py` | create/list/ack requests, feedback |
| `routes/device.py` | Pi / beacon state, ack, heartbeat |
| `routes/photon.py` | iMessage webhook (from the bridge) + phone-call agent webhook |
| `routes/adapt.py` | CV sessions, CREAO adapt run/status, handoff report (not built, returns 501) |
| `routes/misc.py` | `/api/tts`, `/api/benchmark` |
| `integrations/photon.py` | Sends texts through the bridge, phone number formatting, caregiver check |
| `integrations/gemini.py` | Gemini answers with the last 24 h as context, model fallback |
| `integrations/telephony.py` | Phone call through the ElevenLabs agent |
| `photon-bridge/src/index.ts` | Node bridge: local `/send`, inbound loop → `/api/webhooks/photon`, polls |
| `Dockerfile`, `start.sh` | Railway build and startup |

---

## 8. API cheat sheet

Full list in contract section 9 and at `/docs`. Device routes need header `X-Device-Token`. All errors are `{"error": "..."}`.

```bash
B=https://care-call-production.up.railway.app
T="X-Device-Token: <DEVICE_TOKEN from Railway>"

# create a request (what the patient page does). source smoke_test = cleaned up on next boot
curl -X POST $B/api/requests -H 'Content-Type: application/json' \
  -d '{"patient_id":"p_demo","label":"water","confidence":0.9,"source":"smoke_test"}'

curl "$B/api/requests?patient_id=p_demo"                                  # list, newest first
curl -X POST $B/api/requests/r_5/ack -H 'Content-Type: application/json' -d '{"by":"dashboard"}'
curl -H "$T" "$B/api/device/state?device_id=caregiver_1"                  # what a Pi sees
curl -X POST -H "$T" -H 'Content-Type: application/json' -d '{"device_id":"caregiver_1"}' $B/api/device/ack
curl "$B/api/device/health?device_id=caregiver_1"                         # 200 online / 503 offline
curl -X POST $B/api/tts -H 'Content-Type: application/json' -d '{"text":"Help is coming."}' -o out.mp3
```

**DeviceState:**
`{"device_id","mode":"idle|alert|acked","active_request":{id,display,created_at}|null,"message":"On the way"|null,"last_ack":{request_id,display,acked_at,acked_by}|null}`
- `acked` lasts 5 s.
- `last_ack` stays for 120 s, so the bedside never misses it.

**Status codes to expect:**
- 401: bad device token / bridge secret
- 404: unknown request or patient
- 409: button pressed with nothing open (ignore it)
- 422: bad body (e.g. `label` "neutral", or a vector that isn't 42 numbers)
- 501: TTS without a key (old) / handoff report
- 502: ElevenLabs or CREAO failed
- 503: device offline (health) or CREAO off

---

## 9. Escalation and acks (`escalation.py`)

- When a request is created, `escalation.start()` sets two timers: message at `ESCALATE_MESSAGE_AFTER_S`, call at `ESCALATE_CALL_AFTER_S`.
- Each step **re-checks the request is still open**, then `claim_escalation(id, level)` raises `escalation_level` with a conditional database update. Only one caller can win, so **nothing is ever sent twice**, even across restarts.
- After a restart, `resume_all()` restarts the timers for open requests.
- **Level 1 is only set if Photon is on; level 2 only if `telephony.py` exists and `ENABLE_PHONE_CALL=true`.** A missing piece just logs a warning.
- **Acks:** every channel calls `escalation.acknowledge(id, by)`:
  - sets `acked`, `acked_at`, `acked_by` (`button` / `dashboard` / `imessage` / `call`), `ack_latency_ms`;
  - shows device `acked` for 5 s and `last_ack` for 120 s;
  - sends a Sentry span with tag `latency_ms`;
  - if the caregiver was already texted and the ack came from somewhere else, sends an "Update: … answered (button) after N s. No need to come." iMessage.
- **To change timings:** edit the Railway variables, then redeploy. If the caregiver Pi is broken, set `ESCALATE_MESSAGE_AFTER_S=0` so the text is the main alert.

---

## 10. Photon iMessage (`server/photon-bridge/` + `integrations/photon.py` + `routes/photon.py`)

**Why a bridge:** Photon only ships a TypeScript SDK (`spectrum-ts`) for sending. The Node bridge runs next to Python in the same container.
- **Python → bridge:** `POST http://127.0.0.1:8787/send` (header `X-Bridge-Secret`) with `{to:[phones], text, request_id?, poll_title?}`.
- **Bridge → Python:** `POST /api/webhooks/photon` with `{from, text, request_id?}`. Python answers `{reply}` and the bridge sends it back.

**What the caregiver gets at 20 s:** a text ("Maria needs: Water. "I would like some water, please." …") plus a **native iMessage poll**, "On my way" / "Can't come".

**What the caregiver can send:**
- Tap **On my way**, or text `1`, `ok`, `ack` or `on my way` → acks (the polled request, else the newest open one) → reply "Thanks. Water is marked as handled…"
- `status` → list of open requests.
- "Can't come" → "Okay. The alert stays open…"
- Anything else → **Gemini** answer from the last 24 h (falls back to help text if Gemini fails or hits its rate limit).
- Numbers not in `CAREGIVER_PHONE` are ignored.

**Changing the caregiver:**
1. Set `CAREGIVER_PHONE=+1XXXXXXXXXX` in Railway.
2. **Enroll that phone in the Photon project** (dashboard → users). Only enrolled phones can talk to the line.
3. Redeploy.

**Troubleshooting:**

| Symptom | Check |
| --- | --- |
| No text at 20 s | Railway: `ENABLE_PHOTON=true`, `CAREGIVER_PHONE` set. Deploy Logs: `[bridge] listening` at boot? `photon send failed`? |
| Replies come twice, or "Nothing is open" right after "Thanks" | **A second bridge is running somewhere.** Stop any local server or echo test using the Photon keys. |
| Poll tap does nothing | You tapped an **old** poll; tapping an already-chosen option un-votes. Tap the newest poll or text `1`. Check `[bridge] inbound` in the logs. |
| Bridge crashed | `start.sh` restarts it every 3 s. Look for `[bridge] exited`. |
| Gemini reply missing | Free tier is a few requests/minute; it falls back to the help text. Models are in `GEMINI_MODELS`. |

---

## 11. ElevenLabs TTS (`tts.py`, `/api/tts`)

- `POST /api/tts {"text": "..."}` returns `audio/mpeg`.
- Cached on the Railway volume, so repeats are instant and free.
- The 4 request sentences + "Help is coming." are generated at boot.
- Model `eleven_multilingual_v2`, voice Sarah. To change the voice, change `ELEVENLABS_VOICE_ID`; the cache key includes the voice, so it regenerates automatically.
- **Errors:** 503 means the key or voice is missing; 502 means ElevenLabs refused (check the key permission: **Text to Speech → Access**). The web bedside page should fall back to browser `speechSynthesis` on any error.
- The key has a credit limit set in ElevenLabs. If audio stops, check the usage there.

---

## 12. Sentry (`sentry_setup.py`)

- **On when `SENTRY_DSN` is set.** Environment `hackathon` is live; `local` / `local-test` are laptops. **Filter on `hackathon` for screenshots.**
- **Products in use:**
  - errors;
  - **tracing** (custom spans `request.create`, `request.ack` with tag `latency_ms`, `escalation.message`, `escalation.call` transactions);
  - **logs** (all `carecall.*` logs);
  - **profiling**;
  - **AI monitoring** (`gen_ai.chat` for Gemini with token counts, `gen_ai.invoke_agent` for CREAO);
  - releases (the Railway commit SHA).
- **No uptime monitors:** Sentry caps monitors per domain and `*.railway.app` is full. A custom domain would fix it.
- **Evidence for judging:** screenshot real bugs found through Sentry into `docs/sentry-evidence/` with a one-line caption (contract section 11).

---

## 13. Phone call at 75 s (code on `main`, NOT finished: account setup needed)

**Code (done, tested with a fake):** `integrations/telephony.place_call(request)` calls ElevenLabs `POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call` with:
- the agent ID and imported phone number ID;
- `to_number` = the first `CAREGIVER_PHONE`;
- dynamic variables `request_id`, `request_display`, `request_speech`, `waited_seconds`;
- a first message: "Hi, this is Care Call, calling about Maria. She said: … Nobody has answered for N seconds. Can you go to her now?"

The agent's tool calls `POST /api/webhooks/call` (header `X-Bridge-Secret` = `DEVICE_TOKEN`, body `{request_id}`), which acks with `by:"call"`.

**Setup steps (dashboards):**
1. **Photon:** add an **SMS number** to the project. Voice runs over SIP: server `sip.spectrum.photon.codes`, port **5061**, **TLS**, username = Photon project ID, password = Photon project secret.
2. **ElevenLabs → ElevenAgents → Create agent** "Care Call caregiver", calm voice. System prompt:
   ```
   You are Care Call, an assistive prototype (not a medical device). You are calling Maria's caregiver
   because Maria, who cannot speak, made a request that nobody has answered. Her request: {{request_speech}}.
   Keep every reply to one short sentence. Ask if they can go to her now. If they say yes or that they are
   on the way, call the mark_on_the_way tool once, then say "Thank you, Maria will hear that help is coming."
   and end the call. Never give medical advice; for emergencies tell them to call 911.
   ```
   **Tool (Webhook):**
   - name `mark_on_the_way`
   - `POST https://care-call-production.up.railway.app/api/webhooks/call`
   - header `X-Bridge-Secret: <DEVICE_TOKEN>`
   - body param `request_id` = `{{request_id}}`

   Copy the **Agent ID**.
3. **ElevenLabs → Phone Numbers → Import → SIP trunk:**
   - number = the Photon SMS number;
   - outbound address `sip.spectrum.photon.codes`, TLS, port 5061, username/password = Photon project ID/secret;
   - assign the agent.

   Copy the **phone number ID**.
4. **ElevenLabs API key:** add **ElevenAgents → Write** (it's TTS-only now).
5. **Railway:** `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID`, `ENABLE_PHONE_CALL=true`. Deploy (⌘K → Deploy latest commit).
6. **Test:** create a request and ignore everything. Text at ~20 s, call at ~75 s. Say "yes, I'm going" and the request should become `acked_by: "call"`.

If the call fails, Deploy Logs show `escalation.call failed … ElevenLabs outbound call failed (status): …`. The SIP part (steps 1 and 3) is the most likely problem, since the Photon voice docs are thin.

---

## 14. CREAO plumbing (for Rey; contract section 19)

- `POST /api/cv/sessions` stores session summaries (checked against the contract shape).
- `POST /api/requests/{id}/feedback {correct}` stores caregiver feedback.
- `GET/PUT /api/patients/p_demo/adapt-config`: defaults `{version:1, hold_frames:12, min_confidence:0.8, ...}` until Apply.
- `POST /api/adapt/run {patient_id}` calls `creao.start_adaptation(patient=, config=, sessions=, feedback=)` (**keyword arguments**) with the last 5 sessions + last 20 feedback items. `GET /api/adapt/{job_id}` calls `creao.get_adaptation(job_id)`.
- **It never invents a proposal:**
  - CREAO off → run returns 503, status returns `failed`;
  - `creao.py` missing → same;
  - the agent crashes or returns junk → `failed`.
- Rey's file: `server/integrations/creao.py`. Set `ENABLE_CREAO=true` in Railway when it's ready.

---

## 15. Demo data (`seed.py`)

Runs on every boot because `SEED_DEMO=true`:
- **4 synthetic sessions:** "pain" gets abandoned more often each day and is confused with "help".
- **10 answered requests over the last ~21 h** (`source: "seed"`), one "pain" marked wrong.
- It deletes earlier seeded rows and `smoke_test` requests.
- Real requests are never touched.
- The request list sorts by time, so real requests show above the seeded history.

---

## 16. Raspberry Pis (`edge/`, on `main`; Alex owns the folder)

Both use only the server. Settings in a `.env` next to each script: `SERVER_URL`, `DEVICE_TOKEN` (Railway value), `DEVICE_ID`.

### Caregiver Pi (`edge/caregiver/caregiver.py`, `device_id=caregiver_1`). Tested live.
- **Hardware:** Grove Base HAT. Button → **D5**, buzzer → **D16**, Grove LCD RGB → any **I2C** port. No breadboard.
- **Access:** `ssh aboldt7191@172.20.10.2` on **Alex's hotspot** (the IP changes with the hotspot).
- **Copy and run:**
  ```bash
  scp -r edge/caregiver aboldt7191@172.20.10.2:~/caregiver      # from the Mac, repo root
  # on the Pi:
  cd ~/caregiver && cp .env.example .env && nano .env          # set DEVICE_TOKEN
  python3 caregiver.py
  ```
- **Colours:** dim blue = ready, **red + beep** = alert, **green** = on the way (5 s), amber = offline.
- **The LCD text is not visible:** the text chip needs 5 V and the HAT gives 3.3 V, so we use **colour only** (decided Saturday). Don't wire 5 V without a level shifter; it can damage the Pi's pins. `test_lcd.py` checks the LCD (white light, no text = the 5 V issue).
- **Pins** are `BUTTON_PIN` / `BUZZER_PIN` in `.env` (BCM numbers = Grove port numbers).
- **Online check:** `curl "$B/api/device/health?device_id=caregiver_1"`.

### Bedside Pi (`edge/bedside/bedside.py`, `device_id=bedside_1`). Tested on a Mac, not yet on the Pi.
- Speaker of any kind. Run `sudo apt install -y mpg123` once.
- Downloads "Help is coming." from `/api/tts` once into `~/.carecall/`, then plays it **once per new `last_ack`**. It ignores acks from before it started.
- Run the same way: `scp -r edge/bedside <user>@<ip>:~/bedside`, then `.env`, then `python3 bedside.py`.

### Pi troubleshooting

| Symptom | Fix |
| --- | --- |
| `OFFLINE` / amber | No internet. On the Pi: `curl https://care-call-production.up.railway.app/health` |
| 401 in the output | Wrong `DEVICE_TOKEN` in `.env` (must be the Railway value, not `dev-token`) |
| Red but no beep / button does nothing | Wrong port. Check `BUZZER_PIN` / `BUTTON_PIN` match the Grove ports. |
| `[lcd] not available` | LCD not in an I2C port, or I2C off: `sudo raspi-config nonint do_i2c 0`. `i2cdetect -y 1` should show `3e` and `62`. |
| Bedside silent | `mpg123` installed? Speaker selected? Did the clip download (`~/.carecall/help_is_coming.mp3`)? |

---

## 17. Full test recipes

1. **Golden path with the Pi:** make sure `caregiver.py` is running and the LCD is blue. Create a request → red + beep → press the button → green. Check `acked_by` is `button`.
2. **Escalation:** create a request and don't press. ~20 s: text + poll → reply `1` or tap → "Thanks", and the Pi goes green.
3. **Already-answered update:** create, wait for the text, then press the Pi button → the phone gets "Update: … answered (button)…"
4. **Gemini:** text the line "how many water requests today?"
5. **TTS:** `curl -X POST $B/api/tts -H 'Content-Type: application/json' -d '{"text":"Help is coming."}' -o x.mp3 && open x.mp3`

---

## 18. Known gaps and ideas

- Phone call: needs the section 13 setup.
- Bedside Pi: not yet run on real hardware.
- LCD text: needs 5 V + level shifter (colour-only for now).
- Railway auto-deploy: the GitHub app may still lack repo access. Use "Deploy latest commit".
- Sentry uptime: blocked by the domain limit (needs a custom domain).
- Handoff report (`/api/reports/handoff`): not built, by design (cut first).
- Keys pasted in chat (ElevenLabs, device token): rotate them after the hackathon.
