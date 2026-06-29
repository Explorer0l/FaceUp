# FaceUp — Design & Architecture

> Living source of truth for the project. Update this when a design decision
> changes.

## 1. Goal

A web app for **facial emotion recognition**. A user shows their face (live
webcam) or uploads a photo; the app detects the face(s) and classifies the
expression into one of four clear emotions: `happy, sad, angry, neutral`.

DeepFace computes 7 raw classes; we reduce them server-side for a clearer,
more reliable reading: `angry ← angry + disgust` (probabilities summed), while
`surprise` and `fear` — DeepFace's least reliable classes — are dropped and the
dominant is chosen among the four. `happy / sad / neutral` pass through
unchanged. See `app/config.py::EMOTION_GROUPS`.

> **Note (final):** the app *surfaces* four emotions, but our own trained
> networks (Phase 3) still classify the **five** FER2013-grouped classes
> (`…, surprised`); the Keras engine simply drops `surprised` to match the app.
> See §6 Phase 3.

Deliverables: the demo web app, a written report, and presentation slides.

## 2. Decisions

| Dimension   | Decision                  | Why |
|-------------|---------------------------|-----|
| ML approach | Pretrained via **DeepFace** | Focus effort on the application; DeepFace bundles detection + emotion on a TF/Keras backend. |
| Own models  | **Softmax + custom CNN** (Phase 3) | Course depth (Topics 6–8): we train our own classifiers on FER2013 and plug them in behind the same engine interface. |
| Engines     | **Pluggable registry**    | DeepFace and our Keras models sit behind one `predict()` contract; user picks the model at runtime (`/api/models`). |
| Backend     | **FastAPI + Uvicorn**     | Async routes, free Swagger docs (`/docs`), Pydantic schemas. |
| Frontend    | **HTML/CSS/JS**           | Full control over the demo UI. |
| Input       | **Webcam + upload**       | Most compelling demo; both unified into one code path. |
| Python      | **3.11**                  | Best TensorFlow / DeepFace compatibility. |

## 3. Architecture

```
Browser (client)
  index.html + app.js + style.css
   - Webcam: getUserMedia -> <video> -> frame every ~200ms
   - Upload: file input -> image
   - Both -> JPEG -> base64 -> POST /api/analyze
   - Draw boxes + labels on overlay <canvas>
        |  JSON { image: "data:image/jpeg;base64,..." }
        v
FastAPI (server)
  main.py        routes, serves templates/static, startup warm-up
  schemas.py     Pydantic request/response contracts
  services/emotion.py  decode -> DeepFace.analyze(emotion) -> normalise
  config.py      detector backend, limits, host/port
   - Model warm-up at startup (Risk #2)
   - Inference in a threadpool (Risk #7)
```

**Unified path:** webcam frames and uploaded files are both converted to
base64 JPEG in the browser and POSTed to a single `/api/analyze` endpoint —
one backend code path, fewer bugs.

## 4. API contract

| Method | Route          | Purpose                                  |
|--------|----------------|------------------------------------------|
| GET    | `/`            | Serve the app (HTML)                     |
| GET    | `/health`      | Liveness + model-warm-up status          |
| GET    | `/api/models`  | List available engines (DeepFace + trained Keras models) |
| POST   | `/api/analyze` | `{image: "<base64>", model?: "<name>"}` -> faces |
| GET    | `/docs`        | Auto Swagger UI                          |

Phase 2 (music/focus/stats) adds: `GET /api/recommend`, `GET|POST|DELETE
/api/uploads`, `GET|POST|DELETE /api/likes`, `GET|POST /api/stats/focus`.

`/api/analyze` response (`AnalyzeResponse`):

```json
{
  "faces": [
    { "box": {"x":34,"y":50,"w":120,"h":120},
      "dominant": "happy",
      "scores": {"happy":92.1,"sad":2.1,"angry":0.1,"neutral":4.2} }
  ],
  "infer_ms": 142
}
```

