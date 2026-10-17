# Agent brief: Anay (server, integrations, deploy)

Owns: `shared/` (contract, fixtures), `server/` core, `server/integrations/photon.py`, `server/integrations/elevenlabs.py`, `agents/anay.md`.
Awake and building: now until 9 PM, then 6 to 7 AM onward. Leaving at 9 PM, so leave a handoff note in `shared/status/anay.md` at 8:45 PM.

## First tasks (in order)
1. Create the server skeleton in `server/`: FastAPI, SQLite, venv, `python3 -m uvicorn`. Implement the endpoints in contract section 9 returning fixture-shaped data first: `/health`, `/api/device/state`, `/api/device/ack`, `/api/device/heartbeat`, `/api/requests`, `/api/requests/{id}/ack`, `/samples`.
2. Deploy to Railway or Render with a public HTTPS URL by 5:15 PM. Post the URL in the group chat. Everybody switches from fixtures to the real URL.
3. Escalation timer (`escalation.py`) and ack from button, dashboard and iMessage reply.
4. ElevenLabs text-to-speech (`/api/tts`), cached and pre-generated for the demo words.
5. Photon iMessage (`photon.py`), behind `ENABLE_PHOTON`. Find out how Photon access works first and post what you learn. If the ESP32 is not working, set `ESCALATE_MESSAGE_AFTER_S=0`.
6. Sentry (server and web setup): tracing, logs, uptime check on `/api/device/health`. Save real-bug screenshots in `docs/sentry-evidence/`.
7. 8:45 PM: deploy checklist and handoff note.

## Hard rules for you
- You lock the contract. If someone asks for a change in `shared/CONTRACT_REQUESTS.md`, answer it in the next hour and merge the contract change on its own PR.
- Merge small PRs to `main` often so the others are never blocked on you.
