# FaceUp

Facial **emotion recognition** web app. Detects faces from a webcam feed or an
uploaded image and classifies the expression into five clear emotions (happy,
sad, angry, surprised, neutral) using
[DeepFace](https://github.com/serengil/deepface) on a TensorFlow/Keras backend,
served through a FastAPI web app. DeepFace's 7 raw classes are grouped
server-side (disgust→angry, fear→surprised) for a clearer, more reliable read.

> Course final project — Python & TensorFlow.

## Stack

| Layer    | Choice                              |
|----------|-------------------------------------|
| Backend  | FastAPI + Uvicorn                   |
| Frontend | HTML + CSS + vanilla JS             |
| ML       | DeepFace (TensorFlow / `tf-keras`)  |
| Input    | Live webcam + image upload          |

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

## Project layout

```
app/
  main.py            FastAPI app, routes, startup warm-up
  config.py          all tunables (detector backend, fps, limits)
  schemas.py         Pydantic request/response contracts
  services/emotion.py DeepFace wrapper: decode -> detect -> classify
  static/, templates/ frontend
tests/               unit tests
docs/DESIGN.md       architecture & decisions (source of truth)
run.py               entry point
```

See [docs/DESIGN.md](docs/DESIGN.md) for architecture, the API contract, and
the risk register.
