# Josh's gesture code

Tracks a hand, learns what each pose means, and triggers a request after a short hold.
Uses Rey's trained model. Personal training assigns the request meanings.
Now uses Rey's version 2 model, trained on about 1.05 million hand examples with
small rotations and noise added during training. See `ml/report.md` for his results.

## Try it

1. Run the web dev server and open `/src/cv/demo.html`.
2. Start the camera.
3. Record neutral, water, pain, help and bathroom. Hold each pose for three seconds.
4. Repeat a learned pose and watch the request appear.

Record a different pose for each label. Neutral is your resting hand.
The demo shows requests locally; it is not connected to the caregiver server.
Download examples before reloading. Reloading clears training.
Training accuracy can look too high when examples come from one hold, so test fresh poses too.

## Main files

- `camera.ts`: tracks the hand.
- `features.ts`: prepares hand data for storage and Rey's model.
- `baseline.ts` and `model.ts`: run Rey's model in the browser.
- `training.ts` and `personal.ts`: collect examples and learn request labels.
- `trigger.ts` and `useGestureTrigger.ts`: check the hold and eight-second cooldown.
- `adapt.ts` and `session.ts`: load approved settings and prepare session reports.
- `personalDemo.ts`: working example of these pieces together.

## Patient page

Step 4 is connected on `josh/patient-integration`, based on Rey's onboarding branch.
Open `/patient` for the real camera flow. Train all five movements, then repeat one.
The ring fills over 12 matching frames at confidence 0.8 or higher, followed by an
eight-second cooldown. Rest never sends a request.

`patient.ts` connects the personal classifier to the page. The page uses the same
trigger engine as `useGestureTrigger`. It sends one request when the trigger fires
and shows success only after the server accepts it.

The training check uses leave-one-out scoring. It is not a measure of real-world
accuracy; test new movements after recording.

For a local simulation, use `/patient?mock=1` in the dev server with a separate test
database and messaging disabled. Keys: 0 rest, 1 water, 2 pain, 3 help, 4 bathroom,
X hide the hand. Select each pose before pressing Start. This uses the real model
and trigger with synthetic landmarks. It does not test the camera or physical hardware.
Reset this test training before trying real movements. Simulation is disabled in production.

Keep stored samples in the existing 42-number format. `personal.predict` handles
Rey's model format internally. Alex should use the same conversion on the Pi.
Camera setup currently expects `@mediapipe/tasks-vision@0.10.22-rc.20250304`;
keep the package and WASM versions matched. See `camera.ts` for download URLs.

## Checks

48 JavaScript tests, five server checks, the TypeScript check and the web build passed. Browser calculations
match Rey's reference examples. Live webcam performance still needs testing.

After installing the web dependencies, run these from the repo root:

```sh
web/node_modules/.bin/tsc --target ES2022 --module commonjs --moduleResolution node --lib ES2022,DOM --strict --esModuleInterop --resolveJsonModule --skipLibCheck --rootDir . --outDir /tmp/care-call-cv-check web/src/cv/*.ts web/src/lib/adaptation.ts web/src/lib/reports.ts
CV_TEST_BUILD=/tmp/care-call-cv-check/web/src/cv node --test web/src/cv/*.test.cjs
```

Assistive prototype, not a medical device. Use teammates simulating limited dexterity, not patient data.
