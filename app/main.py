"""FastAPI application: routes, startup warm-up, static/template wiring."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlmodel import Session
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request

from app.config import EMOTION_LABELS, settings
from app.db import get_session, init_db
from app.models import UploadedTrack
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    ModelsResponse,
    RecommendResponse,
)
from app.services import emotion
from app.services.music import uploads
from app.services.music.recommend import recommend as music_recommend

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the SQLite tables (P3 uploads / later stats) before serving.
    init_db()
    # Warm the model up off the event loop so startup doesn't block (Risk #2).
    await run_in_threadpool(emotion.warmup)
    yield


app = FastAPI(title="FaceUp", version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# Serve user-uploaded audio. The directory is created up front so the mount works
# on a fresh checkout.
_uploads_dir = Path(settings.uploads_dir)
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")


@app.middleware("http")
async def _revalidate_assets(request: Request, call_next):
    # Dev convenience: make browsers revalidate JS/CSS/uploads each load so an edit
    # never shows up as a stale cached file. 304s still happen when unchanged.
    response = await call_next(request)
    if request.url.path.startswith(("/static/", "/uploads/")):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model_ready=emotion.is_ready(),
        detector_webcam=settings.detector_webcam,
        detector_upload=settings.detector_upload,
    )


@app.get("/api/models", response_model=ModelsResponse)
async def models() -> ModelsResponse:
    return ModelsResponse(models=emotion.available_models(), default="deepface")


@app.get("/api/recommend", response_model=RecommendResponse)
async def recommend(
    emotion: str = "neutral", mode: str = "match", limit: int | None = None
) -> RecommendResponse:
    # Audius calls are blocking I/O — keep them off the event loop.
    data = await run_in_threadpool(music_recommend, emotion, mode, limit)
    return RecommendResponse(**data)


@app.get("/api/uploads", response_model=list[UploadedTrack])
async def get_uploads(session: Session = Depends(get_session)) -> list[UploadedTrack]:
    return uploads.list_uploads(session)


@app.post("/api/uploads", response_model=UploadedTrack)
async def add_upload(
    file: UploadFile,
    title: str = Form(""),
    artist: str = Form("You"),
    emotion: str = Form("neutral"),
    session: Session = Depends(get_session),
) -> UploadedTrack:
    if emotion not in EMOTION_LABELS:
        raise HTTPException(422, f"Unknown emotion '{emotion}'.")
    data = await file.read()
    if not data:
        raise HTTPException(422, "Empty file.")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "File exceeds the maximum upload size.")
    try:
        return await run_in_threadpool(
            uploads.save_upload, session,
            data=data, original_name=file.filename or "",
            title=title, artist=artist, emotion=emotion,
        )
    except uploads.UploadError as exc:
        raise HTTPException(415, str(exc)) from exc


@app.delete("/api/uploads/{track_id}")
async def remove_upload(
    track_id: int, session: Session = Depends(get_session)
) -> dict:
    if not uploads.delete_upload(session, track_id):
        raise HTTPException(404, "No such upload.")
    return {"deleted": track_id}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    try:
        frame = await run_in_threadpool(emotion.decode_base64_image, req.image)
    except emotion.ImageDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Inference is CPU-bound and blocking — keep it off the event loop. The chosen
    # engine handles its own face detection (per-mode for DeepFace).
    faces, infer_ms = await run_in_threadpool(
        emotion.analyze_frame, frame, req.model, req.mode
    )
    return AnalyzeResponse(faces=faces, infer_ms=infer_ms)
