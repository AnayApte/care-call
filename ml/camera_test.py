"""Live webcam test of baseline.json (developer tool, not part of the product).

Opens the Mac camera, runs MediaPipe hand landmarks on up to two hands,
applies the same wrist_relative_v1 normalisation as prepare.py to each hand,
and shows per hand the top-3 predicted gestures plus the 32-float embedding
as a bar strip. Each hand gets its own column (left/right by screen position).
Press q to quit.

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
MAX_HANDS = 2
EMBED_BAR_W, EMBED_BAR_H = 8, 60
GREEN, WHITE, YELLOW = (80, 220, 80), (255, 255, 255), (60, 220, 255)
CYAN = (220, 200, 60)
HAND_COLOURS = (GREEN, CYAN)
MARGIN = 16


def ensure_task_file():
    if not TASK_FILE.exists():
        print(f"downloading hand landmarker model -> {TASK_FILE}")
        urllib.request.urlretrieve(TASK_URL, TASK_FILE)


def make_landmarker():
    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(TASK_FILE)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=MAX_HANDS,
    )
    return vision.HandLandmarker.create_from_options(options)


def landmarks_to_points(hand):
    """MediaPipe normalised landmarks -> 21 [x, y] pairs in image fractions."""
    return [[lm.x, lm.y] for lm in hand]


def draw_connections(frame, hand, colour):
    h, w = frame.shape[:2]
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in hand]
    for conn in vision.HandLandmarksConnections.HAND_CONNECTIONS:
        cv2.line(frame, pts[conn.start], pts[conn.end], colour, 2)
    for p in pts:
        cv2.circle(frame, p, 4, WHITE, -1)


def hand_label(result, i):
    """MediaPipe handedness category for hand i, or 'hand' if missing."""
    try:
        return result.handedness[i][0].category_name.lower()
    except (AttributeError, IndexError):
        return "hand"


def draw_prediction(frame, model, vec, x0, title, colour):
    """Top-K classes and the embedding strip in a column starting at x0."""
    probs = probabilities(vec, model)
    top = np.argsort(probs)[::-1][:TOP_K]
    cv2.putText(frame, title, (x0, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, colour, 2)
    for row, j in enumerate(top):
        text_colour = YELLOW if row == 0 else WHITE
        cv2.putText(frame, f"{model['classes'][j]:16s} {probs[j]:.2f}",
                    (x0, 68 + 30 * row), cv2.FONT_HERSHEY_SIMPLEX, 0.8, text_colour, 2)
    emb = embed(vec, model)
    scale = max(float(emb.max()), 1e-6)
    y0 = frame.shape[0] - 20
    for i, v in enumerate(emb):
        bar = int(EMBED_BAR_H * v / scale)
        cv2.rectangle(frame, (x0 + i * (EMBED_BAR_W + 2), y0 - bar),
                      (x0 + i * (EMBED_BAR_W + 2) + EMBED_BAR_W, y0), colour, -1)
    cv2.putText(frame, "32-d embedding", (x0, y0 - EMBED_BAR_H - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1)


def process_hands(frame, model, result):
    """Draw skeleton + prediction for every detected hand, one column each.

    Columns are assigned by wrist screen position so the left-most hand on
    screen always gets the left column, regardless of detection order.
    """
    order = sorted(range(len(result.hand_landmarks)),
                   key=lambda i: result.hand_landmarks[i][0].x)
    col_w = frame.shape[1] // MAX_HANDS
    for col, i in enumerate(order[:MAX_HANDS]):
        hand = result.hand_landmarks[i]
        colour = HAND_COLOURS[col % len(HAND_COLOURS)]
        draw_connections(frame, hand, colour)
        vec = normalise_hand(landmarks_to_points(hand))
        x0 = MARGIN + col * col_w
        if vec is None:
            cv2.putText(frame, "degenerate hand", (x0, 32),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, colour, 2)
            continue
        draw_prediction(frame, model, vec, x0, hand_label(result, i), colour)
    return len(order)


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
        n_hands = process_hands(frame, model, result) if result.hand_landmarks else 0
        if n_hands == 0:
            cv2.putText(frame, "no hands", (MARGIN, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, WHITE, 2)
        cv2.putText(frame, f"{n_hands}/{MAX_HANDS} hands", (frame.shape[1] - 150, frame.shape[0] - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, WHITE, 1)
        cv2.imshow("baseline.json live test (q to quit)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
