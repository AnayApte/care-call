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
