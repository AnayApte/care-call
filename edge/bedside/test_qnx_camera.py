"""Frame-layout regression checks; run in the Pi's CV venv."""
import unittest

import cv2
import numpy as np

from qnx_camera import decode_frame


class FrameLayoutTests(unittest.TestCase):
    def test_nv12_with_row_padding_and_gap_between_planes(self):
        y = np.array([[16, 32, 64, 128], [235, 200, 100, 50]], dtype=np.uint8)
        uv = np.array([[[90, 240], [160, 70]]], dtype=np.uint8)
        raw = np.zeros(24, dtype=np.uint8)
        raw[:12].reshape(2, 6)[:, :4] = y
        raw[18:22] = uv.ravel()
        expected = cv2.cvtColorTwoPlane(y, uv, cv2.COLOR_YUV2BGR_NV12)
        np.testing.assert_array_equal(decode_frame(raw, [4, 2, 6, 18, 6, 1]), expected)

    def test_yuy2_with_row_padding(self):
        pixels = np.array([[[16, 90], [100, 240]], [[235, 160], [80, 70]]], dtype=np.uint8)
        raw = np.zeros((2, 8), dtype=np.uint8)
        raw[:, :4] = pixels.reshape(2, 4)
        expected = cv2.cvtColor(pixels, cv2.COLOR_YUV2BGR_YUY2)
        np.testing.assert_array_equal(decode_frame(raw.ravel(), [2, 2, 8, 0, 0, 2]), expected)

    def test_truncated_or_invalid_frames_fail(self):
        for info in ([4, 2, 4, 8, 4, 1], [4, 2, 8, 0, 0, 2],
                     [0, 2, 4, 0, 0, 2], [3, 2, 6, 0, 0, 2], [2, 2, 4, 0, 0, 99]):
            with self.subTest(info=info), self.assertRaises(ValueError):
                decode_frame(np.zeros(4, dtype=np.uint8), info)


if __name__ == "__main__":
    unittest.main()
