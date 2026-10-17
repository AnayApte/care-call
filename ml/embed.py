"""Reference numpy implementation of the baseline embedding.

`embed(x42)` must be matched exactly by the browser. It uses only numpy and
baseline.json (no torch). Running this file as a script checks the numpy path
against the torch model on the first 5 validation rows and writes
ml/test_vectors.json for the JS side.
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
BASELINE = HERE / "baseline.json"
N_TEST = 5
TOLERANCE = 1e-5


def load_model(path=BASELINE):
    with open(path) as f:
        return json.load(f)


def _standardise(model, x):
    return (np.asarray(x, dtype=np.float32) - np.asarray(model["mean"], np.float32)) \
        / np.asarray(model["std"], np.float32)


def _dense(layer, x):
    return np.asarray(layer["W"], np.float32) @ x + np.asarray(layer["b"], np.float32)


def embed(x42, model=None):
    """42 normalised landmark floats -> 32-float embedding (output of layer `embedding_layer`)."""
    model = model or load_model()
    h = _standardise(model, x42)
    for layer in model["layers"][: model["embedding_layer"] + 1]:
        h = np.maximum(_dense(layer, h), 0.0)  # every layer up to the embedding is relu
    return h


def probabilities(x42, model=None):
    """42 floats -> softmax over model['classes']."""
    model = model or load_model()
    h = _standardise(model, x42)
    for layer in model["layers"]:
        h = _dense(layer, h)
        if layer["act"] == "relu":
            h = np.maximum(h, 0.0)
    h = np.exp(h - h.max())
    return h / h.sum()


def _torch_reference(model, X):
    """Run the same forward pass in torch from the exported weights (test only)."""
    import torch

    h = torch.from_numpy(X)
    for layer in model["layers"][: model["embedding_layer"] + 1]:
        W, b = torch.tensor(layer["W"]), torch.tensor(layer["b"])
        h = torch.relu(h @ W.T + b)
    return h.numpy()


def test_numpy_matches_torch():
    model = load_model()
    va = np.load(HERE / "data" / "val.npz")
    X = va["X"][:N_TEST]
    mean, std = np.asarray(model["mean"], np.float32), np.asarray(model["std"], np.float32)
    ref = _torch_reference(model, (X - mean) / std)
    ours = np.stack([embed(x, model) for x in X])
    diff = float(np.abs(ref - ours).max())
    assert ours.shape == (N_TEST, 32), ours.shape
    assert diff < TOLERANCE, f"numpy/torch mismatch: max abs diff {diff}"
    print(f"numpy matches torch on {N_TEST} rows, max abs diff {diff:.2e}")

    vectors = [{"input": X[i].tolist(), "embedding": ours[i].tolist(),
                "probs": probabilities(X[i], model).tolist(),
                "label": model["classes"][int(va["y"][i])]} for i in range(N_TEST)]
    with open(HERE / "test_vectors.json", "w") as f:
        json.dump({"tolerance": TOLERANCE, "vectors": vectors}, f)
    print(f"wrote {N_TEST} test vectors -> test_vectors.json")


if __name__ == "__main__":
    try:
        test_numpy_matches_torch()
    except AssertionError as e:
        sys.exit(f"FAILED: {e}")
