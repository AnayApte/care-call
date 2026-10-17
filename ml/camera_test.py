"""Live webcam test of baseline.json (developer tool, not part of the product).

Opens the Mac camera, runs MediaPipe hand landmarks, applies the same
wrist_relative_v1 normalisation as prepare.py, and shows the top-3 predicted
gestures plus the 32-float embedding as a bar strip. Press q to quit.

Needs:  .venv/bin/pip install mediapipe opencv-python
        data/hand_landmarker.task (downloaded by this script if missing)
Run:    .venv/bin/python camera_test.py
"""
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from embed import embed, load_model, probabilities
from prepare import normalise_hand

HERE = Path(__file__).resolve().parent
TASK_FILE = HERE / "data" / "hand_landmarker.task"
TASK_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
            "hand_landmarker/float16/latest/hand_landmarker.task")
TOP_K = 3
CAMERA_INDEX = 0
EMBED_BAR_W, EMBED_BAR_H = 8, 60
GREEN, WHITE, YELLOW = (80, 220, 80), (255, 255, 255), (60, 220, 255)


def ensure_task_file():
    if not TASK_FILE.exists():
        print(f"downloading hand landmarker model -> {TASK_FILE}")
        urllib.request.urlretrieve(TASK_URL, TASK_FILE)


def make_landmarker():
    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(TASK_FILE)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=1,
    )
    return vision.HandLandmarker.create_from_options(options)


def landmarks_to_points(hand):
    """MediaPipe normalised landmarks -> 21 [x, y] pairs in image fractions."""
    return [[lm.x, lm.y] for lm in hand]


def draw_connections(frame, hand):
    h, w = frame.shape[:2]
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in hand]
    for conn in vision.HandLandmarksConnections.HAND_CONNECTIONS:
        cv2.line(frame, pts[conn.start], pts[conn.end], GREEN, 2)
    for p in pts:
        cv2.circle(frame, p, 4, WHITE, -1)


def draw_prediction(frame, model, vec):
    probs = probabilities(vec, model)
    top = np.argsort(probs)[::-1][:TOP_K]
    for row, j in enumerate(top):
        colour = YELLOW if row == 0 else WHITE
        cv2.putText(frame, f"{model['classes'][j]:16s} {probs[j]:.2f}",
                    (16, 40 + 32 * row), cv2.FONT_HERSHEY_SIMPLEX, 0.9, colour, 2)
    emb = embed(vec, model)
    scale = max(float(emb.max()), 1e-6)
    x0, y0 = 16, frame.shape[0] - 20
    for i, v in enumerate(emb):
        bar = int(EMBED_BAR_H * v / scale)
        cv2.rectangle(frame, (x0 + i * (EMBED_BAR_W + 2), y0 - bar),
                      (x0 + i * (EMBED_BAR_W + 2) + EMBED_BAR_W, y0), GREEN, -1)
    cv2.putText(frame, "32-d embedding", (x0, y0 - EMBED_BAR_H - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1)


def main():
    ensure_task_file()
    model = load_model()
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        sys.exit("could not open camera; check System Settings > Privacy > Camera")
    landmarker = make_landmarker()
    t_start = time.time()
    print("camera open; press q to quit")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect_for_video(mp_image, int((time.time() - t_start) * 1000))
        if result.hand_landmarks:
            hand = result.hand_landmarks[0]
            draw_connections(frame, hand)
            vec = normalise_hand(landmarks_to_points(hand))
            if vec is not None:
                draw_prediction(frame, model, vec)
        else:
            cv2.putText(frame, "no hand", (16, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, WHITE, 2)
        cv2.imshow("baseline.json live test (q to quit)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
