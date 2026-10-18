# Changelog: rey

(append entries: time, what changed, why)
- 2026-10-17 15:30  ml: prepare/train/embed/camera_test pipeline, baseline v1 (94.9%, 55k hands).
- 2026-10-17 16:10  ml: v2. All data (1.05M hands), LR decay + early stop that actually fires,
  augmentation (`augment.py`), `--holdout` transfer test (`fewshot.py`). Found and fixed a
  wrist-jitter bug that collapsed training. Notes in `ml/experiments.md`, design in
  `docs/ml-gestures.md`.
- 2026-10-17 17:25 | web/mockups: three onboarding mockup variations (A1 paper tag, A2 bottom sheet, A3 typographic), decisions recorded in status. Static HTML only, no app code yet.
- 2026-10-17 17:45 | web: scaffold (Vite 5, React, TS, Tailwind v4, shadcn, tokens), /patient onboarding flow from mockup A1, mock gesture layer behind an adapter, tested against the local server.
- 2026-10-17 18:45 | web: real MediaPipe hand tracking behind the adapter (mock via ?mock=1), camera double-mount fix, layout scales to short windows.
- 2026-10-17 19:05 | web: stand-in classifier is now a kNN vote, trigger fills and drains over time at 0.7 confidence; contract request logged for the threshold.
- 2026-10-17 19:50 | web: rebased the patient UI onto Josh's cv merge. Camera stays on the full-rate smoothed tracker in `web/src/lib/handTracker.ts` (his features), classifier and capture are his, trigger is `web/src/lib/holdTrigger.ts` (2 s fill with grace and drain, 0.7). 1.7 s auto countdown, result stays until tap or space, eased ring, animated check.
- 2026-10-17 20:00 | web: feedback card after each recognised request (right / wrong + what they meant); hold frames are added as new samples under the confirmed or corrected label and POSTed, feedback goes to /api/requests/{id}/feedback; newest 45 samples per label kept so the model follows changes; trigger confidence gate 0.6.
- 2026-10-17 20:20 | web: feedback adds 5 frames spread across the hold (Yes under the fired word, No then a word under that word, Nothing records only); cap 60 per label pruned by duplication so rarely used styles survive (`web/src/lib/samples.ts`).
- 2026-10-17 21:34 | web: camera picker on /patient (top centre pill, lists webcams, remembers the choice in localStorage, restarts the tracker on change). `web/src/components/patient/CameraSelect.tsx`, `web/src/lib/cameraPref.ts`.
- 2026-10-17 22:10 | web: tracker asks MediaPipe for two hands and `web/src/lib/handArbiter.ts` picks which one counts. Before training, the hand that is moving wins (1 s sticky, movement forgotten after a 500 ms gap). Each completed training hold votes for its hand; the majority locks and is remembered in localStorage (`handednessPref.ts`). Locked: only that hand feeds the classifier and trigger, the other hand alone shows as no hand. Retrain clears the lock; a Yes on feedback locks patients trained before this change. `npm test` runs the arbiter tests with node's built-in runner, no new dependency.
- 2026-10-18 | web: trigger confidence gate 0.6 -> 0.65 (with k=5 votes this means 4 of 5 neighbours) (#27).
- 2026-10-18 | web + cv + server (owners OK'd via Rey): "Add a word" after onboarding. Caregiver types a word and the sentence to speak; it is saved with `POST /api/patients/{id}/vocabulary` (new `vocabulary` table, label `^[a-z][a-z0-9_]{0,23}$`, 409 on duplicate or neutral), then the patient trains just that word (15 samples) and it joins the trigger, the result screen and the feedback buttons. `cv/types.ts` labels are now any matching string (defaults unchanged); `cv/personal.ts` votes over the labels present in the samples. "Not now" skips training; the word is offered again on the next load. Mock key 5 is a spare pose. Tests: cv 34, web 15, server 3, all pass; checked end to end in mock mode on a temp server.
