"""FaceUp ML pipeline — train our own emotion classifiers (Phase 3).

Standalone from the web app: this package loads FER2013, trains models
(softmax regression, a custom CNN, transfer learning), and saves weights into
``ml/artifacts/`` which the app's inference engines then load.
"""
