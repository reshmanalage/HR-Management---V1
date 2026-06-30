from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.controllers.auth_controller import AuthController
from app.database.session import get_db
from app.models.user import User
from app.repositories.login_log_repository import LoginLogRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import LoginRequest, LogoutRequest, RefreshRequest, TokenResponse
from app.schemas.user_schema import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    return AuthController(db).login(payload, request)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    return AuthController(db).refresh(payload.refresh_token)


@router.post("/logout", status_code=204)
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    AuthController(db).logout(payload.refresh_token)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    roles = UserRepository(db).get_role_names(current_user.id)
    return UserOut(
        id=current_user.id,
        employee_code=current_user.employee_code,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        email=current_user.email,
        is_active=current_user.is_active,
        is_locked=current_user.is_locked,
        is_email_verified=current_user.is_email_verified,
        created_at=current_user.created_at,
        roles=roles,
    )


@router.get("/login-history")
def login_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    logs = LoginLogRepository(db).list_for_user(current_user.id)
    return [
        {
            "id": log.id,
            "status": log.status,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at,
        }
        for log in logs
    ]
