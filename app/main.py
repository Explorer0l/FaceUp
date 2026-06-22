"""FastAPI application: routes, startup warm-up, static/template wiring."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request

from app.config import settings
from app.schemas import AnalyzeRequest, AnalyzeResponse, HealthResponse
from app.services import emotion

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the model up off the event loop so startup doesn't block (Risk #2).
    await run_in_threadpool(emotion.warmup)
    yield


app = FastAPI(title="FaceUp", version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model_ready=emotion.is_ready(),
        detector_backend=settings.detector_backend,
    )


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    try:
        frame = await run_in_threadpool(emotion.decode_base64_image, req.image)
    except emotion.ImageDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # DeepFace inference is CPU-bound and blocking — keep it off the event loop.
    faces, infer_ms = await run_in_threadpool(emotion.analyze_frame, frame)
    return AnalyzeResponse(faces=faces, infer_ms=infer_ms)
