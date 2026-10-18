# Software 2.0

Branch: `josh/software-v2`. The plan is in `shared/contract-v2.md`.

## Run locally

Start one server from the repo root, inside your Python venv:

```sh
ENABLE_PHOTON=false ENABLE_PHONE_CALL=false ENABLE_CREAO=false python3 -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```sh
cd web
VITE_API_BASE=http://127.0.0.1:8000 npm run dev
```

Open `/patient` and `/caregiver` on the web server. `/beacon` is a bigger caregiver
screen if the Pi is unavailable. Both roles use the same backend. No device key is
needed in the browser.

Enable sound on both screens. Record the five movements. After setup, the patient
holds a request, waits for the caregiver's **I'm coming**, then rests to listen again.
Holding the old pose cannot send another request. Feedback is optional and does not
pause help. **Not sure** records no correctness vote.

If delivery is uncertain, **Retry same request** keeps the original key. Refresh
recovers the pending request. A failed training save stays queued for retry. Each
recording replaces only its label, in one server transaction.

Voice uses cached ElevenLabs audio. If unavailable, the screen clearly labels the
browser voice fallback. Enable sound again to replay the current message explicitly.
A fallback is not evidence that ElevenLabs worked.

Caregiver feedback saves the intended word for CREAO review. It does not silently
change personal samples. Use guided retraining for new examples.

## Checks

```sh
cd web
npm run test:cv
npm run build
npm run lint
```

From the repo root, with the server venv active:

```sh
python3 -m unittest discover -s server/tests -v
```

Tests use temporary databases and simulated gestures. They do not prove real-camera
accuracy or physical hardware. No new libraries were added.

Before the hardware handoff, complete the real-camera checklist in the v2 contract:
three Water cycles, the other request words, rest without false triggers, refresh,
connection loss, optional feedback and a reviewed report. Record misses as well as successes.
Keep deployed CREAO, actual ElevenLabs playback and real Pi results separate.

Verified on code commit `8bc8221`: 96 automated checks and the production build pass.
The connected browser test used synthetic recordings on an isolated local server.
Water, caregiver/beacon acknowledgement, rest recovery, pending-request refresh and
Not sure worked. Voice used the labeled browser fallback. Real-camera performance,
live ElevenLabs/CREAO and the physical boards still need their own checks.
