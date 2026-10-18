#!/bin/sh
# Run on the QNX Pi from any directory. Uses native QNX packages, not Linux wheels.
set -eu
cd "$(dirname "$0")/../.."
sudo apk add --no-progress python3-numpy python3-opencv python3-mediapipe-cpu qnx-sf-base-dev qnx-screen-dev
python3 -m venv --system-site-packages .venv
mkdir -p edge/bedside/build ml/data
gcc -shared -fPIC -O2 -Wall -Wextra -o edge/bedside/build/libcarecall_camera.so edge/bedside/qnx_camera.c -lcamapi
if [ ! -s ml/data/hand_landmarker.task ]; then
    curl -fL --retry 2 --max-time 120 -o ml/data/hand_landmarker.task.download \
        https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
    mv ml/data/hand_landmarker.task.download ml/data/hand_landmarker.task
fi
.venv/bin/python3 edge/bedside/vision.py --self-test
.venv/bin/python3 -m unittest discover -s edge/bedside -p test_qnx_camera.py
