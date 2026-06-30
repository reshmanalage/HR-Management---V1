from fastapi import APIRouter

from app.api.v1.routers.auth_router import router as auth_router

api_router = APIRouter()
api_router.include_router(auth_router)


@api_router.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
