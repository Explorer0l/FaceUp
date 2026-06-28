"""Pluggable emotion-recognition engines.

Each engine implements the same ``predict(frame, mode)`` contract, so the app can
let users choose which neural network powers Mood scan: the pretrained DeepFace
model, or our own trained models (softmax / CNN / transfer) once their weights
exist in ``ml/artifacts/``.
"""