Empty `faces` = no face detected (handled gracefully, not an error). The
optional `model` field selects an engine (default DeepFace); trained Keras
models only appear in `/api/models` once their weights exist in `ml/artifacts/`.

## 5. Risk register

| #  | Risk                                   | Mitigation |
|----|----------------------------------------|------------|
| 1  | DeepFace breaks on TF 2.16+ (Keras 3)  | Pin `tf-keras`; it provides the legacy Keras DeepFace needs. |
| 2  | Slow first inference (model load)      | `warmup()` at startup with a dummy image; `/health` reports `model_ready`. |
| 3  | CPU too slow for smooth real-time      | Throttle ~5 fps, downscale frames, single in-flight request (drop frames). |
| 4  | No face / multiple faces               | `enforce_detection=False`; skip non-detections; UI shows "no face". |
| 5  | Webcam needs secure context            | `localhost` is secure -> local demo needs no HTTPS. |
| 6  | Model download right before demo       | Pre-download once (documented in README). |
| 7  | Blocking inference stalls server       | Run DeepFace via `run_in_threadpool`. |

## 6. Milestones

- [x] **M1** Env + FastAPI skeleton + `/health`
- [x] **M2** `emotion.py` service + warm-up + unit tests (verified: warmup loads model, `/health` reports ready)
- [x] **M3** Upload path end-to-end (UI + drag/drop + box overlay + confidence bars; HTTP path verified, 422 on bad input)
- [x] **M4** Webcam real-time path + canvas overlay (decoupled display/inference loops, single in-flight guard, camera lifecycle)
- [x] **M5** UI polish — webcam UX (mirror/selfie view with flipped boxes, live FPS/latency + face-found HUD). Reduced to a 5-emotion grouped set for clarity. (An earlier session-timeline was added then removed per feedback — a single clear current reading is preferred.)
- [ ] **M6** Report + slides + screenshots
- [x] **M7** Hardening, error states, README (graceful no-face/422 handling,
  threadpool inference, warm-up; README finalized)

### Phase 2 — emotion-driven music + focus (pivot 2026-06-24)

The product expands: the emotion engine becomes the *input* to a music
recommender. Stack additions — Jamendo API + user uploads, Match/Lift toggle,
SQLite (SQLModel) for stats, Yandex-Music-style UI whose hero gradient is tinted
by the current emotion.

- [x] **P1** New UI shell — sidebar nav, vibe hero (emotion-tinted), persistent
  player, ES-module frontend (`main/router/moodScan/vibe/focus/player/bus/api/
  emotions`). Mood scan migrated intact; Vibe tiles + Match/Lift + Focus timer
  working; recos are samples (P2). Stats/Collection/Add/Search are stubs.
- [x] **P2** Music backend — recommendation service (emotion → mood tags,
  Match/Lift) over an **Audius** client with a built-in fallback pool; persistent
  player plays real tracks. (`app/services/music/`.)
- [x] **P3** User uploads — upload audio, tag by mood, store in SQLite; joins the
  recommendation pool. (`uploads.py`, `POST/GET/DELETE /api/uploads`.)
- [x] **P4** Mood→vibe flow — "scan my face" → recommend, plus manual Vibe tiles.
- [x] **P5** Focus station music + auto-pause options. (`focus.js`, `player.js`.)
- [x] **P6** Stats — SQLite session/focus logging + charts. (`stats.py`,
  `/api/stats/focus`, `stats.js`.)
- [ ] **P7** Polish + report/slides — UI polished; report/slides outstanding.

### Phase 3 — train our own neural networks (course depth: Topics 6–8)

A "model zoo" behind one `EmotionEngine` interface, letting users pick the
network. Demonstrates NumPy/tensors (T6), preprocessing + softmax regression
(T7), and CNN + Keras + `tf.GradientTape` (T8). FER2013 remapped to our 5 classes.

