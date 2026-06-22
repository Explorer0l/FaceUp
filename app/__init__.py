"""FaceUp — facial emotion recognition web app."""

import os

# Risk #1: DeepFace targets tf.keras. With TensorFlow 2.16+ the default Keras is
# v3, which DeepFace doesn't fully support. Forcing legacy Keras (the installed
# `tf-keras` package) MUST happen before TensorFlow is imported anywhere, so we
# set it here at the package root — the earliest import in the app.
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
# Quieten TensorFlow's C++ startup logging (0=all ... 3=errors only).
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

__version__ = "0.1.0"
