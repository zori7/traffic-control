"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

import socketio
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, health, lines, media, runtime, streams
from app.core.config import settings
from app.services import realtime
from app.services.counting.manager import manager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.media_path.mkdir(parents=True, exist_ok=True)
    await realtime.start()
    yield
    await realtime.stop()
    await manager.stop_all()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix="/api")
    api.include_router(health.router)
    api.include_router(auth.router)
    api.include_router(streams.router)
    api.include_router(lines.router)
    api.include_router(runtime.router)
    app.include_router(api)
    app.include_router(media.router)

    return app


app = create_app()

# Socket.IO wraps the FastAPI app: `/socket.io` is handled by the realtime
# server, every other path (including the lifespan) is forwarded unchanged.
# Run with: uvicorn app.main:socket_app
socket_app = socketio.ASGIApp(realtime.sio, other_asgi_app=app, socketio_path="socket.io")
