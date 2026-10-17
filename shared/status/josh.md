# Status: josh

Updated: 2026-10-17 15:53 America/Los_Angeles

Works:
- Browser camera adapter, documented 42-number feature extractor, three-second/15-sample capture and standalone demo under web/src/cv/.
- Rey's baseline MLP now runs in-browser via unchanged ml/baseline.json from main. A model-input adapter preserves contract storage features while matching wrist_relative_v1.
- Personal 5-neighbor classifier on 32D embeddings, 15 examples for each of five labels including neutral, leave-one-out accuracy, retraining replacement and live local request preview.
- Pure trigger engine and React hook (12 frames, confidence >=0.8, 8-second cooldown by default).
- Approved-config validation/loading and explicit session aggregation/upload helpers per section 19.
- Strict TypeScript check, Vite 5 production build and 18 automated tests passed. Every Rey reference vector matches within 1e-5 (max error 9.54e-7). Integrated demo loads with the model in browser. Real webcam/hand recognition has NOT been tested by the agent.

Blocked / need:
- Rey's patient-page integration: camera -> personal.predict -> hook -> POST requests. The standalone demo displays local requests only; no live backend integration claimed.
- Rey owns web package files; no package.json, lockfile or other teammate code changed. Isolated verification tools live outside the repo in the chat work folder.
- Coordinate MediaPipe npm/WASM version. Adapter + use of embeddings documented in web/src/cv/README.md and proposed in CONTRACT_REQUESTS; wire-format samples remain unchanged.

Next:
- Josh manually checks webcam, trains neutral/water/pain/help/bathroom, tests fresh poses and local request/cooldown in /src/cv/demo.html.
- Rey connects patient page, request API, approved config and session lifecycle. Alex reviews feature/model adapter parity.
- Collect simulated data and run generic-vs-personal benchmark with held-out samples. No benchmark numbers fabricated.
