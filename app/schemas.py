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
