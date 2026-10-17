# Baseline static hand-pose classifier

Trained on HaGRIDv2 landmark annotations. **This is trained on able-bodied hands
from a public dataset**; it is a starting point whose hidden layer gives a general
embedding, not a model of post-stroke movement. Assistive prototype, not a medical device.

## Results

| metric | value |
| --- | --- |
| validation accuracy | 0.9516 |
| train hands | 1052724 |
| validation hands | 255628 |
| unique users (train) | 51543 |
| unique users (val) | 12613 |
| training time | 92.9 s |
| epochs run | 57 |
| augmentation | True |

The split is by `user_id` (sha256 hash, 80/20), so no person appears in both sets.
Confusion matrix: `confusion.png`. Few-shot transfer numbers and ablations: `experiments.md`.

## Per-class validation accuracy

| class | n_val | accuracy |
| --- | --- | --- |
| call | 5272 | 0.986 |
| dislike | 5919 | 0.987 |
| fist | 5856 | 0.987 |
| four | 6004 | 0.995 |
| grabbing | 6560 | 0.977 |
| grip | 6481 | 0.969 |
| hand_heart | 10009 | 0.957 |
| hand_heart2 | 6215 | 0.867 |
| holy | 8488 | 0.948 |
| like | 5838 | 0.988 |
| little_finger | 6680 | 0.990 |
| middle_finger | 7550 | 0.977 |
| mute | 5987 | 0.963 |
| neutral | 36153 | 0.969 |
| ok | 5959 | 0.991 |
| one | 5967 | 0.931 |
| palm | 6054 | 0.987 |
| peace | 5892 | 0.982 |
| peace_inverted | 5549 | 0.974 |
| point | 6335 | 0.951 |
| rock | 6105 | 0.990 |
| stop | 5761 | 0.987 |
| stop_inverted | 5788 | 0.984 |
| take_picture | 7849 | 0.908 |
| three | 5724 | 0.982 |
| three2 | 5657 | 0.993 |
| three3 | 7493 | 0.990 |
| three_gun | 6940 | 0.995 |
| thumb_index | 13875 | 0.840 |
| thumb_index2 | 6922 | 0.670 |
| timeout | 5165 | 0.817 |
| two_up | 5845 | 0.990 |
| two_up_inverted | 5572 | 0.977 |
| xsign | 8164 | 0.941 |

## Model

MLP `42 -> 64 -> 32 -> 34`, ReLU, dropout 0.2 during training only, Adam lr 0.001
halved after 3 epochs without improvement, batch 512, up to 100 epochs,
early stopping (patience 10 on validation accuracy), seed 42.
Training augmentation (`augment.py`): per-hand random rotation, scale and gaussian jitter on the
raw landmarks, to stand in for weak, shaky or partially closed hands.
Inputs are standardised with the training mean and std, both stored in `baseline.json`.
The 32-float output of the second ReLU (`embedding_layer: 1`) is the embedding the browser
uses for the personal kNN. `embed.py` is the numpy reference implementation.

## Landmark normalisation (`wrist_relative_v1`)

1. Subtract point 0 (wrist) from all 21 points.
2. Divide all points by the Euclidean distance from point 0 to point 9 (middle-finger MCP).
3. **Handedness rule.** HaGRID gives no left/right label, so we infer orientation from the
   palm: if point 17 (pinky MCP) has a smaller x than point 5 (index MCP) after wrist
   subtraction, mirror x to -x. Both hands then share one canonical orientation.
   The browser must apply the identical rule before calling the model.
4. Flatten to 42 floats in `x0, y0, x1, y1, ...` order.

Note: this differs from contract section 8 (max distance from wrist, no mirror). Kept on
purpose for testing; see `shared/CONTRACT_REQUESTS.md` before shipping.

Hands without landmarks or without exactly 21 points were skipped. Every hand in the
annotations is used (no per-class cap). `no_gesture` was renamed `neutral`.

## Dataset

HaGRIDv2 (HAnd Gesture Recognition Image Dataset), landmark annotations.
Nuzhdin, A., Nagaev, A., Sautin, A., Kapitanov, A., Kvanchiani, K. (2024).
*HaGRIDv2: 1M Images for Static and Dynamic Hand Gesture Recognition.*
https://github.com/hukenovs/hagrid. Licence: CC BY-SA 4.0.
