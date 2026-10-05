"""YOLO11 + ByteTrack detection, loaded lazily so the API can boot without it."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

# Bundled tracker config, tuned for low-confidence detections (see the file).
_TRACKER_CONFIG = str(Path(__file__).with_name("bytetrack.yaml"))


class Detector:
    """One detector per worker, so ByteTrack keeps its own identity state.

    Only the classes of interest are detected and tracked; everything else is
    filtered out before it reaches the tracker, so unrelated objects (trains,
    traffic lights, ...) are neither counted nor drawn.
    """

    def __init__(self, classes: set[str] | None = None) -> None:
        from ultralytics import YOLO  # imported lazily (heavy)

        logger.info("Loading detection model %s on %s", settings.yolo_model, settings.yolo_device)
        self.model = YOLO(settings.yolo_model)
        self.class_ids = self._resolve_classes(classes)

    def _resolve_classes(self, classes: set[str] | None) -> list[int] | None:
        """Map class names to the model's class ids (``None`` means all)."""
        if classes is None:
            return None
        names = {str(name): class_id for class_id, name in self.model.names.items()}
        unknown = classes - names.keys()
        if unknown:
            logger.warning("Ignoring unknown detection classes: %s", sorted(unknown))
        return sorted(names[name] for name in classes if name in names)

    def track(self, frame: np.ndarray) -> list[dict]:
        """Run detection + tracking and return per-box detections."""
        # No classes of interest means nothing to detect or annotate.
        if self.class_ids is not None and not self.class_ids:
            return []
        results = self.model.track(
            frame,
            persist=True,
            tracker=_TRACKER_CONFIG,
            imgsz=settings.yolo_imgsz,
            conf=settings.yolo_conf,
            iou=settings.yolo_iou,
            device=settings.yolo_device,
            classes=self.class_ids,
            verbose=False,
        )
        results = list(results)
        if not results:
            return []

        result = results[0]
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return []

        names = result.names
        ids = boxes.id
        detections: list[dict] = []
        for index in range(len(boxes)):
            class_id = int(boxes.cls[index])
            detections.append(
                {
                    "track_id": int(ids[index]) if ids is not None else None,
                    "class_name": str(names.get(class_id, class_id)),
                    "confidence": float(boxes.conf[index]),
                    "bbox": [float(value) for value in boxes.xyxy[index].tolist()],
                }
            )
        return detections
