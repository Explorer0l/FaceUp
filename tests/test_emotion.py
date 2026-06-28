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


def test_group_scores_folds_7_into_4():
    from app.services.engines.deepface_engine import group_scores

    scores = group_scores(
        {"angry": 20.0, "disgust": 10.0, "fear": 5.0, "happy": 8.0,
         "sad": 2.0, "surprise": 15.0, "neutral": 40.0}
    )
    # disgust→angry; fear + surprise are dropped (not one of our four emotions).
    assert scores == {"happy": 8.0, "sad": 2.0, "angry": 30.0, "neutral": 40.0}
    assert max(scores, key=scores.get) == "neutral"


def test_make_face_result_builds_and_skips():
    from app.services.engines.base import make_face_result

    fr = make_face_result(1, 2, 3, 4, {"happy": 90.0, "sad": 10.0})
    assert fr is not None and fr.dominant == "happy" and fr.box.w == 3
    assert make_face_result(0, 0, 0, 0, {}) is None  # no scores → no face
