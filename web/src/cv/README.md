# Josh's camera-to-request boundary

Workflow: Josh owns landmarks, features, sample capture and trigger logic. Rey can work
on the classifier separately using `Predictor` in `types.ts`. No duplicate kNN is
implemented here while Rey's training work is in progress. The checked-in contract
still assigns kNN to Josh; ask Anay to record the agreed split before integration.

## Start with the camera check

Once Rey's Vite 5 app has the contract-approved `@mediapipe/tasks-vision` dependency,
run its dev server and visit `/src/cv/demo.html`. Start camera, allow permission,
and put one hand in view. You should see 21 dots and 42 numbers. Select each label,
hold for three seconds, and export samples. This page deliberately sends no requests
and does not use a fake classifier. A camera needs localhost or HTTPS. Initial model
and WASM downloads need network access. Camera access begins only on the Start button.

The isolated verification setup for this chat lives outside the repo in `work/cv-tools`;
it does not change Rey's package manifest or lockfile. `camera.ts` currently uses
`@mediapipe/tasks-vision@0.10.22-rc.20250304`; the installed npm version and WASM URL
must match. Override `wasmRoot` and `modelPath` if Rey pins a different version.

## Interface Rey can use

```ts
import { startHandCamera } from "./cv/camera";
import { useGestureTrigger } from "./cv/useGestureTrigger";
import type { Predictor } from "./cv/types";

// Inside the patient component; predictor is Rey's synchronous model function:
const gesture = useGestureTrigger({ approvedConfig, onTrigger: createRequest });
// In an effect or camera-start handler (retain stop and call it on cleanup):
const stop = await startHandCamera({ video, onError: showCameraError, onFrame(frame) {
  const prediction = frame.vector ? predictor(frame.vector) : null;
  gesture.processPrediction(prediction, frame.timestamp);
} });
```

- `Predictor`: `(vector: number[]) => {label, confidence} | null`, labels restricted
  to water/pain/help/bathroom/neutral, confidence finite in [0,1]. Model must be ready
  before recognition is enabled. Return null when untrained or uncertain.
- `extractFeatures`: exactly 42 x/y values, wrist-centered, divided by maximum 2D
  wrist distance. Uses MediaPipe image coordinates, not world coordinates. Mirror
  only the video display. Invalid/degenerate points throw; camera treats them as absent.
- `createSampleCapture`: starts a fresh three-second hold, at most one sample per
  200ms time slot, exactly 15 samples; missing hand or >500ms camera gap cancels the capture.
  Feed frames to this instead of recognition while training. Saving samples, building
  the model and leave-one-out accuracy belong to the training integration.
- `useGestureTrigger`: exposes `progress` (0 to 1), `cooldownMs`, `label`,
  `processPrediction`, and `reset`. Defaults: 12 consecutive confident frames, 0.8
  minimum confidence, 8-second cooldown. Camera is throttled to at most 12 detections/s
  so 12 frames roughly approximate one second. Reset on camera stop, retraining or
  classifier replacement. Ignore `fired` as a side-effect source; `onTrigger` is the
  one event callback. Rey owns POST /api/requests, including patient_id and source.
- `loadApprovedConfig`: GET the approved config at session start, then sanitize.
  Agent proposals are not applied here. Fetch failure should be displayed; caller
  may explicitly choose defaults. Thresholds clamp to contract bounds. Per-label
  settings override global settings. Rey can use `retrain_labels` to open training.
- `createSession`: record one explicit event per completed/abandoned attempt, not
  one per frame. Intended-label feedback must come from a person or known benchmark
  label. `snapshot` makes an independent summary. `postSession` uploads it; Rey's
  page schedules every ten minutes and pagehide, rotating on success. Keep one
  config version per session. Exit uploads are best effort; failed-upload retry
  and duplicate handling must be agreed with Anay's server owner.

## Handoff checklist

1. Rey: install/pin MediaPipe, wire the page and give Josh the predictor export path.
2. Agree the feature convention before collecting any samples. Alex ports the same math.
3. Test neutral -> water hold -> one request -> cooldown -> caregiver acknowledgement.
4. Then finish the generic-vs-personal benchmark with held-out samples. Do not invent
   results. The camera export is a smoke-test export, not the full per-person/condition benchmark.

This is an assistive prototype, not a medical device. Data is teammates simulating
limited dexterity, never patients.

Reference: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
