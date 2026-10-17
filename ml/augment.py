"""Landmark augmentation for training only (torch, batch-wise).

Works on the raw wrist_relative_v1 vector (42 floats, before standardisation).
Each hand in the batch gets its own random rotation, scale and per-point jitter.
Meant to mimic weak, shaky or partially closed hands: small pose changes that
must not change the label.
"""
import math

import torch

N_POINTS = 21
WRIST = 0
MAX_ROTATION_DEG = 15.0
SCALE_RANGE = (0.9, 1.1)
JITTER_STD = 0.02


def augment(x, generator=None):
    """[B, 42] -> [B, 42] with random rotation, scale and gaussian jitter."""
    b = x.shape[0]
    pts = x.view(b, N_POINTS, 2)
    theta = (torch.rand(b, generator=generator) * 2 - 1) * math.radians(MAX_ROTATION_DEG)
    cos, sin = torch.cos(theta), torch.sin(theta)
    rot = torch.stack([torch.stack([cos, -sin], -1), torch.stack([sin, cos], -1)], -2)  # [B,2,2]
    scale = torch.empty(b, 1, 1).uniform_(*SCALE_RANGE, generator=generator)
    jitter = torch.randn(pts.shape, generator=generator) * JITTER_STD
    jitter[:, WRIST] = 0.0  # the wrist is the origin by definition; it must stay at (0, 0)
    out = torch.bmm(pts, rot.transpose(1, 2)) * scale + jitter
    return out.reshape(b, N_POINTS * 2)


def test_identity_at_zero():
    x = torch.randn(4, 42)
    x[:, :2] = 0.0
    out = augment(x)
    assert out.shape == x.shape
    assert (out - x).abs().max() < 1.0, "augmentation moved points too far"
    assert out.view(4, N_POINTS, 2)[:, WRIST].abs().max() == 0, "wrist must stay at origin"
    print("augment ok: shape preserved, perturbation bounded")


if __name__ == "__main__":
    test_identity_at_zero()
