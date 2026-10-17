# Status: anay

Updated: 2026-10-17 (step 1: server skeleton)

Works:
- `server/` FastAPI skeleton. Run from repo root: `server/.venv/bin/python3 -m uvicorn server.main:app --port 8000` (venv is Python 3.12; `pip install -r server/requirements.txt`).
- Every contract section 9 route exists and returns fixture-shaped JSON. Errors are `{"error": "..."}`. CORS open for the web app.
- `/health`, `/api/device/health` (503 if no heartbeat in 15 s).
- ESP32 routes check `X-Device-Token` (401 if wrong, 503 if the server has no `DEVICE_TOKEN`).
- Request create/list/ack, device state idle -> alert -> acked (5 s, "On the way") -> idle, button ack, samples CRUD.

Stubs (for now):
- State is in memory (lost on restart). SQLite comes in step 2.
- No escalation timer yet (step 2). `/api/tts` returns 501. Photon webhook accepts and ignores.
- CREAO routes: `/api/adapt/run` returns `{"job_id":"stub"}`, `/api/adapt/{id}` always returns `failed` with no proposal. Sessions/feedback are accepted but not stored.

Blocked / need:
- Not deployed yet (Railway/Render).

Next:
- Step 2: SQLite storage, escalation timer, acks.
