"""Capture real QNX Sensor Framework frames without a Linux /dev/video device."""
import ctypes
import os
from pathlib import Path

import cv2
import numpy as np


def decode_frame(raw, info):
    """Respect sensor row padding; return BGR for the existing OpenCV pipeline."""
    width, height, stride, uv_offset, uv_stride, kind = map(int, info)
    if width <= 0 or height <= 0 or width % 2 or height % 2:
        raise ValueError("Invalid camera frame dimensions")
    if kind == 1:
        if (stride < width or uv_stride < width or uv_offset < height * stride
                or uv_offset + (height // 2) * uv_stride > len(raw)):
            raise ValueError("Invalid NV12 camera buffer")
        y = raw[:height * stride].reshape(height, stride)[:, :width]
        uv = raw[uv_offset:uv_offset + height // 2 * uv_stride]
        uv = uv.reshape(height // 2, uv_stride)[:, :width].reshape(height // 2, width // 2, 2)
        return cv2.cvtColorTwoPlane(y, uv, cv2.COLOR_YUV2BGR_NV12)
    if kind == 2:
        if stride < width * 2 or height * stride > len(raw):
            raise ValueError("Invalid YUY2 camera buffer")
        packed = raw[:height * stride].reshape(height, stride)[:, :width * 2]
        return cv2.cvtColor(packed.reshape(height, width, 2), cv2.COLOR_YUV2BGR_YUY2)
    raise ValueError(f"Unsupported camera format: {kind}")


class QnxCamera:
    def __init__(self, unit=5):
        path = Path(__file__).parent / "build/libcarecall_camera.so"
        self.lib = ctypes.CDLL(str(path))
        self.lib.carecall_camera_open.argtypes = [ctypes.c_int]
        self.lib.carecall_camera_open.restype = ctypes.c_int
        self.lib.carecall_camera_read.argtypes = [
            ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_uint32)]
        self.lib.carecall_camera_read.restype = ctypes.c_int
        self.lib.carecall_camera_close.argtypes = []
        self.lib.carecall_camera_close.restype = None
        self.buffer = np.empty(32 * 1024 * 1024, dtype=np.uint8)
        self.info = (ctypes.c_uint32 * 6)()
        error = self.lib.carecall_camera_open(unit)
        if error:
            raise OSError(error, f"QNX camera unit {unit}: {os.strerror(error)}")
        self.opened = True

    def read(self):
        size = self.lib.carecall_camera_read(self.buffer.ctypes.data, self.buffer.size, self.info)
        if size <= 0:
            raise OSError(-size, f"Camera frame unavailable: {os.strerror(-size)}")
        return decode_frame(self.buffer[:size], self.info)

    def close(self):
        if self.opened:
            self.lib.carecall_camera_close()
            self.opened = False
