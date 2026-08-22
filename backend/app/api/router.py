from fastapi import APIRouter

from app.api import auth, care, dashboard, documents, events, profile, reminders, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(profile.router)
api_router.include_router(documents.router)
api_router.include_router(care.router)
api_router.include_router(reminders.router)
api_router.include_router(dashboard.router)
api_router.include_router(events.router)
