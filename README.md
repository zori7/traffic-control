# Traffic Control

AI-powered traffic counting from video streams. Draw one or more directional
lane lines over a live feed and Traffic Control counts the vehicles that enter
each line from its entry end — in real time, split by class.

> **Status:** Milestones 1–5 complete — foundation, design system, authentication,
> stream management, the CV counting engine with a Konva overlay editor and
> annotated HLS output, realtime counters/status over Socket.IO, stream analytics
> and CSV/JSON export, Docker deployment, and a backend test suite. See
> [Roadmap](#roadmap).

## Screenshots

The landing page:

![Traffic Control landing page](docs/landing.png)

The overlay editor — draw directional lane lines and set the region of interest:

![Overlay editor](docs/draw.png)

Live worker status and per-line counters on a running stream:

![Live counters and status](docs/counters.png)

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, async SQLAlchemy 2 + asyncpg, Alembic, PostgreSQL, JWT in HttpOnly cookies (Argon2) |
| Counting | Ultralytics YOLO11-n + ByteTrack (CPU), OpenCV, numpy, ffmpeg (HLS decode → annotate → HLS encode) |
| Realtime | python-socketio + Socket.IO — live status, counters and crossings |
| Frontend | React 19 + Vite, TypeScript, Tailwind, shadcn-style UI, Framer Motion, TanStack Query, React Router, hls.js, react-konva, socket.io-client |

## Repository layout

```
.
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI routers + shared dependencies
│   │   ├── core/          # settings, security (hashing, JWT)
│   │   ├── db/            # engine, session, declarative base
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # counting engine (geometry, detector, annotate, worker, manager)
│   │   └── main.py        # app factory
│   ├── alembic/           # migrations
│   ├── tests/             # pytest suite
│   ├── requirements*.txt
│   ├── Dockerfile         # API image: Python 3.13 + ffmpeg, YOLO weights baked in
│   └── pyproject.toml     # ruff + pytest config
├── frontend/
│   ├── Dockerfile         # web image: Vite build served by nginx
│   ├── nginx.conf         # proxies /api, /media and /socket.io to the api
│   └── src/
│       ├── components/      # ui primitives, layout, theme, landing
│       ├── features/auth/   # auth API, context, route guards
│       ├── features/streams/# streams API, HLS player, dialogs, status, Konva overlay editor
│       ├── lib/             # api client, query client, utils
│       └── pages/           # landing, login, register, streams, stream detail, not-found
├── docker-compose.yml     # PostgreSQL + api + web (docker compose up --build)
├── pyrightconfig.json
└── DESIGN.md              # design tokens
```

## Prerequisites

- Python **3.13**
- Node **20+**
- Docker + Docker Compose
- ffmpeg (with an H.264 encoder — `libx264` or `libopenh264`)

## Backend

All Python work uses the project-local `.venv`; run Python tools from `backend/`.

```bash
python3 -m venv .venv
# PyTorch CPU wheels (the counting engine runs on CPU):
uv pip install --python .venv --index-url https://download.pytorch.org/whl/cpu torch torchvision
# uv resolves the deps and applies backend/overrides.txt, which drops the GUI
# OpenCV build that Ultralytics pulls in (it needs GLib/GTK that headless hosts
# lack), leaving the headless build as the only cv2.
uv pip install --python .venv -r backend/requirements-dev.txt --overrides backend/overrides.txt

cp backend/.env.example backend/.env
# then set SECRET_KEY: .venv/bin/python -c "import secrets; print(secrets.token_urlsafe(48))"

docker compose up -d db
cd backend && ../.venv/bin/alembic upgrade head
cd backend && ../.venv/bin/uvicorn app.main:socket_app --reload --port 8000
```

The first run downloads the `yolo11n.pt` weights. Annotated HLS segments are
written under `backend/media/` (git-ignored).

- API root: `http://localhost:8000/api`
- OpenAPI docs: `http://localhost:8000/docs`

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api`, `/media`
(annotated HLS) and `/socket.io` to the backend, so HttpOnly auth cookies are
same-origin.

If port `8000` is already taken, run the API elsewhere and point the proxy at it:

```bash
# backend
cd backend && ../.venv/bin/uvicorn app.main:socket_app --reload --port 8010
# frontend
cd frontend && VITE_PROXY_TARGET=http://127.0.0.1:8010 npm run dev
```

## Docker

Run PostgreSQL, the API + counting engine and the web app as one stack:

```bash
cp .env.example .env   # then set SECRET_KEY
docker compose up --build
```

Open `http://localhost:8080`; the API is also published on
`http://localhost:8000` (docs at `/docs`). Migrations run automatically when the
api container starts.

- **api** (`backend/Dockerfile`) — Python 3.13 + ffmpeg, PyTorch CPU wheels and
  the counting dependencies, with the GUI OpenCV build removed via
  `backend/overrides.txt`. `yolo11n.pt` is baked in at build time, and annotated
  HLS is written to the `media` volume.
- **web** (`frontend/Dockerfile`) — a production Vite build served by nginx,
  which proxies `/api`, `/media` and `/socket.io` to the api service so the
  browser sees a single origin and HttpOnly cookies keep working.

Set `SECRET_KEY` (required for any real deployment), `COOKIE_SECURE=true` behind
HTTPS, and `CORS_ORIGINS` to the public origin in the root `.env`.

## Configuration

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | `dev-only-change-me` | JWT signing key — change in any real deployment |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `DATABASE_URL` | `postgresql+asyncpg://traffic:traffic@localhost:5432/traffic_control` | Async DB URL |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `MAX_CONCURRENT_STREAMS` | `2` | Worker concurrency cap (CPU inference is the bottleneck) |
| `YOLO_MODEL` | `yolo11n.pt` | Detection weights |
| `YOLO_IMGSZ` / `YOLO_CONF` | `640` / `0.3` | Inference size and confidence threshold |
| `YOLO_DEVICE` | `cpu` | Set to `cuda:0` for a GPU |
| `DECODE_MAX_WIDTH` | `1280` | Downscale sources before inference |
| `CORRIDOR_FRACTION` | `0.06` | Lane corridor half-width as a fraction of frame width |
| `OUTPUT_FPS` | `12` | Annotated HLS frame rate |
| `VIDEO_CODEC` | `libx264` | Encoder; falls back to `libopenh264`/`mpeg4` when absent |
| `HLS_SEGMENT_SECONDS` / `HLS_LIST_SIZE` | `2` / `6` | HLS segment length and playlist depth |
| `MEDIA_DIR` | `media` | Root for annotated HLS output |
| `REALTIME_PUSH_SECONDS` | `1.0` | Socket.IO status/counter push interval |

Frontend (`frontend/.env`, see `frontend/.env.example`): `VITE_PROXY_TARGET`,
`VITE_API_BASE_URL`.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness |
| GET | `/api/health/db` | Database readiness |
| POST | `/api/auth/register` | Create account, sets auth cookies |
| POST | `/api/auth/login` | Sign in, sets auth cookies |
| POST | `/api/auth/logout` | Clear auth cookies |
| POST | `/api/auth/refresh` | Rotate access + refresh tokens |
| GET | `/api/auth/me` | Current user |
| GET | `/api/streams` | List the current user's streams |
| POST | `/api/streams` | Connect a new stream |
| GET | `/api/streams/{id}` | Stream detail |
| PATCH | `/api/streams/{id}` | Update name, source or config |
| DELETE | `/api/streams/{id}` | Delete a stream and its lines |
| PUT | `/api/streams/{id}/roi` | Set the normalized region of interest |
| GET | `/api/streams/{id}/lines` | List counting lines |
| POST | `/api/streams/{id}/lines` | Create a counting line (polyline) |
| PUT | `/api/streams/{id}/lines/reorder` | Reorder lines |
| PATCH | `/api/lines/{id}` | Update a line |
| DELETE | `/api/lines/{id}` | Delete a line |
| POST | `/api/streams/{id}/start` | Start the counting worker |
| POST | `/api/streams/{id}/stop` | Stop the counting worker |
| GET | `/api/streams/{id}/status` | Worker state, telemetry and live counters |
| GET | `/api/streams/{id}/counts` | Counters (live, or the latest session's totals) |
| GET | `/api/streams/{id}/sessions` | Recent counting sessions |
| GET | `/api/streams/{id}/events` | Recent line-entry events |
| GET | `/api/streams/{id}/analytics` | Aggregated counts by line, class and minute (latest or `session_id`) |
| GET | `/api/streams/{id}/export/counts` | Download per-minute counts (`format=csv\|json`, optional `session_id`) |
| GET | `/api/streams/{id}/export/events` | Download individual crossings (`format=csv\|json`, optional `session_id`) |
| GET | `/api/streams/{id}/playback` | Signed annotated-HLS manifest URL |
| GET | `/api/streams/{id}/snapshot` | Latest annotated frame (JPEG) |
| GET | `/api/streams/{id}/frame` | One still frame of the source (JPEG) |
| GET | `/media/streams/{token}/hls/{path}` | Annotated HLS manifest + segments |

Sessions are carried in HttpOnly cookies — `tc_access` (short-lived, path `/`)
and `tc_refresh` (path `/api/auth`, rotated on every refresh). Usernames are
normalized to lowercase and hashed with Argon2. Streams are scoped to their
owner; a line is an ordered polyline of normalized `{x, y}` points whose first
point is the entry end.

The web client refreshes an expired access token automatically: a `401`
triggers one refresh-and-retry (concurrent `401`s share a single refresh, since
the refresh token rotates on every call) and reconnects the Socket.IO session
once a new access token is issued.

The counting worker reads the source with ffmpeg, runs YOLO11-n + ByteTrack on
CPU, applies the ROI and each lane corridor, counts a track once when it first
travels forward past the line's entry gate, burns the overlays in with OpenCV,
and re-encodes to low-latency HLS. Annotated media is served through a signed
per-stream token (`/media/...`) and the counts are flushed to Postgres
periodically and on stop.

### Realtime (Socket.IO)

`app.main:socket_app` serves the API and a Socket.IO endpoint on the same
origin (`/socket.io`, proxied by the dev server). Clients authenticate with the
same HttpOnly access cookie as the REST API and subscribe to the streams they
own; unauthorised connections and subscriptions are refused.

| Direction | Event | Payload |
|---|---|---|
| → server | `subscribe` / `unsubscribe` | `{ stream_id }` |
| ← client | `subscribed` | `{ stream_id }` |
| ← client | `status` | full `WorkerStatus` (telemetry + counters); on subscribe and every `REALTIME_PUSH_SECONDS` while active, plus once when a worker stops |
| ← client | `count` | `{ stream_id, line_id, name, color, class_name, confidence, track_id, ts }` for each line crossing |
| ← client | `subscribe_error` | `{ stream_id?, message }` |

While the socket is connected the stream detail page stops polling and reads
the pushed `status` snapshots (plus `count` events for the live crossing feed);
if the connection drops it falls back to the REST endpoints.

## Quality gates

```bash
# backend
cd backend && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check .
cd backend && ../.venv/bin/python -m pytest

# frontend
cd frontend && npm run build && npm run lint
```

The backend suite runs against a throwaway Postgres database derived from
`DATABASE_URL` by appending `_test` (override with `TEST_DATABASE_URL`). It is
created on demand and every test rolls back, so it never touches real data.

## Design system

`DESIGN.md` tokens are mapped to semantic CSS variables in
`frontend/src/index.css` and Tailwind in `frontend/tailwind.config.ts`. Colour
names are semantic (`canvas`, `surface`, `ink`, `body`, `muted`, `hairline`,
`primary`), so light/dark themes swap values without `dark:` prefixes in markup.

Display type uses **Newsreader**; body copy uses **Inter**.

## Roadmap

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Foundation, design system, auth** | Scaffolding, design tokens, theming, landing, register/login/logout, JWT cookies | Done |
| **M2 — Stream CRUD & detail shell** | Stream CRUD, list/detail pages, HLS source preview | Done |
| **M3 — CV counting engine + overlay** | ffmpeg decode, YOLO11 + ByteTrack, ROI, directional lines, annotated HLS, Konva editor | Done |
| **M4 — Realtime counters & status** | Socket.IO live counters, FPS/status panel, animations | Done |
| **M5 — Hardening, analytics, deploy** | Tests, analytics/export, Dockerfiles, compose for api + web | Done |
| **M6 — Concurrency & scaling** | Shared model inference, GPU acceleration, Redis pub/sub for Socket.IO, media CDN offload | Planned

