## Inspiration

After a stroke, many people can't speak. Many can't control one hand. The call button on a hospital bed assumes you can find it, reach it, and press it. If you can't, you wait until someone happens to walk in.

Almost everyone can still make *some* movement: a finger curl, a wrist turn. But every gesture recogniser we tried assumes a typical hand, so a weak, shaking, half-closed one gets ignored. The people who need it most are the ones it fails.

So we flipped it. Instead of teaching the person a gesture, the system learns the person.

## What it does

1. **Teach it in a minute.** The patient holds whatever movement they can manage for 3 seconds per word: *water*, *pain*, *help*, *bathroom*, plus a rest pose. That builds a personal classifier in the browser.
2. **Make the movement, hold for a second.** A ring fills, then a request fires.
3. **It speaks for them.** The bedside unit says "I would like some water, please" in a natural ElevenLabs voice.
4. **The caregiver is alerted.** A Raspberry Pi buzzes, its screen turns red and shows the word.
5. **One button to answer.** The caregiver presses it. The bedside says "Help is coming."

No answer in 20 seconds? The caregiver gets an iMessage with a native poll and can reply in plain text. Still nothing at 75? A phone call with a spoken agent.

Between sessions, an adaptation agent reviews which words were abandoned or confused and proposes tuned settings in plain words. The caregiver taps Apply or Dismiss. Nothing changes without a human.

Assistive prototype, not a medical device. Synthetic patient only.

## How we built it

**A frozen embedding, not a per-patient model.** MediaPipe gives 21 hand landmarks. A small network we trained on 1.05 million hand images turns them into a 32-number "hand shape" embedding. A k-nearest-neighbour classifier over the patient's own 15 samples per word does the rest. A new word or new patient is 15 samples. No retraining.

**Dumb plumbing.** One FastAPI server on Railway is the only thing anyone talks to. Both Pis poll it once a second over HTTPS. No websockets, nothing device-to-device.

**Escalation that cancels cleanly.** Voice at 0 s, iMessage at 20, call at 75, each step exactly once, all stopped by an ack from any channel. ElevenLabs audio is pre-generated so the bedside never waits. Photon handles iMessage through a Node sidecar. Gemini answers the caregiver's free-text questions with the day's requests as context.

**Safe adaptation.** A CREAO agent proposes settings from session summaries. Every value is clamped in the browser, so a bad output can't break the trigger.

**Sentry** traces every request from creation to acknowledgement, with ack latency as a tag.

## Challenges we ran into

**One landmark broke training.** Our first full run collapsed to 14% accuracy. After normalisation the wrist is always (0, 0), so its standard deviation hit a 1e-6 floor. Jittering it produced inputs near 20,000. Never jitter the wrist. One line, two hours.

**Will it work on movements no dataset contains?** We held out five gesture classes from training and tested few-shot recognition on them. The embedding beat raw landmarks on every trial: 98.5% vs 96.1% mean, 97.4% vs 94.1% worst case. That number unblocked everything else.

**Venue Wi-Fi blocks device-to-device traffic.** We scrapped browser-to-Pi and made the server the hub. Less elegant, far more robust.

**Photon ships only a TypeScript SDK; our server is Python.** A Node bridge in the same container. We then learned that two running bridges both answer every message.

**Agents are slow, patients are not.** CREAO runs take minutes. The live path stays in the browser. The agent works between sessions, where minutes don't matter and a human reviews every proposal.

## Accomplishments that we're proud of

- Hand movement in a browser becomes a spoken request, a buzzing red Pi, a button press, and "Help is coming." End to end, live.
- A personal classifier that needs 15 samples and transfers to gestures the base model never saw.
- Three escalation channels, each independently cuttable, all cancelled by the first ack.
- An agent that can help but can't harm: human in the loop, hard clamps on every value.
- A contract document written before any code: JSON shapes, every route, folder ownership. Four people, zero merge conflicts.

## What we learned

- **Learn the person, not the gesture.** Asking "what can this patient already do?" made the product simpler and more humane.
- **Frozen embedding plus kNN beats per-patient training.** Faster, no infrastructure, transfers better.
- **Put the agent where latency doesn't matter.** Agents are great reviewers and terrible reflexes.
- **Write the contract first.** One hour of agreeing on JSON saved a day of conflicts.
- **Check your standard deviations before you augment.**

## What's next

- Face input (head tilt, eyebrow raise) for people with no usable hand movement.
- Two-hand gestures, which the embedding already supports.
- Gesture recognition on the bedside Pi itself, no laptop needed.
- Talk to speech-language pathologists about what a real pilot would need.
