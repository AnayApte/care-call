# Baseline static hand-pose classifier

Trained on HaGRIDv2 landmark annotations. **This is trained on able-bodied hands
from a public dataset**; it is a starting point whose hidden layer gives a general
embedding, not a model of post-stroke movement. Assistive prototype, not a medical device.

## Results

| metric | value |
| --- | --- |
| validation accuracy | 0.9489 |
| train hands | 54956 |
| validation hands | 13044 |
| unique users (train) | 13100 |
| unique users (val) | 3193 |
| training time | 8.9 s |
| epochs run | 40 |

The split is by `user_id` (sha256 hash, 80/20), so no person appears in both sets.
Confusion matrix: `confusion.png`.

## Per-class validation accuracy

| class | n_val | accuracy |
| --- | --- | --- |
| call | 369 | 0.981 |
| dislike | 365 | 0.989 |
| fist | 380 | 0.992 |
| four | 376 | 0.997 |
| grabbing | 327 | 0.982 |
| grip | 370 | 0.978 |
| hand_heart | 380 | 0.950 |
| hand_heart2 | 337 | 0.875 |
| holy | 339 | 0.912 |
| like | 419 | 0.983 |
| little_finger | 397 | 0.997 |
| middle_finger | 420 | 0.967 |
| mute | 373 | 0.952 |
| neutral | 427 | 0.934 |
| ok | 399 | 0.982 |
| one | 377 | 0.934 |
| palm | 366 | 0.986 |
| peace | 392 | 0.985 |
| peace_inverted | 397 | 0.982 |
| point | 377 | 0.952 |
| rock | 378 | 0.989 |
| stop | 375 | 0.989 |
| stop_inverted | 368 | 0.978 |
| take_picture | 374 | 0.912 |
| three | 379 | 0.976 |
| three2 | 392 | 0.990 |
| three3 | 355 | 0.986 |
| three_gun | 368 | 0.992 |
| thumb_index | 610 | 0.898 |
| thumb_index2 | 377 | 0.528 |
| timeout | 353 | 0.847 |
| two_up | 376 | 0.987 |
| two_up_inverted | 358 | 0.983 |
| xsign | 394 | 0.911 |

## Model

MLP `42 -> 64 -> 32 -> 34`, ReLU, dropout 0.2 during training only, Adam lr 1e-3,
batch 64, up to 40 epochs, early stopping (patience 5 on validation accuracy), seed 42.
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

Hands without landmarks or without exactly 21 points were skipped. Each class was capped
at 2000 hands sampled with seed 42. `no_gesture` was renamed `neutral`.

## Dataset

HaGRIDv2 (HAnd Gesture Recognition Image Dataset), landmark annotations.
Nuzhdin, A., Nagaev, A., Sautin, A., Kapitanov, A., Kvanchiani, K. (2024).
*HaGRIDv2: 1M Images for Static and Dynamic Hand Gesture Recognition.*
https://github.com/hukenovs/hagrid. Licence: CC BY-SA 4.0.
