# Beacon: Josh's demo Q&A

Checked against main `28c4f5c` on October 18, 2026. Some older pitch and status notes describe earlier behavior. These answers follow the current code and recorded evidence.

## Your 30-second explanation

“Beacon has three main parts. The browser reads a camera and learns what a person's movements mean. A Python server stores requests and coordinates acknowledgements. The Pi devices check that server to alert the caregiver and play speech. The live gesture path does not wait for an AI agent. CREAO reviews usage afterward and suggests adjustments that a caregiver can approve.”

## The architecture

```text
Laptop webcam OR Pi camera stream
                |
                v
Browser: MediaPipe -> frozen embedding -> personal kNN -> hold trigger
                |
                | HTTP + JSON
                v
FastAPI server + SQLite on a persistent Railway volume
        |                   |                    |
  Caregiver screen     Pi alert/button       External speaker
        |                   |                    |
        +------ requests / acknowledgements ------+

Optional server integrations:
Photon = iMessage; ElevenLabs = speech; Gemini = text questions
CREAO = usage review and proposed settings; Sentry = diagnostics
```

The Pi camera can supply the image while the browser still runs recognition. A separate native Pi model preview exists, but it does not yet map personal movements to requests.

## Learn these words

| Word | What it means here |
| --- | --- |
| Frontend | The patient and caregiver pages, built with React and TypeScript. |
| Backend | The Python FastAPI server that handles requests and stored data. |
| API | The agreed URLs and JSON messages the parts use to communicate. |
| Polling | Asking the server for updates repeatedly, about once a second. |
| Embedding | A compact numerical description of a hand shape. |
| kNN | Comparing a new hand description with the closest recorded examples. |
| Idempotency | Retrying the same operation without creating another copy. |
| Deployment | Running a built version on a host, rather than just merging code. |

## Questions you should be ready for

### 1. Walk me through one request.

“The browser recognizes a learned movement held for about a second, then sends a request to the API. The server saves it and returns an ID. The caregiver sees that request; the browser's acknowledgement targets its ID. The patient screen checks for that acknowledgement, shows confirmation, and waits for a fresh rest pose before listening again.”

### 2. Where does the AI run?

“The current personal gesture recognition runs in the browser. The server coordinates delivery and storage. CREAO runs separately in the cloud, after an explicit review request.”

If asked about the Pi: “The Pi can stream its USB camera to the browser. Camera location and inference location are different.”

### 3. What model did you build?

“MediaPipe finds 21 hand points. Rey trained a small neural network that turns those points into a 32-number description. We keep that network fixed and use the patient's own examples to decide what the movement means.”

If pressed: stored input is 42 x/y values. The network is `42 -> 64 -> 32 -> 34`. Personal recognition uses the 32-number hidden representation, not the 34 generic gesture names.

### 4. What happens during personal training?

“We capture 15 observations during one three-second hold for each movement, including rest. Those examples are stored and used for nearest-neighbor matching. We do not retrain the neural network for every person.”

Four default requests plus rest means 75 examples. It is not 15 separate holds per word. Countdowns, transitions and retries add time.

### 5. How do you avoid sending a request from one odd frame?

“A prediction must remain consistent across a hold. The current defaults require 12 consecutive qualifying observations, a match score of at least 0.8, and an eight-second cooldown. A pending request also blocks another send, and the patient must return to rest before resuming.”

Settings can change after review, so these are defaults, not universal values or clinical thresholds.

### 6. What does 80% confidence mean?

“Four of the five nearest recorded examples agree. It is a voting score, not an 80% probability that we understood the patient correctly.”

The model does not have a validated medical confidence score or a calibrated unknown-gesture detector.

### 7. Why not hard-code gestures or use an LLM for each frame?

“Fixed gesture meanings require the person to make a standard pose. We let their own examples define the meaning. A small local classifier also keeps the live path independent of a cloud language-model response.”

### 8. Why have a server at all?

“It gives every screen and device one shared record of requests, responses and settings. Each device only needs to reach the server; the caregiver Pi and patient screen do not need a direct connection to each other.”

The Pi camera stream is a separate link to the browser, currently carried through a tunnel.

### 9. Why polling instead of WebSockets?

“Polling was the simpler choice for this prototype and its small number of devices. Each device asks the cloud for updates about once a second. It adds some delay and traffic; we would revisit it for a larger deployment.”

Do not claim guaranteed sub-second delivery. The hold, camera processing, network, polling and playback all contribute to latency.

### 10. What database do you use, and what survives a restart?

“SQLite stores examples, requests, acknowledgements, feedback, session summaries and approved settings. The Railway configuration uses a persistent volume. The server also reloads pending requests to resume escalation after restart.”

This is one prototype server, not a highly available distributed system.

### 11. What if the internet drops or a request is sent twice?

“The browser saves a unique request key before sending. If the reply is lost, Retry reuses that key, so the server can return the original request. Recording uploads and session reports also retain data for retry.”

“We cannot deliver a new cloud alert while disconnected. Some recognition can continue after its assets are loaded, but this is not a fully offline system.”

### 12. Can an acknowledgement answer the wrong request?

“The browser path uses the exact request ID and has tests for repeated acknowledgement. The prototype still has older hardware and messaging paths that need stronger matching when several requests overlap.”

