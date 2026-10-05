"""Unit tests for the lane-polyline entry counter."""

from __future__ import annotations

from app.services.counting.geometry import LaneCounter

WIDTH, HEIGHT = 1000, 500
LANE = [
    {
        "id": 1,
        "name": "Lane 1",
        "points": [{"x": 0.1, "y": 0.5}, {"x": 0.9, "y": 0.5}],
        "classes": ["car", "truck"],
        "color": "#a7e5d3",
    }
]


def detection(cx: float, cy: float, *, track_id: int = 1, class_name: str = "car") -> dict:
    return {
        "track_id": track_id,
        "class_name": class_name,
        "confidence": 0.9,
        "bbox": [cx - 10, cy - 10, cx + 10, cy + 10],
    }


def counter() -> LaneCounter:
    return LaneCounter(LANE, WIDTH, HEIGHT, corridor_px=50.0)


def test_counts_forward_entry_once() -> None:
    lane = counter()
    # Normalized x -> pixel x; y stays at the lane centre (250).
    for x in (100, 180, 260, 400, 900):
        lane.update([detection(x, 250)], ts=0.0)
    snapshot = lane.counts_snapshot()
    assert snapshot["total"] == 1
    assert snapshot["lines"][0]["classes"] == {"car": 1}


def test_ignores_reverse_direction() -> None:
    lane = counter()
    for x in (900, 800, 700, 600, 200):
        lane.update([detection(x, 250)], ts=0.0)
    assert lane.counts_snapshot()["total"] == 0


def test_ignores_track_appearing_mid_lane() -> None:
    lane = counter()
    for x in (400, 500, 600, 700):
        lane.update([detection(x, 250)], ts=0.0)
    assert lane.counts_snapshot()["total"] == 0


def test_ignores_track_outside_corridor() -> None:
    lane = counter()
    for x in (100, 200, 300, 400):
        lane.update([detection(x, 100)], ts=0.0)  # 150px above the lane
    assert lane.counts_snapshot()["total"] == 0


def test_respects_class_filter() -> None:
    lane = counter()
    for x in (100, 200, 300, 400):
        lane.update([detection(x, 250, class_name="bus")], ts=0.0)
    assert lane.counts_snapshot()["total"] == 0


def test_deduplicates_repeated_crossings() -> None:
    lane = counter()
    for x in (100, 200, 300, 900):  # counted near the entry
        lane.update([detection(x, 250)], ts=0.0)
    for x in (100, 200, 300, 900):  # re-enters; must not count again
        lane.update([detection(x, 250)], ts=0.0)
    assert lane.counts_snapshot()["total"] == 1


def test_separate_tracks_count_separately() -> None:
    lane = counter()
    for x in (100, 200, 300):
        lane.update([detection(x, 250, track_id=1)], ts=0.0)
    for x in (120, 240, 360):
        lane.update([detection(x, 250, track_id=2)], ts=0.0)
    assert lane.counts_snapshot()["total"] == 2
