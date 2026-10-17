# Josh's arm check and alert demo

Open `/src/cv/armDemo.html` in the web dev server.

1. Start the camera and keep both arms in view.
2. Click **Start arm demo** and follow the prompt.
3. A sustained arm drop is shown as an observation for someone to review.

To test without a camera, click **Run simulated arm drop**.

## Connect the hardware

Enter the Care Call server URL and enable **Send HELP** before starting.
The page sends one HELP request. Alex's ESP32 polls that server and alerts.
The page then watches for acknowledgement. It also shows whether a device
heartbeat is recent. A server receipt does not prove the buzzer sounded.
Localhost works only on the laptop. The real ESP32 needs a public HTTPS server
that both the browser and device can reach.

`beaconPreview.html` is a browser preview for testing the same alert flow.
Its acknowledgement uses the dashboard endpoint; it is not a physical device.

Josh's code does not change Alex's firmware or Anay's server. Only the generic
HELP label is available, so arm observations stay in the page for now.
Network delivery failures are shown and are not automatically retried.

## Limits

This is an unvalidated movement demo. It cannot diagnose or rule out stroke.
It does not check face or speech. Lost tracking gives an incomplete result.
Suspected stroke symptoms require calling 911 immediately; do not wait for this demo.
Test only with teammates and synthetic data.

[Stroke warning signs](https://www.stroke.org/en/about-stroke/stroke-symptoms)

## Checks

Run the JavaScript checks using the commands in `GESTURES.md`, adding `arm.test.cjs`.
Run `python web/src/cv/server.test.py` with the server dependencies installed
for the alert/device/acknowledgement checks. Tests use a temporary database.

The earlier personal-gesture demo is at `demo.html`; its notes are in `GESTURES.md`.
