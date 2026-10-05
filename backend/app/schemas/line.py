"""Counting-line schemas."""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

_DEFAULT_CLASSES = ["car", "truck", "bus", "motorcycle"]
_ALLOWED_CLASSES = {"car", "motorcycle", "bus", "truck", "person", "bicycle"}
_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


class Point(BaseModel):
    """A normalized vertex in the 0..1 coordinate space."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


def _validate_classes(value: list[str]) -> list[str]:
    if not value:
        raise ValueError("Select at least one vehicle class.")
    invalid = sorted(set(value) - _ALLOWED_CLASSES)
    if invalid:
        raise ValueError(f"Unsupported classes: {', '.join(invalid)}.")
    return list(dict.fromkeys(value))


def _validate_color(value: str) -> str:
    if not _COLOR_RE.match(value):
        raise ValueError("Color must be a hex value like #a7e5d3.")
    return value


class LineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    points: list[Point] = Field(min_length=2, max_length=64)
    classes: list[str] = Field(default_factory=lambda: list(_DEFAULT_CLASSES))
    color: str = Field(default="#a7e5d3", max_length=32)
    order_index: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("classes")
    @classmethod
    def _check_classes(cls, value: list[str]) -> list[str]:
        return _validate_classes(value)

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str) -> str:
        return _validate_color(value)


class LineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    points: list[Point] | None = Field(default=None, min_length=2, max_length=64)
    classes: list[str] | None = None
    color: str | None = Field(default=None, max_length=32)
    order_index: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("classes")
    @classmethod
    def _check_classes(cls, value: list[str] | None) -> list[str] | None:
        return _validate_classes(value) if value is not None else value

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str | None) -> str | None:
        return _validate_color(value) if value is not None else value


class LineReorder(BaseModel):
    line_ids: list[int] = Field(min_length=1)


class LineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stream_id: int
    name: str
    points: list[Point]
    classes: list[str]
    color: str
    order_index: int
    created_at: datetime
    updated_at: datetime
