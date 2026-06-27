"""Pydantic request/response contracts for the API.

Keeping these in one place gives us a single source of truth for the JSON
shape the frontend and backend agree on.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Incoming analyse request.

    ``image`` is a base64-encoded JPEG/PNG, optionally prefixed with a data URL
    header (``data:image/jpeg;base64,...``). The frontend sends the same shape
    for both webcam frames and uploaded files; ``mode`` selects the detector
    backend tuned for that input (fast for webcam, accurate for upload).
    """

    image: str = Field(..., description="Base64 image data (data URL or raw base64).")
    mode: Literal["upload", "webcam"] = Field(
        default="upload", description="Input mode; selects the detector backend."
    )
    model: str = Field(
        default="deepface", description="Which emotion engine to use (see /api/models)."
    )


class Box(BaseModel):
    x: int
    y: int
    w: int
    h: int


class FaceResult(BaseModel):
    box: Box
    dominant: str = Field(..., description="Highest-scoring emotion label.")
    scores: dict[str, float] = Field(
        ..., description="Per-emotion confidence in percent (0-100)."
    )


class AnalyzeResponse(BaseModel):
    faces: list[FaceResult] = Field(default_factory=list)
    infer_ms: int = Field(..., description="Server-side inference time, milliseconds.")


class HealthResponse(BaseModel):
    status: str
    model_ready: bool
    detector_webcam: str
    detector_upload: str


class ModelInfo(BaseModel):
    id: str
    label: str


class ModelsResponse(BaseModel):
    models: list[ModelInfo]
    default: str


class Track(BaseModel):
    """One playable track, normalized across sources (Audius / local fallback)."""

    id: str
    title: str
    artist: str
    mood: str = Field("", description="Source mood tag, if any (e.g. 'Upbeat').")
    genre: str = ""
    duration: int = Field(0, description="Length in seconds (0 if unknown).")
    stream_url: str = Field(..., description="URL an <audio> element can play.")
    cover_url: str = ""
    source: Literal["audius", "local"] = "audius"


class RecommendResponse(BaseModel):
    emotion: str = Field(..., description="The detected/selected emotion.")
    mode: Literal["match", "lift"] = Field(..., description="Mirror vs regulate mood.")
    moods: list[str] = Field(
        default_factory=list, description="Audius mood tags this maps to."
    )
    tracks: list[Track] = Field(default_factory=list)
    source: Literal["audius", "local"] = Field(
        "audius", description="Where the tracks came from (local = offline fallback)."
    )
