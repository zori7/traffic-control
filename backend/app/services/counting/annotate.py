"""Burned-in overlays: ROI, lane polylines, detections, and counters.

Every size is expressed as a fraction of the frame width, so the overlays keep
the same relative size no matter what resolution the worker runs at.
"""

from __future__ import annotations

import cv2
import numpy as np

from app.services.counting.geometry import LaneCounter

# Pastel palette from the design system, as BGR (OpenCV order).
_CLASS_COLORS: dict[str, tuple[int, int, int]] = {
    "person": (196, 184, 232),
    "bicycle": (232, 200, 168),
    "car": (211, 229, 167),
    "motorcycle": (168, 197, 244),
    "bus": (224, 184, 200),
    "truck": (196, 184, 232),
}
_FALLBACK_COLOR = (200, 200, 200)
_WHITE = (255, 255, 255)
_INK = (9, 10, 12)
_FONT = cv2.FONT_HERSHEY_SIMPLEX


class Overlay:
    """Overlay geometry for one frame, derived from its width.

    Sizes are fractions of the frame width, so annotations scale with the video
    instead of staying a fixed pixel size at every resolution.
    """

    def __init__(self, width: int) -> None:
        self.width = max(int(width), 1)

    def px(self, fraction: float, minimum: int = 1) -> int:
        return max(minimum, round(self.width * fraction))

    def font(self, fraction: float, minimum: float = 0.3) -> float:
        return max(minimum, round(self.width * fraction, 3))

    @property
    def lane(self) -> int:
        """Lane polyline stroke width."""
        return self.px(0.0020)

    @property
    def dot_outer(self) -> int:
        return self.px(0.0054)

    @property
    def dot_inner(self) -> int:
        return self.px(0.0032)

    @property
    def arrow(self) -> int:
        return self.px(0.0076)

    @property
    def roi_line(self) -> int:
        return self.px(0.0010)

    @property
    def box(self) -> int:
        """Detection bounding-box stroke width."""
        return self.px(0.0013)

    @property
    def pad(self) -> int:
        """Padding around label text."""
        return self.px(0.0042)

    @property
    def font_small(self) -> float:
        return self.font(0.00036)

    @property
    def font_body(self) -> float:
        return self.font(0.00041)

    @property
    def font_badge(self) -> float:
        return self.font(0.00047)


def hex_to_bgr(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    try:
        red, green, blue = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    except (ValueError, IndexError):
        return _FALLBACK_COLOR
    return (blue, green, red)


def _ascii(text: str) -> str:
    return text.encode("ascii", "replace").decode("ascii")


def _label(
    frame: np.ndarray,
    text: str,
    origin: tuple[int, int],
    color: tuple[int, int, int],
    font_scale: float,
    ov: Overlay,
    *,
    above: bool = True,
) -> None:
    """Draw text on a filled chip. ``origin`` is the baseline anchor when
    ``above`` is true, otherwise the top-left corner."""
    x, y = origin
    (width, height), baseline = cv2.getTextSize(text, _FONT, font_scale, 1)
    left = max(x, 0)
    top = max(y - height - baseline - ov.pad, 0) if above else max(y, 0)
    cv2.rectangle(
        frame,
        (left, top),
        (left + width + 2 * ov.pad, top + height + baseline + 2 * ov.pad),
        color,
        -1,
    )
    cv2.putText(
        frame,
        text,
        (left + ov.pad, top + ov.pad + height),
        _FONT,
        font_scale,
        _WHITE,
        1,
        cv2.LINE_AA,
    )


def draw_roi(frame: np.ndarray, roi: tuple[int, int, int, int] | None, ov: Overlay) -> None:
    if roi is None:
        return
    x, y, width, height = roi
    cv2.rectangle(frame, (x, y), (x + width, y + height), _WHITE, ov.roi_line, cv2.LINE_AA)
    cv2.putText(
        frame,
        "ROI",
        (x + ov.pad, y + ov.pad + int(ov.font_small * 20)),
        _FONT,
        ov.font_small,
        _WHITE,
        1,
        cv2.LINE_AA,
    )


def _arrow_head(frame, tip, direction, color, size) -> None:
    norm = float(np.linalg.norm(direction))
    if norm == 0:
        return
    unit = direction / norm
    perpendicular = np.array([-unit[1], unit[0]])
    left = tip - unit * size + perpendicular * size * 0.55
    right = tip - unit * size - perpendicular * size * 0.55
    points = np.array([tip, left, right], dtype=np.int32)
    cv2.fillPoly(frame, [points], color, cv2.LINE_AA)


def draw_lines(frame: np.ndarray, counter: LaneCounter, ov: Overlay) -> None:
    for line in counter.lines:
        color = hex_to_bgr(line.color)
        points = line.polyline.points.astype(np.int32)
        cv2.polylines(frame, [points], False, color, ov.lane, cv2.LINE_AA)

        # Entry marker: a filled dot with a white ring at the first point.
        entry = tuple(points[0])
        cv2.circle(frame, entry, ov.dot_outer, _WHITE, -1, cv2.LINE_AA)
        cv2.circle(frame, entry, ov.dot_inner, color, -1, cv2.LINE_AA)

        # Direction arrow along the first segment.
        first, second = points[0], points[1]
        direction = second.astype(np.float64) - first.astype(np.float64)
        length = float(np.linalg.norm(direction))
        if length > 0:
            unit = direction / length
            tip = first + unit * min(length, ov.width * 0.045)
            _arrow_head(frame, tip, unit, color, ov.arrow)

        # Counter badge near the middle of the lane.
        midpoint = line.polyline.point_at(line.polyline.total_length / 2.0)
        label = f"{_ascii(line.name)}  {line.total}"
        _label(
            frame,
            label,
            (int(midpoint[0]) + ov.pad, int(midpoint[1]) - ov.pad),
            color,
            ov.font_body,
            ov,
        )


def draw_detections(frame: np.ndarray, detections: list[dict], ov: Overlay) -> None:
    for det in detections:
        x1, y1, x2, y2 = (int(v) for v in det["bbox"])
        color = _CLASS_COLORS.get(det["class_name"], _FALLBACK_COLOR)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, ov.box, cv2.LINE_AA)
        track = det.get("track_id")
        confidence = det.get("confidence")
        label = _ascii(str(det["class_name"]))
        if track is not None:
            label = f"#{track} {label}"
        if confidence is not None:
            label = f"{label} {confidence:.2f}"
        _label(frame, label, (x1, max(y1 - ov.pad, 0)), color, ov.font_small, ov)


def annotate(
    frame: np.ndarray,
    detections: list[dict],
    counter: LaneCounter,
    roi: tuple[int, int, int, int] | None,
) -> np.ndarray:
    """Return a copy of ``frame`` with every overlay burned in."""
    canvas = frame.copy()
    ov = Overlay(canvas.shape[1])
    draw_roi(canvas, roi, ov)
    draw_lines(canvas, counter, ov)
    draw_detections(canvas, detections, ov)

    total = counter.counts_snapshot()["total"]
    _label(canvas, f"VEHICLES  {total}", (ov.pad, ov.pad), _INK, ov.font_badge, ov, above=False)
    return canvas
