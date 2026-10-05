"""Stream request/response schemas and source-kind detection."""

from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

SourceKind = Literal["hls", "http", "rtsp", "rtmp"]

_ALLOWED_SCHEMES = {"http", "https", "rtsp", "rtmp", "rtmps"}


def detect_source_kind(url: str) -> SourceKind:
    """Infer how ffmpeg should read a source URL."""
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme == "rtsp":
        return "rtsp"
    if scheme in {"rtmp", "rtmps"}:
        return "rtmp"
    if parsed.path.lower().endswith(".m3u8"):
        return "hls"
    return "http"


def _validate_source_url(value: str) -> str:
    value = value.strip()
    parsed = urlparse(value)
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES or not parsed.netloc:
        raise ValueError("Enter a valid stream URL (http, https, rtsp or rtmp).")
    return value


class Roi(BaseModel):
    """Normalized region of interest: top-left corner plus size, all 0..1."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)


class RoiUpdate(BaseModel):
    roi: Roi | None = None


class StreamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    source_url: str = Field(min_length=1, max_length=1024)
    source_kind: SourceKind | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("source_url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        return _validate_source_url(value)


class StreamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    source_url: str | None = Field(default=None, min_length=1, max_length=1024)
    source_kind: SourceKind | None = None
    config: dict[str, Any] | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("source_url")
    @classmethod
    def _check_url(cls, value: str | None) -> str | None:
        return _validate_source_url(value) if value is not None else value


class StreamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    description: str | None
    source_url: str
    source_kind: str
    status: str
    roi: Roi | None
    config: dict[str, Any]
    last_error: str | None
    line_count: int = 0
    created_at: datetime
    updated_at: datetime