Do not claim all channels have completed multi-request validation. The current demo uses one shared synthetic-patient queue.

### 13. What does CREAO actually do?

“It reads recent practice summaries and caregiver feedback. It can suggest a longer hold, a different match threshold, or recording a confusing movement again. It does not recognize the live gesture or retrain the neural network.”

### 14. Can the agent change things without permission?

“In our interface, the caregiver must choose Apply. We reject malformed proposals, bound the numerical settings and check for stale versions. Dismiss leaves settings alone. The patient picks up approved changes between holds.”

These are software safeguards, not clinical validation. Caregiver authentication is still needed before a real deployment.

### 15. Does caregiver feedback immediately teach the classifier?

“No. Acknowledgement means help is coming; correctness feedback means whether the request was understood. Feedback enters reports for review. Changing personal examples uses guided recording again.”

### 16. What data leaves the browser?

“The API receives hand-feature numbers, request events and summaries. CREAO receives the demo profile, settings, recent summaries and feedback, not camera images or raw hand vectors. Gemini receives request history for text questions; ElevenLabs receives phrases to speak.”

The Pi camera path streams images to the browser. Do not say all data stays on the device, or that no images ever cross a network.

### 17. Is the system secure enough for patients?

“This is a prototype using synthetic patient data. Device APIs use a shared token and vendor keys stay on the server, but the web APIs do not yet have user login and patient access controls. Those need to be added before real patient use.”

Do not claim HIPAA compliance, end-to-end encryption or production security.

### 18. What do the sponsor services contribute?

| Service | Your short answer |
| --- | --- |
| ElevenLabs | “Generates speech clips, which we cache for the external speaker. Website audio is disabled.” |
| Photon | “Sends caregiver iMessages and receives replies. A small Node bridge connects its SDK to our Python API.” |
| Gemini | “Answers free-text caregiver questions using request history. It does not decide which movement sends help.” |
| CREAO | “Reviews performance and proposes settings for caregiver approval.” |
| Sentry | “Helps inspect backend errors, logs, request traces and acknowledgement timing.” |

Cloud integrations can be disabled independently. Do not promise that an external message was delivered just because the server attempted it. Phone-call escalation exists in code but is not established as live.

### 19. Where is it deployed?

“The backend is hosted on Railway. We can run the frontend locally or serve its built files from the Pi. Vercel was planned for web hosting, but I have not verified a Vercel deployment of this version.”

“Our latest production build defaults to the Railway API. A production build still needs to be copied or deployed to its host; merging main alone is not proof that a displayed website updated.”

### 20. How accurate is it?

“We have offline model experiments, setup consistency checks and software-flow tests. Those measure different things. We do not yet have a controlled patient study or a validated live-camera accuracy rate.”

If asked for numbers: the shipped baseline recorded 95.16% accuracy on its public-data validation task. The separate held-out-class experiment recorded 98.5% mean few-shot accuracy; it pooled examples by class and is not a new-patient accuracy result. The on-screen leave-one-out score reuses closely related setup recordings, so it is not real-world accuracy either.

### 21. What did you test?

“My latest change passed 67 CV checks, typecheck, changed-file lint and the production build. I also checked rejection and retry in an isolated synthetic browser test. We have separate evidence for live camera preview, a real local CREAO run and hardware smoke checks.”

Main now includes Alex's later training-save fix and additional tests. Do not present 67 as a fresh test count for every later commit. Automated tests and hardware demonstrations are not clinical validation.

### 22. What did you personally own?

“My main work was connecting the camera features to personal recognition, the hold trigger and request lifecycle. I also worked on usage reports, approved CREAO adjustments, selective retraining and the caregiver report flow. Rey trained the base network; the hardware team handled the Pi integration.”

### 23. What would you improve next?

“First, measure fresh movement trials: successful requests, misses, false triggers and time to acknowledgement. Then strengthen authentication, patient/device routing and all-channel acknowledgement matching. Larger deployments would need a more durable job system and a database design for multiple users.”

## Five statements to avoid

- “We detect strokes.” Beacon is an assistive communication prototype for people who may have movement or speech limitations.
- “We have 98.5% patient accuracy.” The reported experiment does not establish that.
- “The agent trains the patient's neural network.” Personal setup stores examples; CREAO suggests settings.
- “Everything is private, offline and production-ready.” That is not the current architecture.
- “The whole system is running on the Pi.” Distinguish the Pi camera stream, browser recognition and cloud backend.

## Practice without reading

1. Explain camera -> request -> acknowledgement in 30 seconds.
2. Explain the difference between the pretrained model, personal examples and CREAO.
3. Explain why a retry does not create a second browser request.
4. Name one measured result and its limitation.
5. Say exactly which component you worked on, and which result you still need to verify.

If unsure: “That part is implemented, but I haven't verified it in this demo setup. What I can confirm is…” Then name the specific check you did.

Sources: [request flow](../web/src/cv/requestFlow.ts), [personal model](../web/src/cv/personal.ts), [active patient hook](../web/src/hooks/useOnboarding.ts), [server storage](../server/store.py), [CREAO integration](../server/integrations/creao.py), [model experiments](../ml/experiments.md), [Josh's checks](../shared/status/josh.md), [Alex's checks](../shared/status/alex.md).
