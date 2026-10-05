"""Health / readiness endpoints."""

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DBSession
from app.core.config import settings

router = APIRouter(tags=["system"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}


@router.get("/health/db")
async def health_db(db: DBSession) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}
