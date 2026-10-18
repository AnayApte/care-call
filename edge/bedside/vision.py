#!/usr/bin/env python3
"""Run the existing baseline on a QNX camera. Prints pose names, not care requests.

The personal request meanings require patient training; this smoke runner does
not send alerts. All landmark and baseline inference runs locally on the Pi.
"""
import argparse
import json
import signal
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))

import numpy as np
from embed import embed, load_model, probabilities
from prepare import normalise_hand


def self_test(model):
    cases = json.loads((ROOT / "ml/test_vectors.json").read_text())
    max_error = 0.0
    for case in cases["vectors"]:
        for actual, expected in ((embed(case["input"], model), case["embedding"]),
                                 (probabilities(case["input"], model), case["probs"])):
            error = float(np.max(np.abs(actual - expected)))
            if not np.isfinite(error) or error >= cases["tolerance"]:
                raise ValueError(f"Model reference mismatch: {error}")
            max_error = max(max_error, error)
    print(json.dumps({"self_test": "passed", "vectors": len(cases["vectors"]),
                      "max_error": max_error, "tolerance": cases["tolerance"]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--camera-unit", type=int, default=5)
    parser.add_argument("--seconds", type=float, default=0, help="0 runs until interrupted")
    parser.add_argument("--display", action="store_true", help="show annotated camera on the Pi")
    parser.add_argument("--task", type=Path, default=ROOT / "ml/data/hand_landmarker.task")
    args = parser.parse_args()
    model = load_model()
    self_test(model)
    if args.self_test:
        return

    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    from qnx_camera import QnxCamera

    if not args.task.is_file():
        parser.error(f"Hand landmarker missing: {args.task}; run setup_qnx.sh first")
    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(args.task)),
        running_mode=vision.RunningMode.VIDEO, num_hands=2)
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    camera = QnxCamera(args.camera_unit)
    frames = hand_frames = 0
    started = last_log = time.monotonic()
    last_timestamp = -1
    print(json.dumps({"status": "starting", "camera_unit": args.camera_unit,
                      "model": model["version"], "inference": "local QNX"}), flush=True)
    try:
        with vision.HandLandmarker.create_from_options(options) as landmarker:
            while running and (not args.seconds or time.monotonic() - started < args.seconds):
                loop_start = time.monotonic()
                frame = camera.read()
                # Same normalized image coordinates as the browser, before display mirroring.
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                timestamp = max(last_timestamp + 1, int((time.monotonic() - started) * 1000))
                last_timestamp = timestamp
                result = landmarker.detect_for_video(
                    mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp)
                predictions = []
                for hand in result.hand_landmarks:
                    vector = normalise_hand([[p.x, p.y] for p in hand])
                    if vector is None:
                        continue
                    probs = probabilities(vector, model)
                    best = int(np.argmax(probs))
                    prediction = {"pose": model["classes"][best], "confidence": float(probs[best])}
                    predictions.append(prediction)
                    if args.display:
                        for point in hand:
                            cv2.circle(frame, (int(point.x * frame.shape[1]), int(point.y * frame.shape[0])),
                                       4, (80, 220, 80), -1)
                frames += 1
                hand_frames += bool(predictions)
                now = time.monotonic()
                if now - last_log >= 1:
                    print(json.dumps({"frames": frames, "hand_frames": hand_frames,
                                      "fps": round(frames / (now - started), 1),
                                      "predictions": predictions}), flush=True)
                    last_log = now
                if args.display:
                    title = " | ".join(f"{p['pose']} {p['confidence']:.2f}" for p in predictions) or "Show a hand"
                    cv2.putText(frame, title, (15, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                    cv2.imshow("Care Call - QNX model preview (q to quit)", frame)
                    if cv2.waitKey(1) & 0xff == ord("q"):
                        break
                time.sleep(max(0, 1 / 12 - (time.monotonic() - loop_start)))
    finally:
        camera.close()
        if args.display:
            cv2.destroyAllWindows()
        print(json.dumps({"status": "stopped", "frames": frames, "hand_frames": hand_frames}), flush=True)


if __name__ == "__main__":
    main()
