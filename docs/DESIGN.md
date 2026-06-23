# FaceUp — Design & Architecture

> Living source of truth for the project. Update this when a design decision
> changes.

## 1. Goal

A web app for **facial emotion recognition**. A user shows their face (live
webcam) or uploads a photo; the app detects the face(s) and classifies the
expression into one of five clear emotions: `happy, sad, angry, surprised,
neutral`.

DeepFace computes 7 raw classes; we **group** them server-side
(`angry ← angry + disgust`, `surprised ← surprise + fear`) to cut the confusion
between visually-similar expressions and give a clearer, more reliable reading.
See `app/config.py::EMOTION_GROUPS`.

Deliverables: the demo web app, a written report, and presentation slides.

## 2. Decisions

| Dimension   | Decision                  | Why |
|-------------|---------------------------|-----|
| ML approach | Pretrained via **DeepFace** | Focus effort on the application; DeepFace bundles detection + emotion on a TF/Keras backend. |
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
| POST   | `/api/analyze` | `{image: "<base64>"}` -> faces           |
| GET    | `/docs`        | Auto Swagger UI                          |

`/api/analyze` response (`AnalyzeResponse`):

```json
{
  "faces": [
    { "box": {"x":34,"y":50,"w":120,"h":120},
      "dominant": "happy",
      "scores": {"happy":92.1,"sad":2.1,"angry":0.1,
                 "surprised":1.5,"neutral":4.2} }
  ],
  "infer_ms": 142
}
```

Empty `faces` = no face detected (handled gracefully, not an error).

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
- [ ] **M7** Hardening, error states, README

## 7. Open questions / future

- Detector backend default is `opencv` (fast). Switch to `mtcnn`/`retinaface`
  for higher-accuracy upload analysis if time allows.
- Multi-face handling is supported by the schema (a list); UI currently
  designed around the largest/first face.
- Webcam now defaults to a mirrored (selfie) view; box coordinates are flipped
  to stay aligned. Toggle in the Webcam tab.
