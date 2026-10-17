# Status: josh

Updated: 2026-10-17 15:39 America/Los_Angeles

Works:
- Browser camera adapter, documented 42-number feature extractor, three-second/15-sample capture and standalone demo under web/src/cv/.
- Predictor interface for Rey's classifier, pure trigger engine and React hook (12 frames, confidence >=0.8, 8-second cooldown by default).
- Approved-config validation/loading and explicit session aggregation/upload helpers per section 19.
- Strict TypeScript check, Vite 5 production build and 11 automated core tests passed. Demo page loads in browser. Real webcam/hand recognition has NOT been tested by the agent.

Blocked / need:
- Rey's classifier export and page integration; classifier training/LOO evaluation are not duplicated while Rey works on them per Josh's request.
- Rey owns web package files; no package.json, lockfile or other teammate code changed. Isolated verification tools live outside the repo in the chat work folder.
- Coordinate MediaPipe npm/WASM version, record the agreed predictor/ownership split with Anay. Interface documented in web/src/cv/README.md.

Next:
- Josh manually checks webcam dots and sample capture in /src/cv/demo.html.
- Rey connects predictor, trigger event -> request API, approved config and session lifecycle. Alex reviews feature parity.
- Collect simulated data and run generic-vs-personal benchmark with held-out samples. No benchmark numbers fabricated.
