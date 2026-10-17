# Agent brief: Rey (UI, design, demo, integrations after 9 PM)

Owns: `web/` (everything except `web/src/cv/`), `server/integrations/creao.py`, `server/integrations/telephony.py`, `agents/rey.md`.
Awake and building: now until about 1 AM, then from 8 AM. Leads the demo video at 8 AM.

## First tasks (in order)
1. `npm create vite@5`, React plus TypeScript, Tailwind v4 via `@tailwindcss/vite`, shadcn. Do not use Vite 8.
2. Quick Paper mockups (30 minutes max): `/patient` (camera and training), `/caregiver` (dashboard), `/beacon`.
3. Build `/patient`, `/caregiver` and `/beacon` against `web/src/cv/mock.ts` and the fixtures in `shared/fixtures/`. Switch to the real server URL when Anay posts it.
4. `/beacon` must exist by 6:30 PM. It behaves like the ESP32: polls device state, shows the word, beeps, big ACK button. It is the safety net if hardware fails.
5. Polish: no empty states, seed realistic history, big readable type, calm colours. Design guidance is in contract section 14.
6. 9 PM: lead the simulated-impairment data collection with Josh (contract section 18). Then CREAO handoff agent (`creao.py`) and phone call (`telephony.py`), behind flags.
7. 8 AM: demo video lead.

## Hard rules for you
- Do not edit `web/src/cv/`. That is Josh's folder. Use the hook interface in the contract.
- Do not claim medical use anywhere in the UI.
