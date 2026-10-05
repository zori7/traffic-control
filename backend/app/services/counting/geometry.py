"""Geometry for projecting tracked centroids onto a lane polyline.

Coordinates arrive normalized (0..1) and are converted to pixels once, so the
counting logic runs in the same space as the detections.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


def to_pixel_points(points: list[dict[str, float]], width: int, height: int) -> np.ndarray:
    """Convert normalized vertices to an ``(N, 2)`` pixel array."""
    return np.array(
        [[float(p["x"]) * width, float(p["y"]) * height] for p in points],
        dtype=np.float64,
    )


@dataclass
class Projection:
    """Where a point sits relative to a polyline."""

    arc: float
    """Distance along the polyline, measured from the first (entry) point."""

    distance: float
    """Perpendicular distance to the nearest segment."""

    tangent: np.ndarray
    """Unit vector of the segment the point projects onto."""


class Polyline:
    """A lane centerline with fast point projection."""

    def __init__(self, points: np.ndarray) -> None:
        if points.shape[0] < 2:
            raise ValueError("A polyline needs at least two points")
        self.points = points
        segments = points[1:] - points[:-1]
        self.segments = segments
        self.segment_lengths = np.linalg.norm(segments, axis=1)
        self.cumulative = np.concatenate([[0.0], np.cumsum(self.segment_lengths)])
        self.total_length = float(self.cumulative[-1])

    def project(self, point: np.ndarray) -> Projection:
        """Closest-point projection of ``point`` onto the polyline."""
        best_distance = np.inf
        best_arc = 0.0
        best_tangent = np.array([1.0, 0.0])

        for index, segment in enumerate(self.segments):
            length_sq = float(segment @ segment)
            if length_sq <= 0:
                continue
            start = self.points[index]
            t = float((point - start) @ segment) / length_sq
            t = min(max(t, 0.0), 1.0)
            projected = start + t * segment
            distance = float(np.linalg.norm(point - projected))
            if distance < best_distance:
                best_distance = distance
                best_arc = float(self.cumulative[index]) + t * float(self.segment_lengths[index])
                norm = np.linalg.norm(segment)
                best_tangent = segment / norm if norm > 0 else np.array([1.0, 0.0])

        return Projection(arc=best_arc, distance=best_distance, tangent=best_tangent)

    def point_at(self, arc: float) -> np.ndarray:
        """The point sitting ``arc`` distance along the polyline."""
        arc = min(max(arc, 0.0), self.total_length)
        index = int(np.searchsorted(self.cumulative, arc, side="right") - 1)
        index = min(max(index, 0), len(self.segments) - 1)
        length = float(self.segment_lengths[index])
        t = 0.0 if length <= 0 else (arc - float(self.cumulative[index])) / length
        return self.points[index] + t * self.segments[index]


@dataclass
class TrackState:
    """Per-track memory for one lane line."""

    last_arc: float | None = None
    counted: bool = False
    misses: int = 0


@dataclass
class LineCounter:
    """Directional entry counter for a single lane line."""

    id: int
    name: str
    classes: set[str]
    color: str
    polyline: Polyline
    gate: float
    corridor: float
    counts: dict[str, int] = field(default_factory=dict)
    tracks: dict[int, TrackState] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return sum(self.counts.values())


@dataclass
class Entry:
    """A counted vehicle entry, emitted for persistence and the ticker."""

    line_id: int
    track_id: int
    class_name: str
    confidence: float | None
    bbox: list[float]
    ts: float


class LaneCounter:
    """Applies every line to a single tracker pass and counts entries.

    A track is counted once, when it first travels forward past the line's
    entry gate while inside the corridor. Tracks that appear mid-lane, move
    against the direction, or sit outside the corridor are ignored.
    """

    def __init__(
        self,
        lines: list[dict],
        width: int,
        height: int,
        corridor_px: float,
        entry_fraction: float = 0.08,
    ) -> None:
        self.width = width
        self.height = height
        self.corridor_px = corridor_px
        self.entry_fraction = entry_fraction
        self.lines: list[LineCounter] = []

        for line in lines:
            pixel_points = to_pixel_points(line["points"], width, height)
            if pixel_points.shape[0] < 2:
                continue
            polyline = Polyline(pixel_points)
            gate = min(
                max(corridor_px, entry_fraction * polyline.total_length),
                0.5 * polyline.total_length,
            )
            self.lines.append(
                LineCounter(
                    id=int(line["id"]),
                    name=str(line["name"]),
                    classes=set(line.get("classes") or []),
                    color=str(line.get("color") or "#a7e5d3"),
                    polyline=polyline,
                    gate=gate,
                    corridor=corridor_px,
                )
            )

    def update(self, detections: list[dict], ts: float) -> list[Entry]:
        """Advance every line with this frame's detections."""
        entries: list[Entry] = []
        for line in self.lines:
            for det in detections:
                if det["class_name"] not in line.classes:
                    continue
                if det.get("track_id") is None:
                    continue
                bbox = det["bbox"]
                centroid = np.array(
                    [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0],
                    dtype=np.float64,
                )
                projection = line.polyline.project(centroid)
                state = line.tracks.get(det["track_id"])
                if state is None:
                    state = TrackState()
                    line.tracks[det["track_id"]] = state

                if projection.distance <= line.corridor:
                    state.misses = 0
                    previous = state.last_arc
                    if (
                        not state.counted
                        and previous is not None
                        and previous < line.gate <= projection.arc
                        and projection.arc >= previous
                    ):
                        state.counted = True
                        line.counts[det["class_name"]] = line.counts.get(det["class_name"], 0) + 1
                        entries.append(
                            Entry(
                                line_id=line.id,
                                track_id=det["track_id"],
                                class_name=det["class_name"],
                                confidence=det.get("confidence"),
                                bbox=list(bbox),
                                ts=ts,
                            )
                        )
                    state.last_arc = projection.arc

        return entries

    def prune(self, active_ids: set[int], max_misses: int = 45) -> None:
        """Forget tracks that have not been seen for a while."""
        for line in self.lines:
            stale: list[int] = []
            for track_id, state in line.tracks.items():
                if track_id in active_ids:
                    continue
                state.misses += 1
                if state.misses > max_misses:
                    stale.append(track_id)
            for track_id in stale:
                del line.tracks[track_id]

    def counts_snapshot(self) -> dict:
        return {
            "lines": [
                {
                    "line_id": line.id,
                    "name": line.name,
                    "color": line.color,
                    "total": line.total,
                    "classes": dict(line.counts),
                }
                for line in self.lines
            ],
            "total": sum(line.total for line in self.lines),
        }
