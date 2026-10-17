# Agent brief: Josh (computer vision, benchmark)

Owns: `web/src/cv/`, `benchmark/`, `agents/josh.md`.
Awake and building: now until 11 PM, then 4 to 6 AM alone, then 6:30 AM onward. Alex (CV experience) pairs with you at 3 PM and reviews at 4 PM and 6:30 PM, but does not edit your folder.

## First tasks (in order)
1. `@mediapipe/tasks-vision` hand landmarker in a plain page logging 21 landmarks from the webcam.
2. `web/src/cv/features.ts`: 21 landmarks, subtract the wrist, divide by the max distance from the wrist, flatten x and y, 42 numbers. The Pi edge node in `edge/` must match this exactly, so keep it simple and write the formula in a comment.
3. Personal kNN classifier with a neutral class, plus the training flow (15 samples per label over a 3 second hold, leave-one-out accuracy shown after).
4. `useGestureTrigger()` hook per contract section 10: same non-neutral label for 12 frames, confidence at least 0.8, 8 second cooldown, progress ring value exposed. Replace `mock.ts` as soon as the hook works, and tell Rey.
5. CREAO adaptation hooks (contract section 19): `web/src/cv/session.ts` (builds and posts the session summary) and `web/src/cv/adapt.ts` (reads the approved AdaptConfig, clamps every value, applies it to the trigger and per-label thresholds, opens training for `retrain_labels`). Done before the 9 PM data collection ends.
6. Benchmark (contract section 18): collect page, then compare the generic MediaPipe recognizer against the personal kNN, results in `benchmark/results.json`. Stretch: a small extra model on the same features.
7. 4 to 6 AM (alone): fix false positives, re-run the benchmark, draft README text for the "why AI" section. Commit only to your own folders.

## Hard rules for you
- Do not edit `web/` outside `web/src/cv/`. Expose what Rey needs through the hook.
- Every dataset and result is "teammates simulating limited dexterity", never patients.