- [x] **ML-1** Training pipeline scaffold (`ml/`): data loader (CSV or image
  folders), preprocessing, softmax + CNN models, trainer (Keras `.fit` **and**
  GradientTape loop), evaluator (report + confusion matrix). Verified on
  synthetic data. CPU-only here (TF 2.18 native Windows has no GPU).
- [x] **ML-2** Trained the softmax baseline & custom CNN on FER2013 (remapped to
  5 classes). Trained weights, training curves, and confusion matrices are in
  `ml/artifacts/` (`cnn.keras`, `softmax.keras`, `*_curves.png`, `*_confusion.png`).
- [ ] **ML-3** Transfer-learning model (MobileNetV2) — **scaffolded** (engine
  input `96×3` + `transfer` slot in the registry) but not yet trained; drop a
  `transfer.keras` into `ml/artifacts/` to enable it.
- [x] **ML-4** Inference engine registry (`app/services/engines/`): DeepFace +
  Keras engines behind one `predict()` contract; `GET /api/models`, `model` field
  on `/api/analyze`, frontend model picker. Trained engines auto-appear once
  weights exist in `ml/artifacts/`. Verified incl. KerasEngine load + fallback.

#### Networks we trained (`ml/models.py`)

Both take a `48×48×1` grayscale face (FER2013), normalized to `[0,1]`, and output
a 5-way softmax (`happy, sad, angry, surprised, neutral`).

- **`softmax_regression`** (Topic 7 baseline) — `Flatten → Dense(5, softmax)`.
  Multinomial logistic regression: the deliberate "floor" to measure the CNN
  against.
- **`custom_cnn`** (Topic 8 centerpiece) — light augmentation
  (`RandomFlip/Rotation/Zoom`) → three `Conv(32→64→128) → BatchNorm → ReLU →
  MaxPool` blocks → `Flatten → Dense(128, ReLU) → Dropout(0.4) → Dense(5,
  softmax)`.

Trainer (`ml/train.py`) offers two paths over the **same** model: Keras `.fit`
(Adam, categorical cross-entropy, EarlyStopping + ReduceLROnPlateau) and an
explicit **`tf.GradientTape`** loop that does the forward/backward/update by hand
to show what `.fit` does under the hood. Course topics map: T6 (NumPy/tensors,
dtypes) in `preprocessing.py`/`data.py`, T7 (normalize/encode/split/softmax) in
`preprocessing.py`/`build_softmax`, T8 (CNN/Keras/GradientTape) in
`build_cnn`/`train.py`.

## 7. Open questions / future

- Detector backend is chosen **per mode**: `ssd` for webcam (~34 ms/frame,
  DNN-based, real-time) and `mtcnn` for upload (~158 ms, more accurate). The
  request carries a `mode` field; both backends are warmed at startup.
  `retinaface` is the most accurate but ~3.7 s/frame on CPU — too slow to use.
  Benchmarked 2026-06-24 at 640x480.
- Multi-face handling is supported by the schema (a list); UI currently
  designed around the largest/first face.
- Webcam now defaults to a mirrored (selfie) view; box coordinates are flipped
  to stay aligned. Toggle in the Webcam tab.
- **Temporal smoothing (webcam):** raw per-frame guesses flicker and read as
  inaccurate. The client buffers the last ~1.5 s of score vectors, averages
  them, shows "⏳ analyzing…" for the first ~0.7 s, then announces the smoothed
  dominant — switching labels only when a challenger leads the incumbent by
  ≥6 % (hysteresis). Tunables: `SMOOTH_WINDOW_MS`, `SMOOTH_MIN_MS`,
  `SWITCH_MARGIN` in `app.js`. Upload (single image) is unaffected.
- Possible follow-up if a class is systematically over-predicted (e.g. neutral
  faces read as "surprised" because DeepFace leaks "fear"): revisit the
  `EMOTION_GROUPS` mapping (e.g. map fear elsewhere, or group by max not sum).
