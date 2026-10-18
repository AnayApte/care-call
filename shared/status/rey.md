# Status: rey

Updated: 2026-10-17 ~7:50 PM

Works:
- `web/` scaffolded: Vite 5, React, TS, Tailwind v4 (`@tailwindcss/vite`), shadcn. `npm run dev` then http://localhost:5173/patient. Tokens in `web/src/styles/tokens.css`.
- `/patient` onboarding (training) flow built from mockup A1 (`web/mockups/`): flashcard deck, framed camera, tap Start, 3-2-1 countdown, 3 s hold gated on steadiness, auto-retry on hand loss, check sound per label, no summary, straight into listening. Samples POST to the server per label; reload resumes at the first incomplete label; "Retrain movements" DELETEs samples and restarts.
- Listening view: live word, trigger ring, POST /api/requests on fire, 3 s grace after training so the last held pose does not fire.
- Tested against Anay's server running locally: 75 samples stored, request created with source browser.
- Hand landmarks are real (MediaPipe HandLandmarker in `web/src/lib/handTracker.ts`, same model, WASM version and contract s8 feature vector as Josh's camera.ts). Classifier (kNN k=7 vote), capture and trigger (time-based 1 s hold, 0.7 confidence, gentle drain) are stand-ins in `web/src/lib/cvMock.ts` behind the adapter `web/src/lib/cv.ts`. Add `?mock=1` to the URL for a synthetic hand (keys 0 to 4, X, S).

Blocked / need:
- Josh's `web/src/cv/` to merge, then swap the re-exports in `web/src/lib/cv.ts`. Note for Josh: Rey's page needs landmarks per frame as well as the vector (for the overlay and the steadiness gate).

Next:
- `/beacon` (by 6:30 PM), then `/caregiver`.

Note for Josh (after #12): `/patient` uses your classifier and sample capture, but keeps its own tracker (every camera frame, smoothed landmarks; your camera.ts is capped at 12 detections/s which looks steppy on the live skeleton) and its own time-based trigger (2 s fill, 400 ms grace, drain, 0.7). Your `patientSimulation` hands collapse through the baseline embedding (leave-one-out 20%), so `?mock=1` cannot demo recognition; real hands only.
