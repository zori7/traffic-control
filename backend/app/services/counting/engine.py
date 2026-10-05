"""Per-stream counting worker: ffmpeg decode -> YOLO/ByteTrack -> annotate -> HLS.

The worker runs in a dedicated thread because Ultralytics, OpenCV, and ffmpeg
are all blocking. The async manager observes it through thread-safe accessors
and drains counted entries for persistence.
"""

from __future__ import annotations

import contextlib
import logging
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from app.core.config import settings
from app.services.counting.annotate import annotate
from app.services.counting.detector import Detector
from app.services.counting.geometry import Entry, LaneCounter
from app.services.counting.sources import input_args as _input_args

logger = logging.getLogger(__name__)

_READ_CHUNK = 1 << 20


@dataclass
class WorkerConfig:
    stream_id: int
    source_url: str
    source_kind: str
    lines: list[dict] = field(default_factory=list)
    roi: dict | None = None


class WorkerError(RuntimeError):
    """Raised when the worker cannot start or loses its source."""


def _probe(url: str, source_kind: str) -> tuple[int, int]:
    """Ask ffprobe for the source resolution, falling back to 1280x720."""
    command = ["ffprobe", "-v", "error", "-select_streams", "v:0"]
    command += _input_args(source_kind)
    command += ["-show_entries", "stream=width,height", "-of", "json", url]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=20, check=False)
        import json

        payload = json.loads(result.stdout or "{}")
        stream = (payload.get("streams") or [{}])[0]
        width, height = int(stream.get("width", 0)), int(stream.get("height", 0))
        if width > 0 and height > 0:
            return width, height
    except (subprocess.SubprocessError, ValueError, IndexError):
        logger.warning("ffprobe failed for stream, defaulting to 1280x720")
    return 1280, 720


def _output_size(width: int, height: int) -> tuple[int, int]:
    scale = min(1.0, settings.decode_max_width / float(width))
    out_width = max(int(width * scale) // 2 * 2, 2)
    out_height = max(int(height * scale) // 2 * 2, 2)
    return out_width, out_height


_encoder_cache: set[str] | None = None


def _available_encoders() -> set[str]:
    global _encoder_cache
    if _encoder_cache is None:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            check=False,
        )
        names: set[str] = set()
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0][:1] in {"V", "A", "S"}:
                names.add(parts[1])
        _encoder_cache = names
    return _encoder_cache


def _resolve_codec(preferred: str) -> str:
    """Pick the configured encoder, falling back to whatever ffmpeg offers."""
    encoders = _available_encoders()
    for candidate in (preferred, "libx264", "libopenh264", "mpeg4"):
        if candidate in encoders:
            return candidate
    return "mpeg4"


def _codec_args(codec: str, gop: int) -> list[str]:
    args = ["-c:v", codec, "-pix_fmt", "yuv420p", "-g", str(gop), "-keyint_min", str(gop)]
    if codec == "libx264":
        args += ["-preset", "veryfast", "-tune", "zerolatency", "-sc_threshold", "0"]
    elif codec == "libopenh264":
        args += ["-b:v", "2500k"]
    return args


