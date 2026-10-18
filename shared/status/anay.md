# Status: anay

Updated: 2026-10-17 ~6:40 PM

Works (live at https://care-call-production.up.railway.app, Railway deploys `main`):
- Every contract section 9 route. Errors are `{"error": "..."}`. CORS open. API page at `/docs`.
- SQLite on a Railway volume (`/data`): requests, samples, device state, sessions, feedback, adapt-config survive redeploys.
- Escalation: iMessage at 20 s, call at 75 s (if `ENABLE_PHONE_CALL`), stops on ack, each step once.
- Acks from button, dashboard and iMessage (`ack_latency_ms`, device `acked` / "On the way" for 5 s).
- **Photon iMessage** (tested on a real phone): text + native poll (On my way / Can't come). Tap or reply 1 / ok / ack / on my way acks. "status" lists open requests. Free text goes to **Gemini** (`gemini-3.5-flash` + 2 fallbacks) with the last 24 h as context; no medical advice. "Already answered" update when acked elsewhere. Only `CAREGIVER_PHONE` numbers are answered.
- `server/photon-bridge/`: Node + spectrum-ts sidecar in the same container. **Only one bridge may run at a time.**
- **ElevenLabs TTS** `POST /api/tts {text}` -> audio/mpeg, voice Sarah, cached on the volume; the 4 request phrases + "Help is coming." pre-generated on boot.
- **Sentry** (no uptime monitors: Sentry caps `*.railway.app` at 1000 monitors and it is full; skipped, we already use 4 products beyond errors): errors, tracing (custom spans request.create / request.ack with latency_ms / escalation.message / escalation.call), logs, profiling, AI agent spans (CREAO, Gemini). Live data is environment `hackathon`; laptop tests are `local`.
- CREAO plumbing: sessions, feedback, adapt-config, adapt run/status calling `creao.py` (clean `failed`, never an invented proposal).
- Demo seed on boot (`SEED_DEMO=true`): 4 synthetic sessions ("pain" flaky, confused with "help") + 10 answered requests over the last day (`source: "seed"`).

Blocked / need:
- Rey: `integrations/creao.py` and `telephony.py`; web pages on `main` (`/patient`, `/caregiver`, `/beacon`).
- Gemini free tier allows only a few requests per minute; on limit the caregiver gets the help text.

Next:
- Verify the deploy live; help teammates hit the live URL; handoff note at 8:45 PM.

## Handoff (services, access, keys) — no secret values here, they live in Railway → Variables

All teammates are collaborators on every service below (added 2026-10-17 ~7:45 PM).

| Service | Used for | Account | Key names |
| --- | --- | --- | --- |
| GitHub | code | `AnayApte/care-call` | — |
| Railway | live server + Photon bridge, `care-call-production.up.railway.app` | project `care-call` (deploys `main`; use ⌘K "Deploy latest commit" if it does not auto-deploy) | every server variable |
| Photon | iMessage alert + poll + replies; SMS number for calls | app.photon.codes, project `lahacks` (Anay's school login) | `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET` |
| ElevenLabs | bedside voice (Sarah `EXAVITQu4vr4xnSDxMaL`), phone agent | Anay's account | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID` |
| Sentry | errors, tracing, logs, profiling, AI spans | org team `#lahacks`, project `care-call`; filter env `hackathon` | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` |
| Google AI Studio | Gemini free-text iMessage replies | Anay's Gmail (anyone can swap in their own free key) | `GEMINI_API_KEY` |
| CREAO | adaptation agent | Rey | `CREAO_API_KEY`, `CREAO_AGENT_ID` |
| Vercel | web app | Rey | `VITE_API_BASE`, `VITE_SENTRY_DSN` |

Server variables (Railway): `PUBLIC_BASE_URL DEVICE_TOKEN SEED_DEMO ESCALATE_MESSAGE_AFTER_S ESCALATE_CALL_AFTER_S ENABLE_PHOTON ENABLE_PHONE_CALL ENABLE_CREAO PHOTON_PROJECT_ID PHOTON_PROJECT_SECRET CAREGIVER_PHONE ELEVENLABS_API_KEY ELEVENLABS_VOICE_ID ELEVENLABS_AGENT_ID ELEVENLABS_AGENT_PHONE_NUMBER_ID GEMINI_API_KEY SENTRY_DSN SENTRY_ENVIRONMENT CREAO_API_KEY CREAO_AGENT_ID RAILWAY_DOCKERFILE_PATH`

Hardware: caregiver Pi `ssh aboldt7191@172.20.10.2` on Anay's phone hotspot, script `~/caregiver/caregiver.py` (+ `.env`); bedside Pi script in `edge/bedside/`. Both use the Railway `DEVICE_TOKEN`.

Before Anay leaves:
1. `CAREGIVER_PHONE` is Anay's number: change it in Railway to whoever demos as caregiver and enroll their phone in the Photon project.
2. The Pis use Anay's hotspot: move them to another hotspot (new Wi-Fi on each Pi; IPs change).
3. Only one Photon bridge may run: never run the server locally with `ENABLE_PHOTON=true`.
4. Rotate the ElevenLabs key and `DEVICE_TOKEN` after the hackathon (they were pasted in chat).
