# FaceUp

Facial **emotion recognition** web app. Detects faces from a webcam feed or an
uploaded image and classifies the expression into four clear emotions (happy,
sad, angry, neutral) using
[DeepFace](https://github.com/serengil/deepface) on a TensorFlow/Keras backend,
served through a FastAPI web app. DeepFace's 7 raw classes are reduced
server-side (disgust→angry; surprise/fear dropped as unreliable) for a clearer,
more reliable read. We also trained **our own** classifiers — a softmax baseline
and a custom CNN — that drop in behind the same engine interface
([Neural network](#neural-network-our-own-models)).

> Course final project — Python & TensorFlow.

## Stack

| Layer    | Choice                                          |
|----------|-------------------------------------------------|
| Backend  | FastAPI + Uvicorn                               |
| Frontend | HTML + CSS + vanilla JS (ES modules)            |
| ML       | DeepFace (TensorFlow / `tf-keras`)              |
| Our nets | Keras softmax + custom CNN (trained on FER2013) |
| Engines  | Pluggable registry (pick the model at runtime)  |
| Input    | Live webcam + image upload                      |

## Setup (Windows, Python 3.11)

```bash
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> **First run downloads model weights** (the emotion model plus the `ssd` and
> `mtcnn` face detectors, ~tens of MB) into `~/.deepface/`. Do this once
> *before* presenting (Risk #6).

Face detection uses a per-mode backend — `ssd` for the live webcam (fast) and
`mtcnn` for uploads (more accurate). Override with `FACEUP_DETECTOR_WEBCAM` /
`FACEUP_DETECTOR_UPLOAD` if desired.

## Run

```bash
python run.py
# then open http://127.0.0.1:8000
```

- App UI: <http://127.0.0.1:8000>
- Health/warm-up status: <http://127.0.0.1:8000/health>
- Interactive API docs: <http://127.0.0.1:8000/docs>

> Webcam needs a *secure context*. `localhost` qualifies, so the local demo
> works with no HTTPS setup (Risk #5).

## Tests

```bash
pytest
```

## Neural network (our own models)

Beyond DeepFace, we trained our own emotion classifiers (course Topics 6–8) and
wired them in behind the same engine interface, so you can switch models from the
UI at runtime. Both take a **48×48 grayscale** face (FER2013), normalized to
`[0,1]`, and output a softmax over the grouped classes.

- **Softmax baseline** (`softmax_regression`) — `Flatten → Dense(softmax)`.
  Multinomial logistic regression; the deliberate floor to compare against.
- **Custom CNN** (`custom_cnn`) — light augmentation (flip/rotate/zoom) → three
  `Conv(32→64→128) → BatchNorm → ReLU → MaxPool` blocks → `Dense(128) →
  Dropout(0.4) → Dense(softmax)`.

Trained two ways over the same model: Keras `.fit` (Adam + categorical
cross-entropy, early stopping) **and** an explicit `tf.GradientTape` loop that
performs the forward/backward/update by hand. Trained weights, training curves,
and confusion matrices live in `ml/artifacts/`. Full pipeline + commands:
[ml/README.md](ml/README.md).

```bash
python -m ml.train --model cnn --epochs 30          # train the CNN (Keras .fit)
python -m ml.train --model cnn --loop gradtape      # same model, GradientTape loop
python -m ml.evaluate --model cnn                    # accuracy + confusion matrix
```

> **Reminder:** DeepFace is the **default** engine — the app runs fully without
> any training. Our Keras models appear in the model picker (`GET /api/models`)
> only when their weights exist in `ml/artifacts/` (the trained `cnn.keras` and
> `softmax.keras` are committed). **Retraining** needs the FER2013 dataset, which
> is git-ignored — see [ml/README.md](ml/README.md) to fetch it.

## Project layout

```
app/
  main.py            FastAPI app, routes, startup warm-up
  config.py          all tunables (detector backend, fps, limits, emotion groups)
  schemas.py         Pydantic request/response contracts
  services/emotion.py DeepFace wrapper: decode -> detect -> classify
  services/engines/  pluggable engine registry (DeepFace + our Keras models)
  services/music/    recommender, Audius client, uploads, likes
  services/stats.py  focus/mood logging (SQLite)
  static/, templates/ frontend (ES-module JS)
ml/                  our training pipeline (data, preprocessing, models, train, evaluate)
  artifacts/         trained weights, curves, confusion matrices
tests/               unit tests
docs/DESIGN.md       architecture & decisions (source of truth)
run.py               entry point
```

See [docs/DESIGN.md](docs/DESIGN.md) for architecture, the API contract, and
the risk register.