class StreamWorker:
    """Owns the decode/infer/encode pipeline for a single stream."""

    def __init__(self, config: WorkerConfig, media_root: Path) -> None:
        self.config = config
        self.session_id: int | None = None
        self.state = "starting"
        self.width = 0
        self.height = 0
        self.fps = 0.0
        self.frames = 0
        self.drop_count = 0
        self.latency_ms = 0.0
        self.started_at = time.time()
        self.last_error: str | None = None

        self.hls_dir = media_root / str(config.stream_id) / "hls"
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._events: list[Entry] = []
        self._snapshot: bytes | None = None
        self._counter: LaneCounter | None = None
        self._detector: Detector | None = None
        self._decode: subprocess.Popen | None = None
        self._encode: subprocess.Popen | None = None

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run, name=f"stream-worker-{self.config.stream_id}", daemon=True
        )
        self._thread.start()

    def request_stop(self) -> None:
        self._stop.set()
        if self.state not in {"stopping", "stopped", "error"}:
            self.state = "stopping"

    def join(self, timeout: float | None = 10.0) -> None:
        if self._thread is not None:
            self._thread.join(timeout=timeout)

    # -- thread-safe accessors --------------------------------------------

    def status(self) -> dict:
        with self._lock:
            return {
                "stream_id": self.config.stream_id,
                "session_id": self.session_id,
                "state": self.state,
                "width": self.width,
                "height": self.height,
                "fps": round(self.fps, 1),
                "frames": self.frames,
                "drop_count": self.drop_count,
                "latency_ms": round(self.latency_ms, 1),
                "started_at": self.started_at,
                "uptime_s": round(time.time() - self.started_at, 1),
                "last_error": self.last_error,
                "hls_ready": self.is_hls_ready(),
            }

    def counts(self) -> dict:
        if self._counter is None:
            return {"lines": [], "total": 0}
        return self._counter.counts_snapshot()

    def drain_events(self) -> list[Entry]:
        with self._lock:
            events, self._events = self._events, []
            return events

    def snapshot_bytes(self) -> bytes | None:
        with self._lock:
            return self._snapshot

    def hls_playlist(self) -> Path:
        return self.hls_dir / "index.m3u8"

    def is_hls_ready(self) -> bool:
        return self.hls_playlist().exists()

    def _line_classes(self) -> set[str]:
        """Union of the classes selected across this stream's lines.

        Only these are detected, tracked, counted, and annotated; everything
        else the model could find is ignored.
        """
        classes: set[str] = set()
        for line in self.config.lines:
            classes.update(line.get("classes") or [])
        return classes

    # -- pipeline ----------------------------------------------------------

    def _run(self) -> None:
        try:
            self._prepare()
            with self._lock:
                self.state = "running"
            self._loop()
        except Exception as exc:  # noqa: BLE001 - surface any failure to status
            logger.exception("Worker for stream %s failed", self.config.stream_id)
            with self._lock:
                self.last_error = str(exc)[:1000]
                self.state = "error"
        finally:
            self._cleanup()
            with self._lock:
                if self.state != "error":
                    self.state = "stopped"

    def _prepare(self) -> None:
        source_width, source_height = _probe(self.config.source_url, self.config.source_kind)
        self.width, self.height = _output_size(source_width, source_height)

        corridor = max(10.0, settings.corridor_fraction * self.width)
        self._counter = LaneCounter(self.config.lines, self.width, self.height, corridor)

        roi = self.config.roi
        self._roi_px = (
            (
                int(roi["x"] * self.width),
                int(roi["y"] * self.height),
                int(roi["width"] * self.width),
                int(roi["height"] * self.height),
            )
            if roi
            else None
        )

        self._detector = Detector(self._line_classes())

        if self.hls_dir.exists():
            shutil.rmtree(self.hls_dir, ignore_errors=True)
        self.hls_dir.mkdir(parents=True, exist_ok=True)

        fps = settings.output_fps
        gop = max(int(fps * settings.hls_segment_seconds), 1)
        codec = _resolve_codec(settings.video_codec)

        decode_command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin"]
        decode_command += _input_args(self.config.source_kind)
        decode_command += [
            "-i",
            self.config.source_url,
            "-an",
            "-vf",
            f"fps={fps},scale={self.width}:{self.height}",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-",
        ]
        encode_command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{self.width}x{self.height}",
            "-r",
            str(fps),
            "-i",
            "-",
            "-an",
            *_codec_args(codec, gop),
            "-f",
            "hls",
            "-hls_time",
            str(settings.hls_segment_seconds),
            "-hls_list_size",
            str(settings.hls_list_size),
            "-hls_flags",
            "delete_segments+append_list+omit_endlist",
            "-hls_segment_filename",
            str(self.hls_dir / "seg_%05d.ts"),
            str(self.hls_playlist()),
        ]

        self._decode = subprocess.Popen(
            decode_command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
        )
        self._encode = subprocess.Popen(
            encode_command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
        )

    def _loop(self) -> None:
        assert self._decode is not None and self._decode.stdout is not None
        assert self._encode is not None and self._encode.stdin is not None
        assert self._counter is not None and self._detector is not None

        frame_bytes = self.width * self.height * 3
        reader = self._decode.stdout
        writer = self._encode.stdin

        window_start = time.perf_counter()
        window_frames = 0
        snapshot_at = 0.0

        while not self._stop.is_set():
            raw = self._read_exact(reader, frame_bytes)
            if raw is None:
                if self._stop.is_set():
                    break
                raise WorkerError("The source ended or is unavailable")

            frame = np.frombuffer(raw, dtype=np.uint8).reshape((self.height, self.width, 3))

            started = time.perf_counter()
            detections = self._detector.track(frame)
            entries = self._counter.update(detections, time.time())
            active = {det["track_id"] for det in detections if det.get("track_id") is not None}
            self._counter.prune(active)
            annotated = annotate(frame, detections, self._counter, self._roi_px)

            try:
                writer.write(annotated.tobytes())
            except (BrokenPipeError, ValueError) as exc:
                raise WorkerError("The encoder stopped unexpectedly") from exc

            elapsed_ms = (time.perf_counter() - started) * 1000.0
            now = time.perf_counter()
            with self._lock:
                self.frames += 1
                self.latency_ms = self.latency_ms * 0.8 + elapsed_ms * 0.2
                if entries:
                    self._events.extend(entries)
            window_frames += 1

            if now - window_start >= 1.0:
                with self._lock:
                    self.fps = window_frames / (now - window_start)
                window_start, window_frames = now, 0

            if now - snapshot_at >= 1.0:
                ok, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ok:
                    with self._lock:
                        self._snapshot = buffer.tobytes()
                snapshot_at = now

    @staticmethod
    def _read_exact(reader, size: int) -> bytes | None:
        chunks: list[bytes] = []
        remaining = size
        while remaining > 0:
            chunk = reader.read(remaining)
            if not chunk:
                return None
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _cleanup(self) -> None:
        processes = [p for p in (self._encode, self._decode) if p is not None]
        for process in processes:
            with contextlib.suppress(BrokenPipeError, ValueError, OSError):
                if process.stdin is not None:
                    process.stdin.close()
            with contextlib.suppress(OSError):
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=1.5)
            except subprocess.TimeoutExpired:
                with contextlib.suppress(OSError):
                    process.kill()
                with contextlib.suppress(subprocess.TimeoutExpired):
                    process.wait(timeout=2)
