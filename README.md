# Traffic Control

AI-powered traffic counting from video streams. Draw a one or more directional
lines over a live feed and Traffic Control counts the vehicles that cross them —
in real time, split by direction and by class.

> **Status:** Milestone 1 complete — foundation, design system, and authentication.
> See [Roadmap](#roadmap).

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, async SQLAlchemy 2 + asyncpg, Alembic, PostgreSQL, JWT in HttpOnly cookies (Argon2) |
| Frontend | React 19 + Vite, TypeScript, Tailwind, shadcn-style UI, Framer Motion, TanStack Query, React Router |
| Planned | Ultralytics YOLO11 + ByteTrack, supervision, ffmpeg (HLS in/out), python-socketio, hls.js, react-konva |

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
│   │   └── main.py        # app factory
│   ├── alembic/           # migrations
│   ├── requirements*.txt
│   └── pyproject.toml     # ruff + pytest config
├── frontend/
│   └── src/
│       ├── components/    # ui primitives, layout, theme, landing
│       ├── features/auth/ # auth API, context, route guards
│       ├── lib/           # api client, query client, utils
│       └── pages/         # landing, login, register, streams, not-found
├── docker-compose.yml     # PostgreSQL (api/web added in M5)
├── pyrightconfig.json
└── DESIGN.md              # design tokens
```

## Prerequisites

- Python **3.13**
- Node **20+**
- Docker + Docker Compose
- ffmpeg (first needed in M3)

## Backend

All Python work uses the project-local `.venv`; run Python tools from `backend/`.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt

cp backend/.env.example backend/.env
# then set SECRET_KEY: .venv/bin/python -c "import secrets; print(secrets.token_urlsafe(48))"

docker compose up -d db
cd backend && ../.venv/bin/alembic upgrade head
cd backend && ../.venv/bin/uvicorn app.main:app --reload --port 8000
```

- API root: `http://localhost:8000/api`
- OpenAPI docs: `http://localhost:8000/docs`

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api` (and, from M4,
`/socket.io`) to the backend, so HttpOnly auth cookies are same-origin.

If port `8000` is already taken, run the API elsewhere and point the proxy at it:

```bash
# backend
cd backend && ../.venv/bin/uvicorn app.main:app --reload --port 8010
# frontend
cd frontend && VITE_PROXY_TARGET=http://127.0.0.1:8010 npm run dev
```

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

Frontend (`frontend/.env`, see `frontend/.env.example`): `VITE_PROXY_TARGET`,
`VITE_API_BASE_URL`.

## API (Milestone 1)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness |
| GET | `/api/health/db` | Database readiness |
| POST | `/api/auth/register` | Create account, sets auth cookies |
| POST | `/api/auth/login` | Sign in, sets auth cookies |
| POST | `/api/auth/logout` | Clear auth cookies |
| POST | `/api/auth/refresh` | Rotate access + refresh tokens |
| GET | `/api/auth/me` | Current user |

Sessions are carried in HttpOnly cookies — `tc_access` (short-lived, path `/`)
and `tc_refresh` (path `/api/auth`, rotated on every refresh). Usernames are
normalized to lowercase and hashed with Argon2.

## Quality gates

```bash
# backend
cd backend && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check .

# frontend
cd frontend && npm run build && npm run lint
```

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
| **M2 — Stream CRUD & detail shell** | Stream CRUD, list/detail pages, HLS source preview | Planned |
| **M3 — CV counting engine + overlay** | ffmpeg decode, YOLO11 + ByteTrack, ROI, directional lines, annotated HLS | Planned |
| **M4 — Realtime counters & status** | Socket.IO live counters, FPS/status panel, animations | Planned |
| **M5 — Hardening, analytics, deploy** | Tests, analytics/export, Dockerfiles, compose for api + web | Planned |