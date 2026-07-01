from fastapi import APIRouter

from app.api.v1.routers.auth_router import router as auth_router
from app.api.v1.routers.employee_router import router as employee_router
from app.api.v1.routers.role_router import router as role_router
from app.api.v1.routers.user_router import router as user_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(role_router)
api_router.include_router(employee_router)


@api_router.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
