"""Application configuration loaded from environment / .env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # App
    app_name: str = "Traffic Control"
    environment: str = "development"
    debug: bool = False

    # Security
    secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Database
    database_url: str = "postgresql+asyncpg://traffic:traffic@localhost:5432/traffic_control"
    db_echo: bool = False

    # Auth cookies
    cookie_secure: bool = False
    cookie_domain: str = ""
    cookie_samesite: str = "lax"

    # CORS (comma-separated list)
    cors_origins: str = "http://localhost:5173"

    # Counting engine
    media_dir: str = "media"
    max_concurrent_streams: int = 2
    yolo_model: str = "yolo11n.pt"
    yolo_imgsz: int = 768
    yolo_conf: float = 0.1
    yolo_iou: float = 0.5
    yolo_device: str = "cpu"
    decode_max_width: int = 1280
    corridor_fraction: float = 0.06
    video_codec: str = "libx264"
    output_fps: int = 12
    hls_segment_seconds: int = 2
    hls_list_size: int = 6
    count_flush_seconds: float = 5.0
    media_token_expire_minutes: int = 360

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def media_path(self) -> Path:
        path = Path(self.media_dir)
        if not path.is_absolute():
            path = Path.cwd() / path
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
