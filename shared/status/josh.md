# Status: Josh

Updated: 2026-10-17

Works:
- New guided arm demo at web/src/cv/armDemo.html, following Josh's updated goal.
- Observes sustained arm lowering; lost tracking gives an incomplete result.
- Sends one HELP alert through the existing server and watches for acknowledgement.
- Browser beacon preview works. Simulated drop -> HELP -> acknowledgement tested.
- 29 JavaScript tests, two server checks, TypeScript check and demo build passed.
- Gesture demo updated to Rey's version 2 model; all 29 JavaScript tests still pass.

Next:
- Josh: test the new demo with a live camera.
- Alex: run the ESP32 firmware against the same server and test its buzzer/display.
- Anay: update the shared plan for Josh's new goal and agree a richer observation format.

Arm thresholds are unvalidated demo settings. This cannot diagnose or rule out stroke.
Physical hardware has not been verified. The earlier gesture demo remains available.
