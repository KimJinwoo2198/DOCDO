from __future__ import annotations

import asyncio
import os
from abc import ABC, abstractmethod
from pathlib import Path

import boto3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import Settings, get_settings

MAGIC = b"DOCDO1"


class ObjectStorage(ABC):
    async def ensure_ready(self) -> None:
        return None

    @abstractmethod
    async def put(self, object_key: str, content: bytes, content_type: str) -> None: ...

    @abstractmethod
    async def get(self, object_key: str) -> bytes: ...

    @abstractmethod
    async def delete(self, object_key: str) -> None: ...


class LocalObjectStorage(ObjectStorage):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, object_key: str) -> Path:
        path = (self.root / object_key).resolve()
        if self.root not in path.parents:
            raise ValueError("invalid object key")
        return path

    async def put(self, object_key: str, content: bytes, content_type: str) -> None:
        del content_type
        path = self._path(object_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, content)

    async def get(self, object_key: str) -> bytes:
        return await asyncio.to_thread(self._path(object_key).read_bytes)

    async def delete(self, object_key: str) -> None:
        path = self._path(object_key)
        if path.exists():
            await asyncio.to_thread(path.unlink)


class S3ObjectStorage(ObjectStorage):
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )

    async def ensure_ready(self) -> None:
        def create_if_missing() -> None:
            try:
                self.client.head_bucket(Bucket=self.bucket)
            except Exception:
                self.client.create_bucket(Bucket=self.bucket)

        await asyncio.to_thread(create_if_missing)

    async def put(self, object_key: str, content: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )

    async def get(self, object_key: str) -> bytes:
        response = await asyncio.to_thread(
            self.client.get_object, Bucket=self.bucket, Key=object_key
        )
        return await asyncio.to_thread(response["Body"].read)

    async def delete(self, object_key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=object_key)


class EncryptedObjectStorage(ObjectStorage):
    def __init__(self, wrapped: ObjectStorage, key: bytes) -> None:
        self.wrapped = wrapped
        self.cipher = AESGCM(key)

    async def ensure_ready(self) -> None:
        await self.wrapped.ensure_ready()

    async def put(self, object_key: str, content: bytes, content_type: str) -> None:
        del content_type
        nonce = os.urandom(12)
        encrypted = self.cipher.encrypt(nonce, content, object_key.encode("utf-8"))
        await self.wrapped.put(object_key, MAGIC + nonce + encrypted, "application/octet-stream")

    async def get(self, object_key: str) -> bytes:
        payload = await self.wrapped.get(object_key)
        if not payload.startswith(MAGIC) or len(payload) <= len(MAGIC) + 12:
            raise ValueError("encrypted object is invalid")
        nonce = payload[len(MAGIC) : len(MAGIC) + 12]
        ciphertext = payload[len(MAGIC) + 12 :]
        return self.cipher.decrypt(nonce, ciphertext, object_key.encode("utf-8"))

    async def delete(self, object_key: str) -> None:
        await self.wrapped.delete(object_key)


def get_storage(settings: Settings | None = None) -> ObjectStorage:
    current = settings or get_settings()
    raw: ObjectStorage
    if current.storage_driver == "s3":
        raw = S3ObjectStorage(current)
    else:
        raw = LocalObjectStorage(current.local_storage_path)
    return EncryptedObjectStorage(raw, current.encryption_key_bytes)
