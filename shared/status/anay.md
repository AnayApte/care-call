# Status: anay

Updated: 2026-10-17 (step 3: CREAO plumbing + seed)

Works:
- **Deployed:** https://care-call-production.up.railway.app (Railway, `server/Dockerfile`, SQLite on a volume at `/data`). Device token: ask Anay (DM only).
- `server/` FastAPI. Run from repo root: `server/.venv/bin/python3 -m uvicorn server.main:app --port 8000` (venv is Python 3.12; `pip install -r server/requirements.txt`). API page at `/docs`.
- Every contract section 9 route exists. Errors are `{"error": "..."}`. CORS open.
- SQLite (`server/carecall.db`, gitignored; override with `DB_PATH`): samples, requests, device heartbeats and ack display state survive restarts.
- Escalation timer (`server/escalation.py`): iMessage step at `ESCALATE_MESSAGE_AFTER_S` (if `ENABLE_PHOTON`), call step at `ESCALATE_CALL_AFTER_S` (if `ENABLE_PHONE_CALL`). Ack stops it; a step can only ever run once; open requests resume their timers after a restart.
- Ack from the button (`/api/device/ack`) and dashboard (`/api/requests/{id}/ack`): sets `acked`, `ack_latency_ms`, device shows `acked` / "On the way" for 5 s.
- Device routes check `X-Device-Token`; `/api/device/health` 503 with no heartbeat in 15 s.
- CREAO plumbing (section 19): `POST /api/cv/sessions` (validated, stored), `POST /api/requests/{id}/feedback`, `GET`/`PUT /api/patients/{id}/adapt-config` (defaults if none), `POST /api/adapt/run` sends patient + config + last 5 sessions + last 20 feedback to `creao.start_adaptation`, `GET /api/adapt/{id}` calls `creao.get_adaptation`.
- Never invents a proposal: crash, bad shape, `done` with no proposal, CREAO off or `creao.py` missing all give `failed` (run returns 503/502 `{"error"}`).
- `server/seed.py`: 4 synthetic sessions for Maria ("pain" flaky, often confused with "help"). Run `server/.venv/bin/python3 -m server.seed`; rerunning replaces only the seed.

Stubs:
- `integrations/photon.py` only logs. Photon sends only through its TypeScript SDK (`spectrum-ts`); no HTTP send endpoint found. Needs a decision (see below).
- Call step needs Rey's `integrations/telephony.py` with `place_call(request: dict)`; skipped with a warning until then (not in the contract yet).
- `/api/tts` 501. Handoff report (optional extra) returns 501.

Blocked / need:
- Photon from a Python server: decide how to send (small Node sidecar would be a new runtime, needs a contract change).

Next:
- Photon bridge, TTS, Sentry.
- Needs Rey's `integrations/creao.py` to make adapt runs real.
