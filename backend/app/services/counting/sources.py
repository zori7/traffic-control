"""ffmpeg input flags shared by the worker and the still-frame grabber.

Kept dependency-free so the API can import it without pulling in OpenCV.
"""

from __future__ import annotations


def input_args(source_kind: str) -> list[str]:
    """Low-latency ffmpeg input flags for the given source kind."""
    if source_kind == "rtsp":
        return ["-rtsp_transport", "tcp", "-fflags", "nobuffer", "-flags", "low_delay"]
    return ["-fflags", "nobuffer", "-flags", "low_delay"]
