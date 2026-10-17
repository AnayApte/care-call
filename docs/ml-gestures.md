# Per-patient gestures, two hands, and adding classes (ml/ design note)

Assistive prototype, not a medical device. Owner: Rey. Status: design, partly built.

## How a patient gets their own gestures (already how it works)

The baseline MLP in `ml/baseline.json` is frozen. Its 32-float embedding is a general
"what shape is this hand" descriptor. A patient's labels (water, pain, help, bathroom,
neutral, or anything else) are defined only by the ~15 samples they record on `/patient`.
The kNN runs on embeddings instead of raw landmarks. Nothing is retrained per patient.

So adapting to a new patient or adding a request word is just: record 15 samples for the new
label. No model change, no server change. `ml/experiments.md` shows the embedding beats raw
landmarks on five gestures the baseline never saw during training (98.5% vs 96.1% few-shot).

Rejection: keep the contract's 0.8 vote threshold, and add a distance gate: if the nearest
neighbour is farther than the patient's own typical within-class distance, treat as neutral.
This is what stops a half-formed movement from firing. The CREAO adaptation agent (s19)
tunes that gate per patient between sessions.

## Two hands (product is two-hand)

- Run the hand landmarker with `num_hands=2`. Normalise each hand separately with
  `wrist_relative_v1` and embed each one: 32 floats per hand.
- Feature for the kNN: `[left_emb(32), right_emb(32), left_present, right_present]` = 66 floats.
  A missing hand is all zeros with its flag at 0. Order by MediaPipe handedness, not by
  screen position, so swapping sides does not change the vector.
- One-hand gestures still work: the other half is zeros in both training samples and live frames.
- Two-hand gestures (both hands up, hands together) become learnable with no extra model.
- `ml/camera_test.py` already tracks two hands; it needs the 66-float assembly step, then the
  same function must be mirrored in `web/src/cv/` (Josh) and `edge/` (Alex).

## Adding new classes to the baseline (for later)

The baseline's 34 HaGRID classes are only there to shape the embedding. To add our own:

1. `prepare.py` gains a second input, `ml/data/custom/*.json`, in the `benchmark/data` export
   format from contract s18 (one file per person and condition, `simulated: true`).
   Classes are discovered from the data; no code change per class.
2. Before trusting a new class, train with `--holdout <new classes>` and run `fewshot.py`.
   If the embedding does not beat raw landmarks on it, the class is not helping the embedding
   and should stay a kNN-only label.
3. Merge near-duplicates (`thumb_index2` into `thumb_index`, `hand_heart2`, `three2/3`,
   `two_up_inverted`) at the same time, since the class list is changing anyway.
4. Keep `neutral` as a real class with varied data. It is the only one that must never fire.

## Open items

- Normalisation differs from contract s8 (wrist->MCP9 scale and a mirror rule). Needs a
  `shared/CONTRACT_REQUESTS.md` line and Josh's agreement before the browser uses the embedding.
- The mirror rule collapses palm-up and palm-down. Fine for one patient; revisit if a patient's
  gesture is "turn the hand over".
