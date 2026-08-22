from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models import PushDevice
from app.schemas import PushDeviceCreate, PushDeviceOut, PushDeviceUnregister

router = APIRouter(prefix="/push-tokens", tags=["push notifications"])


def serialize_device(device: PushDevice) -> PushDeviceOut:
    return PushDeviceOut(
        id=device.id,
        platform=device.platform,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


@router.post("", response_model=PushDeviceOut)
async def register_push_device(
    payload: PushDeviceCreate, user: CurrentUser, db: DbSession
) -> PushDeviceOut:
    device = await db.scalar(
        select(PushDevice).where(PushDevice.expo_push_token == payload.expo_push_token)
    )
    if device is None:
        device = PushDevice(
            user_id=user.id,
            expo_push_token=payload.expo_push_token,
            platform=payload.platform,
        )
        db.add(device)
    else:
        device.user_id = user.id
        device.platform = payload.platform
        device.disabled_at = None
        device.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(device)
    return serialize_device(device)


@router.post("/unregister", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_push_device(
    payload: PushDeviceUnregister, user: CurrentUser, db: DbSession
) -> Response:
    device = await db.scalar(
        select(PushDevice).where(
            PushDevice.user_id == user.id,
            PushDevice.expo_push_token == payload.expo_push_token,
        )
    )
    if device is not None:
        await db.delete(device)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
