from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "DOCDO API"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/v1"
    database_url: str = "sqlite+aiosqlite:///./.data/docdo.db"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:8081,http://localhost:19006"

    jwt_secret: str = "development-only-change-this-secret"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    document_encryption_key: str | None = None

    analysis_inline: bool = True
    max_upload_bytes: int = 15 * 1024 * 1024
    max_document_bytes: int = 30 * 1024 * 1024
    max_document_pages: int = 10
    min_field_confidence: float = 0.85

    storage_driver: Literal["local", "s3"] = "local"
    local_storage_path: Path = Path(".storage")
    s3_endpoint_url: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_bucket: str = "docdo-assets"
    s3_region: str = "ap-northeast-2"
    asset_retention_days: int = 7

    provider_mode: Literal["mock", "upstage", "studio"] = "studio"
    upstage_api_key: str | None = None
    upstage_base_url: str = "https://api.upstage.ai/v1"
    upstage_document_model: str = "document-parse"
    upstage_solar_model: str = "solar-pro4"
    upstage_studio_base_url: str = "https://api.upstage.ai/v2"
    upstage_studio_agent_id: str | None = None
    upstage_studio_config_id: str | None = None
    upstage_studio_timeout_seconds: int = 240
    upstage_studio_poll_seconds: float = 1.0

    invitation_ttl_minutes: int = 15
    invitation_attempt_limit: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def encryption_key_bytes(self) -> bytes:
        material = self.document_encryption_key or self.jwt_secret
        return hashlib.sha256(material.encode("utf-8")).digest()

    def ensure_runtime_safety(self) -> None:
        if self.environment == "production":
            if len(self.jwt_secret) < 32:
                raise RuntimeError("JWT_SECRET must contain at least 32 characters in production")
            if not self.document_encryption_key or len(self.document_encryption_key) < 32:
                raise RuntimeError(
                    "DOCUMENT_ENCRYPTION_KEY must contain at least 32 characters in production"
                )
        if self.provider_mode in {"upstage", "studio"} and not self.upstage_api_key:
            raise RuntimeError("UPSTAGE_API_KEY is required for an Upstage provider")
        if self.provider_mode == "studio":
            if not self.upstage_studio_agent_id:
                raise RuntimeError("UPSTAGE_STUDIO_AGENT_ID is required when PROVIDER_MODE=studio")
            if not self.upstage_studio_config_id:
                raise RuntimeError("UPSTAGE_STUDIO_CONFIG_ID is required when PROVIDER_MODE=studio")
            if self.upstage_studio_timeout_seconds < 30:
                raise RuntimeError("UPSTAGE_STUDIO_TIMEOUT_SECONDS must be at least 30")
            if self.upstage_studio_poll_seconds <= 0:
                raise RuntimeError("UPSTAGE_STUDIO_POLL_SECONDS must be greater than 0")
        if not 0 <= self.min_field_confidence <= 1:
            raise RuntimeError("MIN_FIELD_CONFIDENCE must be between 0 and 1")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_runtime_safety()
    return settings
