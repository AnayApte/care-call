# Josh's camera-to-request boundary

Workflow: Rey's completed general-pose MLP is in `ml/baseline.json` on main.
Josh's browser implementation reuses those weights without modifying or copying them.
The personal kNN in `personal.ts` learns the user's care-request meanings from
32D embeddings. A generic pose name like `fist` is never hard-coded to `water`.

## Start with the camera check

Once Rey's Vite 5 app has the contract-approved `@mediapipe/tasks-vision` dependency,
run its dev server and visit `/src/cv/demo.html`. Start camera, allow permission,
and put one hand in view. You should see 21 dots and 42 numbers plus the general
pose prediction from Rey's model. Select each label and hold a distinct pose for
three seconds; start with the resting hand as neutral. All five labels need 15
examples before personal recognition is enabled. The page then shows leave-one-out
accuracy, personal predictions, hold progress, cooldown and local request events.
Retraining a label replaces its previous examples. Export before reloading: samples
are held in memory, not persisted. Accuracy from one hold can be overly optimistic;
test fresh poses too. This page deliberately sends no care requests to a server.
A camera needs localhost or HTTPS. Initial hand-landmarker model
and WASM downloads need network access. Camera access begins only on the Start button.

The isolated verification setup for this chat lives outside the repo in `work/cv-tools`;
it does not change Rey's package manifest or lockfile. `camera.ts` currently uses
`@mediapipe/tasks-vision@0.10.22-rc.20250304`; the installed npm version and WASM URL
must match. Override `wasmRoot` and `modelPath` if Rey pins a different version.

## Interface Rey can use

```ts
import { startHandCamera } from "./cv/camera";
import { useGestureTrigger } from "./cv/useGestureTrigger";
import { loadBundledBaseline } from "./cv/baseline";
import { createPersonalClassifier } from "./cv/personal";

// Create once per patient, e.g. useMemo. storedSamples are contract-format samples.
const personal = createPersonalClassifier(loadBundledBaseline());
personal.setSamples(storedSamples);
// Inside the patient component:
const gesture = useGestureTrigger({ approvedConfig, onTrigger: createRequest });
// In an effect or camera-start handler (retain stop and call it on cleanup):
const stop = await startHandCamera({ video, onError: showCameraError, onFrame(frame) {
  const prediction = frame.vector ? personal.predict(frame.vector) : null;
  gesture.processPrediction(prediction, frame.timestamp);
} });
```

- `Predictor`: `(vector: number[]) => {label, confidence} | null`, labels restricted
  to water/pain/help/bathroom/neutral, confidence finite in [0,1]. Model must be ready
  before recognition is enabled. Return null when untrained or uncertain.
- `extractFeatures`: exactly 42 x/y values, wrist-centered, divided by maximum 2D
  wrist distance. Uses MediaPipe image coordinates, not world coordinates. Mirror
  only the video display. Invalid/degenerate points throw; camera treats them as absent.
- `toModelFeatures` adapts that vector to Rey's `wrist_relative_v1`: divide by
  wrist-to-middle-MCP distance and mirror x when point 17 is left of point 5.
  Do not feed raw max-distance vectors directly into Rey's MLP or normalize twice.
  `personal.predict` performs the conversion internally. Stored samples stay 42D
  max-distance vectors, so the shared wire format does not change.
- `createBaselineModel` implements standardization, dense layers, ReLU and softmax
  in JavaScript with no new dependencies. Its embedding/probability outputs match
  all five `ml/test_vectors.json` reference cases within 1e-5 (max measured error
  9.54e-7). The baseline model's dataset accuracy is not personal-request accuracy.
- `createPersonalClassifier` uses five nearest embeddings and neighbor-vote confidence.
  `setSamples` validates/replaces examples atomically; `predict` returns null until
  all five labels have 15 samples. `leaveOneOutAccuracy` excludes the queried example
  from its neighbors. This is not a clinical evaluation or a held-out-session test.
- `createSampleCapture`: starts a fresh three-second hold, at most one sample per
  200ms time slot, exactly 15 samples; missing hand or >500ms camera gap cancels the capture.
  Feed frames to this instead of recognition while training. Saving samples, building
  the model and leave-one-out accuracy are demonstrated in `personalDemo.ts`.
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

1. Rey: install/pin MediaPipe, wire the patient page using the example above.
2. Alex ports both `extractFeatures` and the model adapter if the edge node uses the MLP.
3. Test neutral -> water hold -> one request -> cooldown -> caregiver acknowledgement.
4. Then finish the generic-vs-personal benchmark with held-out samples. Do not invent
   results. The camera export is a smoke-test export, not the full per-person/condition benchmark.

This is an assistive prototype, not a medical device. Data is teammates simulating
limited dexterity, never patients.

## Run automated checks after the web dependencies are installed

From repo root (TypeScript must be installed in web):

```sh
web/node_modules/.bin/tsc --target ES2022 --module commonjs --moduleResolution node --lib ES2022,DOM --strict --esModuleInterop --resolveJsonModule --skipLibCheck --rootDir . --outDir /tmp/care-call-cv-check web/src/cv/*.ts
CV_TEST_BUILD=/tmp/care-call-cv-check/web/src/cv node --test web/src/cv/*.test.cjs
```

18 tests cover feature math, model-reference parity, per-person label mapping,
leave-one-out exclusion, training readiness, trigger/reset/cooldown behavior and
session/config helpers. Synthetic pipeline tests prove wiring, not recognition quality.

Reference: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
