from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from celery import Celery
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.domain import DocumentStatus
from app.models import DocumentPage
from app.services.analysis import process_document
from app.services.storage import get_storage

settings = get_settings()
celery_app = Celery("docdo", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    timezone="Asia/Seoul",
    beat_schedule={
        "purge-expired-document-pages-hourly": {
            "task": "app.tasks.purge_expired_document_pages",
            "schedule": 60 * 60,
        }
    },
)


async def dispatch_document(document_id: uuid.UUID) -> None:
    if settings.analysis_inline:
        async with SessionLocal() as db:
            await process_document(db, document_id)
    else:
        process_document_task.delay(str(document_id))


@celery_app.task(
    name="app.tasks.process_document",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
)
def process_document_task(document_id: str) -> None:
    async def run() -> None:
        async with SessionLocal() as db:
            result = await process_document(db, uuid.UUID(document_id))
            if result.status == DocumentStatus.FAILED.value:
                raise RuntimeError(result.error_message or "document provider failed")

    asyncio.run(run())


@celery_app.task(name="app.tasks.purge_expired_document_pages")
def purge_expired_document_pages() -> None:
    asyncio.run(purge_expired_pages())


async def purge_expired_pages() -> None:
    storage = get_storage()
    async with SessionLocal() as db:
        pages = (
            await db.scalars(
                select(DocumentPage).where(
                    DocumentPage.expires_at < datetime.now(UTC),
                    DocumentPage.original_available.is_(True),
                )
            )
        ).all()
        for page in pages:
            if page.object_key:
                await storage.delete(page.object_key)
            page.object_key = None
            page.original_available = False
        await db.commit()
