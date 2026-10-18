# Changelog: anay

(append entries: time, what changed, why)

- 2026-10-17: server skeleton in `server/` with every section 9 route (in-memory state, fixture-shaped responses, device token check, device health 503). Lets web and firmware build against a real server before SQLite lands.
- 2026-10-17: server state moved to SQLite; escalation timer with idempotent steps and restart resume; button and dashboard acks drive the 5 s acked device state. Photon is a logging placeholder (its SDK is TypeScript only).
- 2026-10-17: CREAO adaptation plumbing (sessions, feedback, adapt-config, adapt run/status calling creao.py, clean failure, never an invented proposal) and `server/seed.py` with 4 synthetic sessions for Maria.
- 2026-10-17: deployed to Railway at https://care-call-production.up.railway.app; smoke-tested health, device token, request -> alert -> button ack -> acked, CORS.
- 2026-10-17 ~5 PM: Photon iMessage via `server/photon-bridge` (spectrum-ts sidecar): escalation text + native poll, ack by poll tap or reply, status replies, ack follow-ups. Tested live on a real phone.
- 2026-10-17 ~6:40 PM: ElevenLabs TTS (cached, pre-generated), Sentry (tracing, logs, profiling, custom + AI spans), Gemini free-text replies with model fallback, demo seed of a day of answered requests, request list sorted by time, bridge logs every inbound event.
