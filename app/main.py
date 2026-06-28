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
    FocusLogRequest,
    FocusStatsResponse,
    HealthResponse,
    ModelsResponse,
    RecommendResponse,
    Track,
)
from app.services import emotion, stats
from app.services.music import likes, uploads
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
    cover: UploadFile | None = None,
    session: Session = Depends(get_session),
) -> UploadedTrack:
    if emotion not in EMOTION_LABELS:
        raise HTTPException(422, f"Unknown emotion '{emotion}'.")
    data = await file.read()
    if not data:
        raise HTTPException(422, "Empty file.")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "File exceeds the maximum upload size.")

    cover_data: bytes | None = None
    cover_name = ""
    if cover is not None and cover.filename:
        cover_data = await cover.read()
        if len(cover_data) > settings.max_cover_bytes:
            raise HTTPException(413, "Cover image exceeds the maximum size.")
        cover_name = cover.filename

    try:
        return await run_in_threadpool(
            uploads.save_upload, session,
            data=data, original_name=file.filename or "",
            title=title, artist=artist, emotion=emotion,
            cover_data=cover_data, cover_name=cover_name,
        )
    except uploads.UploadError as exc:
        raise HTTPException(415, str(exc)) from exc


@app.delete("/api/uploads/{track_id}")
async def remove_upload(
    track_id: int, session: Session = Depends(get_session)
) -> dict:
    if not uploads.delete_upload(session, track_id):
        raise HTTPException(404, "No such upload.")
    # Keep favorites consistent: an upload that's gone can't stay liked.
    likes.unlike_track(session, f"upload:{track_id}")
    return {"deleted": track_id}


@app.get("/api/likes", response_model=list[Track])
async def get_likes(session: Session = Depends(get_session)) -> list[Track]:
    return [Track(**likes.to_track(row)) for row in likes.list_likes(session)]


@app.get("/api/likes/ids", response_model=list[str])
async def get_liked_ids(session: Session = Depends(get_session)) -> list[str]:
    return likes.liked_ids(session)


@app.post("/api/likes", response_model=Track)
async def add_like(track: Track, session: Session = Depends(get_session)) -> Track:
    try:
        row = likes.like_track(session, track.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return Track(**likes.to_track(row))


@app.delete("/api/likes/{track_id:path}")
async def remove_like(
    track_id: str, session: Session = Depends(get_session)
) -> dict:
    if not likes.unlike_track(session, track_id):
        raise HTTPException(404, "That track isn't liked.")
    return {"unliked": track_id}


@app.get("/api/stats/focus", response_model=FocusStatsResponse)
async def get_focus_stats(session: Session = Depends(get_session)) -> FocusStatsResponse:
    return FocusStatsResponse(**stats.focus_summary(session))


@app.post("/api/stats/focus", response_model=FocusStatsResponse)
async def log_focus_stats(
    body: FocusLogRequest, session: Session = Depends(get_session)
) -> FocusStatsResponse:
    stats.log_focus_session(session, body.seconds)
    return FocusStatsResponse(**stats.focus_summary(session))


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
