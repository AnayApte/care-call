"""Build train/val landmark datasets from HaGRIDv2 annotations.

Walks ml/data/annotations/{train,val,test}/*.json, normalises every hand to a
42-float wrist-relative vector, caps each class at MAX_PER_CLASS hands, and
splits by user_id so no person appears in both train and validation.

Outputs: ml/data/train.npz, ml/data/val.npz, ml/data/classes.json
"""
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ANN_DIR = HERE / "data" / "annotations"
OUT_DIR = HERE / "data"
SPLITS = ("train", "val", "test")
MAX_PER_CLASS = 2000
SEED = 42
TRAIN_FRACTION = 0.8
N_POINTS = 21
WRIST = 0
INDEX_MCP = 5
MIDDLE_MCP = 9
PINKY_MCP = 17
RENAME = {"no_gesture": "neutral"}
NORMALISATION = "wrist_relative_v1"


def normalise_hand(points):
    """21 [x, y] pairs -> 42 floats, or None if the hand is degenerate.

    1. Subtract the wrist (point 0).
    2. Divide by the Euclidean distance wrist -> middle-finger MCP (point 9).
    3. Handedness rule: HaGRID has no left/right label, so if the pinky MCP
       (17) has a smaller x than the index MCP (5) after wrist subtraction,
       mirror x -> -x. This maps both hands onto one canonical orientation.
    """
    pts = np.asarray(points, dtype=np.float64)
    if pts.shape != (N_POINTS, 2):
        return None
    rel = pts - pts[WRIST]
    scale = float(np.linalg.norm(rel[MIDDLE_MCP]))
    if not np.isfinite(scale) or scale < 1e-6:
        return None
    rel = rel / scale
    if rel[PINKY_MCP, 0] < rel[INDEX_MCP, 0]:
        rel = rel * np.array([-1.0, 1.0])
    return rel.reshape(-1).astype(np.float32)


def iter_hands(path):
    """Yield (label, user_id, vector) for every valid hand in one JSON file."""
    with open(path) as f:
        data = json.load(f)
    for entry in data.values():
        labels = entry.get("labels") or []
        hands = entry.get("hand_landmarks") or []
        user_id = entry.get("user_id") or ""
        for i, hand in enumerate(hands):
            if i >= len(labels) or not hand or len(hand) != N_POINTS:
                continue
            vec = normalise_hand(hand)
            if vec is None:
                continue
            yield RENAME.get(labels[i], labels[i]), user_id, vec


def collect():
    """Return {class_name: (list_of_vectors, list_of_user_ids)} over all splits."""
    per_class = {}
    files = sorted(p for s in SPLITS for p in (ANN_DIR / s).glob("*.json"))
    if not files:
        sys.exit(f"no annotation files found under {ANN_DIR}")
    for n, path in enumerate(files, 1):
        t0 = time.time()
        count = 0
        for label, user_id, vec in iter_hands(path):
            vecs, users = per_class.setdefault(label, ([], []))
            vecs.append(vec)
            users.append(user_id)
            count += 1
        print(f"[{n}/{len(files)}] {path.parent.name}/{path.name}: "
              f"{count} hands in {time.time() - t0:.1f}s", flush=True)
    return per_class


def user_split(user_id):
    """Deterministic 80/20 split by hashing the user id."""
    h = hashlib.sha256(user_id.encode()).digest()
    return "train" if (h[0] / 256.0) < TRAIN_FRACTION else "val"


def main():
    rng = np.random.default_rng(SEED)
    per_class = collect()
    classes = sorted(per_class)
    out = {"train": ([], [], set()), "val": ([], [], set())}

    print("\nhands kept per class (after cap):")
    for idx, name in enumerate(classes):
        vecs, users = per_class[name]
        order = rng.permutation(len(vecs))[:MAX_PER_CLASS]
        counts = {"train": 0, "val": 0}
        for j in order:
            split = user_split(users[j])
            X, y, u = out[split]
            X.append(vecs[j])
            y.append(idx)
            u.add(users[j])
            counts[split] += 1
        print(f"  {name:16s} total={len(vecs):6d} kept={len(order):4d} "
              f"train={counts['train']:4d} val={counts['val']:4d}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for split, (X, y, users) in out.items():
        X = np.stack(X).astype(np.float32)
        y = np.asarray(y, dtype=np.int64)
        np.savez(OUT_DIR / f"{split}.npz", X=X, y=y, n_users=len(users))
        print(f"{split}: {len(y)} hands, {len(users)} unique users -> {split}.npz")

    with open(OUT_DIR / "classes.json", "w") as f:
        json.dump({"classes": classes, "normalisation": NORMALISATION}, f, indent=1)
    print(f"{len(classes)} classes -> classes.json")


if __name__ == "__main__":
    main()
