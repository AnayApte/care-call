# Status: rey

Updated: 2026-10-17 ~5:45 PM

Works:
- `web/` scaffolded: Vite 5, React, TS, Tailwind v4 (`@tailwindcss/vite`), shadcn. `npm run dev` then http://localhost:5173/patient. Tokens in `web/src/styles/tokens.css`.
- `/patient` onboarding (training) flow built from mockup A1 (`web/mockups/`): flashcard deck, framed camera, tap Start, 3-2-1 countdown, 3 s hold gated on steadiness, auto-retry on hand loss, check sound per label, no summary, straight into listening. Samples POST to the server per label; reload resumes at the first incomplete label; "Retrain movements" DELETEs samples and restarts.
- Listening view: live word, trigger ring, POST /api/requests on fire, 3 s grace after training so the last held pose does not fire.
- Tested against Anay's server running locally: 75 samples stored, request created with source browser.
- Gesture layer is mocked in `web/src/lib/cvMock.ts` behind the adapter `web/src/lib/cv.ts` (same shapes as Josh's `src/cv/`). Demo keys in the mock: 0 neutral, 1 water, 2 pain, 3 help, 4 bathroom, X hide hand, S shake.

Blocked / need:
- Josh's `web/src/cv/` to merge, then swap the re-exports in `web/src/lib/cv.ts`. Note for Josh: Rey's page needs landmarks per frame as well as the vector (for the overlay and the steadiness gate).

Next:
- `/beacon` (by 6:30 PM), then `/caregiver`.
