"""Unit tests for the emotion service.

These run without DeepFace where possible (decoding, schema mapping) so the
test suite stays fast. The DeepFace-dependent test is opt-in.
"""

import base64

import cv2
import numpy as np
import pytest

from app.services import emotion


def _png_base64(width: int = 32, height: int = 32) -> str:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return base64.b64encode(buf.tobytes()).decode()


def test_decode_plain_base64():
    frame = emotion.decode_base64_image(_png_base64())
    assert frame.shape == (32, 32, 3)


def test_decode_data_url_prefix():
    payload = "data:image/png;base64," + _png_base64()
    frame = emotion.decode_base64_image(payload)
    assert frame.shape == (32, 32, 3)


def test_decode_rejects_garbage():
    with pytest.raises(emotion.ImageDecodeError):
        emotion.decode_base64_image("not-base64!!")


def test_to_face_results_skips_non_detections():
    raw = [{"face_confidence": 0, "region": {}, "emotion": {}}]
    assert emotion._to_face_results(raw) == []


def test_to_face_results_maps_scores():
    raw = [
        {
            "face_confidence": 0.99,
            "region": {"x": 1, "y": 2, "w": 3, "h": 4},
            "dominant_emotion": "happy",
            "emotion": {"happy": 90.0, "sad": 10.0},
        }
    ]
    results = emotion._to_face_results(raw)
    assert len(results) == 1
    assert results[0].dominant == "happy"
    assert results[0].box.w == 3
    assert results[0].scores["happy"] == 90.0
    assert results[0].scores["neutral"] == 0.0  # missing labels default to 0
