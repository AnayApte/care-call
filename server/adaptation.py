"""Validate agent settings before showing or saving them. No invented proposals."""
import math

LABELS = ("water", "pain", "help", "bathroom", "neutral")


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise ValueError("Invalid adjustment number")
    return value


def clean_settings(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("Invalid adjustments")
    version = _number(raw.get("version"))
    if version < 1 or version != int(version) or version > 9007199254740991:
        raise ValueError("Invalid adjustment version")

    def limits(item, fallback=None):
        if not isinstance(item, dict):
            raise ValueError("Invalid label adjustment")
        fallback = fallback or {}
        hold = _number(item.get("hold_frames", fallback.get("hold_frames")))
        confidence = _number(item.get("min_confidence", fallback.get("min_confidence")))
        return {"hold_frames": max(6, min(30, math.floor(hold + .5))),
                "min_confidence": max(.6, min(.95, confidence))}

    base = limits(raw)
    overrides = raw.get("labels", {})
    retrain = raw.get("retrain_labels", [])
    if not isinstance(overrides, dict) or not isinstance(retrain, list):
        raise ValueError("Invalid adjustment labels")
    replace = raw.get("suggest_replace", [])
    if not isinstance(replace, list):
        raise ValueError("Invalid replacement suggestions")
    return {"version": int(version), **base,
            "labels": {label: limits(overrides[label], base) for label in LABELS if label in overrides},
            "retrain_labels": [label for label in LABELS if label in retrain],
            "suggest_replace": [{"label": item["label"], "reason": str(item.get("reason", ""))[:2000]}
                                for item in replace if isinstance(item, dict) and item.get("label") in LABELS]}
