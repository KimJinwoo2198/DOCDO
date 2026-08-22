from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.schemas import HealthOut
from app.services.storage import get_storage

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    settings.local_storage_path.mkdir(parents=True, exist_ok=True)
    if settings.database_url.startswith("sqlite"):
        settings.local_storage_path.parent.joinpath(".data").mkdir(parents=True, exist_ok=True)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    await get_storage(settings).ensure_ready()
    logger.info("application_started", environment=settings.environment, service="docdo")
    yield
    await engine.dispose()


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "고령자와 문해력 취약층을 위한 문서 이해·처리 지원 API입니다. "
        "법률·금융·행정 판단이나 외부 거래 완료를 보증하지 않습니다."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health", response_model=HealthOut, tags=["health"])
async def health() -> HealthOut:
    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return HealthOut(status="ok", database="ok")
    except Exception:
        return HealthOut(status="degraded", database="error")
