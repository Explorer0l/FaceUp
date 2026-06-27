"""Keras engine — runs our own trained models (softmax / CNN / transfer).

Loads ``ml/artifacts/<name>.keras`` if present (so it's only "available" once
trained), detects faces with an OpenCV Haar cascade, then classifies each crop
with the model. The model's 5 outputs map 1:1 to our class order.
"""

from __future__ import annotations

import time

import cv2
import numpy as np

from ml import config as mlcfg

from .base import EmotionEngine, make_face_result

# (input size, channels) per model — must match how each was trained.
_INPUT = {"softmax": (48, 1), "cnn": (48, 1), "transfer": (96, 3)}


class KerasEngine(EmotionEngine):
    def __init__(self, name: str, label: str):
        self.name = name
        self.label = label
        self.size, self.channels = _INPUT.get(name, (48, 1))
        self.model = None

        weights = mlcfg.ARTIFACTS / f"{name}.keras"
        if weights.is_file():
            try:
                import tensorflow as tf  # only when a model actually exists
                self.model = tf.keras.models.load_model(weights)
            except Exception:  # noqa: BLE001 — a bad/incompatible file shouldn't crash startup
                self.model = None

        self._cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    @property
    def available(self) -> bool:
        return self.model is not None

    def _preprocess(self, frame: np.ndarray, gray: np.ndarray, box) -> np.ndarray:
        x, y, w, h = box
        if self.channels == 1:
            roi = cv2.resize(gray[y:y + h, x:x + w], (self.size, self.size))
            arr = roi.astype(np.float32) / 255.0
            return arr.reshape(1, self.size, self.size, 1)
        roi = cv2.cvtColor(frame[y:y + h, x:x + w], cv2.COLOR_BGR2RGB)
        roi = cv2.resize(roi, (self.size, self.size)).astype(np.float32) / 255.0
        return roi.reshape(1, self.size, self.size, 3)

    def predict(self, frame: np.ndarray, mode: str):
        if self.model is None:
            return [], 0
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self._cascade.detectMultiScale(gray, 1.1, 5, minSize=(48, 48))

        start = time.perf_counter()
        results = []
        for (x, y, w, h) in faces:
            probs = self.model.predict(
                self._preprocess(frame, gray, (x, y, w, h)), verbose=0
            )[0]
            scores = {
                mlcfg.FIVE_CLASSES[i]: round(float(probs[i]) * 100, 2)
                for i in range(len(mlcfg.FIVE_CLASSES))
            }
            fr = make_face_result(x, y, w, h, scores)
            if fr:
                results.append(fr)
        infer_ms = int((time.perf_counter() - start) * 1000)
        return results, infer_ms
