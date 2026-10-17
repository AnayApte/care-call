"""Few-shot transfer test: does the embedding beat raw landmarks for a personal kNN?

Simulates the product: a new person records SHOTS samples per label, then a
kNN classifies everything else they do. Uses validation users only (never seen
in training). If the model was trained with --holdout, the test uses exactly
those held-out classes, so the embedding has never seen the gestures: that is
the honest number for "does this transfer to new gestures".

  .venv/bin/python fewshot.py baseline.json
  .venv/bin/python fewshot.py holdout.json
"""
import json
import sys
from pathlib import Path

import numpy as np

from embed import embed_batch, load_model

HERE = Path(__file__).resolve().parent
SHOTS = 15
TEST_PER_CLASS = 200
TRIALS = 60
K = 5
N_CLASSES = 5
SEED = 0


def knn_predict(Xtr, ytr, Xte):
    d = ((Xte[:, None, :] - Xtr[None, :, :]) ** 2).sum(-1)
    votes = ytr[np.argsort(d, 1)[:, :K]]
    return np.array([np.bincount(v, minlength=N_CLASSES).argmax() for v in votes])


def pick_classes(rng, all_classes, holdout):
    if holdout:
        return [all_classes.index(c) for c in holdout]
    neutral = all_classes.index("neutral")
    others = rng.choice([i for i in range(len(all_classes)) if i != neutral], N_CLASSES - 1, replace=False)
    return [int(c) for c in others] + [neutral]


def one_trial(rng, feats, y, cls):
    tr_idx, te_idx, ytr, yte = [], [], [], []
    for ci, c in enumerate(cls):
        idx = rng.permutation(np.where(y == c)[0])
        tr_idx += idx[:SHOTS].tolist()
        te_idx += idx[SHOTS:SHOTS + TEST_PER_CLASS].tolist()
        ytr += [ci] * SHOTS
        yte += [ci] * len(idx[SHOTS:SHOTS + TEST_PER_CLASS])
    ytr, yte = np.array(ytr), np.array(yte)
    return {name: float((knn_predict(F[tr_idx], ytr, F[te_idx]) == yte).mean())
            for name, F in feats.items()}


def main(path):
    model = load_model(HERE / path)
    va = np.load(HERE / "data" / "val.npz")
    all_classes = json.load(open(HERE / "data" / "classes.json"))["classes"]
    holdout = model.get("holdout") or []
    X, y = va["X"], va["y"]
    mean, std = np.asarray(model["mean"], np.float32), np.asarray(model["std"], np.float32)
    feats = {"raw42": (X - mean) / std, "emb32": embed_batch(X, model)}
    rng = np.random.default_rng(SEED)
    results = {k: [] for k in feats}
    for _ in range(TRIALS):
        cls = pick_classes(rng, all_classes, holdout)
        for k, v in one_trial(rng, feats, y, cls).items():
            results[k].append(v)
    mode = f"held-out classes {holdout}" if holdout else f"random {N_CLASSES}-class subsets incl. neutral"
    print(f"{path}: {SHOTS}-shot kNN (k={K}), {TRIALS} trials, {mode}")
    print("| features | mean acc | worst trial | best trial |")
    print("| --- | --- | --- | --- |")
    for k, v in results.items():
        print(f"| {k} | {np.mean(v):.3f} | {np.min(v):.3f} | {np.max(v):.3f} |")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "baseline.json")
