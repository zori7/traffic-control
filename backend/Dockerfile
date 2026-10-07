# syntax=docker/dockerfile:1

FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

# ffmpeg decodes the source and re-encodes the annotated HLS; curl backs the
# container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# uv applies overrides.txt, which drops the GUI OpenCV build Ultralytics pulls
# in (it needs GLib/GTK that slim images lack).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY requirements.txt overrides.txt ./

# PyTorch CPU wheels first (the counting engine runs on CPU), then the app
# dependencies with the OpenCV override applied.
RUN uv pip install --system --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && uv pip install --system -r requirements.txt --overrides overrides.txt

# Bake the detector weights into the image so the first run needs no network.
RUN mkdir -p /app/models \
    && python -c "from ultralytics import YOLO; YOLO('/app/models/yolo11n.pt')"

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 8000

# The entrypoint applies migrations before starting the API + Socket.IO server.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:socket_app", "--host", "0.0.0.0", "--port", "8000"]
