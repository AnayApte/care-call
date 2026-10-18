# Status: rey

Updated: 2026-10-18

Works:
- `web/` scaffolded: Vite 5, React, TS, Tailwind v4 (`@tailwindcss/vite`), shadcn. `npm run dev` then http://localhost:5173/patient. Tokens in `web/src/styles/tokens.css`.
- `/patient` onboarding (training) flow built from mockup A1 (`web/mockups/`): flashcard deck, framed camera, tap Start, 3-2-1 countdown, 3 s hold gated on steadiness, auto-retry on hand loss, check sound per label, no summary, straight into listening. Samples POST to the server per label; reload resumes at the first incomplete label; "Retrain movements" DELETEs samples and restarts.
- Feedback loop on /patient: after a request fires, "Was that the right request?" Yes / No, then "What did they mean?". Confirmed or corrected hold frames become new samples (newest 45 per label kept) and `POST /api/requests/{id}/feedback` is sent, so the model follows the person over time and the CREAO agent gets feedback.
- Listening view: live word, trigger ring, POST /api/requests on fire, 3 s grace after training so the last held pose does not fire.
- Tested against Anay's server running locally: 75 samples stored, request created with source browser.
- Hand landmarks are real (MediaPipe HandLandmarker in `web/src/lib/handTracker.ts`, same model, WASM version and contract s8 feature vector as Josh's camera.ts). Classifier (kNN k=7 vote), capture and trigger (time-based 1 s hold, 0.7 confidence, gentle drain) are stand-ins in `web/src/lib/cvMock.ts` behind the adapter `web/src/lib/cv.ts`. Add `?mock=1` to the URL for a synthetic hand (keys 0 to 4, X, S).
- Camera picker on /patient: pill at the top centre lists webcams (names show once camera access is allowed), remembers the choice per browser, and restarts tracking on the chosen camera.
- Two hands in frame: `web/src/lib/handArbiter.ts` decides which one counts. Training holds vote for the hand that did them; the majority locks and survives reload (`carecall.handedness` in localStorage). Once locked the weak hand is ignored even when it is the only hand visible, by design, so it cannot fire a false request. Retrain clears the lock. The lock is MediaPipe's label (mirrored on a selfie camera), so the UI never names a side. Tests: `cd web && npm test`.

- Add a word after onboarding: "Add a word" pill next to "Retrain movements" on /patient. Saves the word on the server (`POST /api/patients/{id}/vocabulary`), trains just that word, then it can be requested like the defaults. Trigger gate is 0.65 (4 of 5 neighbours).
- Deployed on Vercel: https://care-call-gamma.vercel.app (project `care-call` under rereynrd, root `web/`, `VITE_API_BASE` = the Railway server, set in Vercel for production and preview). `/patient`, `/caregiver`, `/beacon` and report links load directly. Not connected to GitHub (the Vercel app has no access to AnayApte/care-call), so redeploy by hand: `git archive HEAD web ml/baseline.json shared/fixtures` into a temp dir, copy `web/.vercel/project.json` to `.vercel/`, then `npx vercel deploy --prod`.
- Hand model starts fast: loads alongside the camera, once per page, warmed on a blank frame, kept in the Cache API (`web/src/lib/modelLoader.ts`). "Reload camera" restarts only the camera.
- Demo continue: after a request is sent, tap anywhere or press Space to go straight back to Ready (acks the open request).

Blocked / need:
- Josh's `web/src/cv/` to merge, then swap the re-exports in `web/src/lib/cv.ts`. Note for Josh: Rey's page needs landmarks per frame as well as the vector (for the overlay and the steadiness gate).

Next:
- `/beacon` (by 6:30 PM), then `/caregiver`.

Note for Josh (after #12): `/patient` uses your classifier and sample capture, but keeps its own tracker (every camera frame, smoothed landmarks; your camera.ts is capped at 12 detections/s which looks steppy on the live skeleton) and its own time-based trigger (2 s fill, 400 ms grace, drain, 0.7). Your `patientSimulation` hands collapse through the baseline embedding (leave-one-out 20%), so `?mock=1` cannot demo recognition; real hands only.
