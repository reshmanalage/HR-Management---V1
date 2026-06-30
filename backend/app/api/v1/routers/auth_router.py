from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.controllers.auth_controller import AuthController
from app.controllers.email_verification_controller import EmailVerificationController
from app.controllers.password_controller import PasswordController
from app.core.config import settings
from app.core.exceptions import AppError
from app.database.session import get_db
from app.models.user import User
from app.repositories.login_log_repository import LoginLogRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyEmailRequest,
)
from app.schemas.session_schema import SessionOut
from app.schemas.user_schema import UserOut

GOOGLE_STATE_COOKIE = "google_oauth_state"

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


@router.post("/forgot-password", status_code=204)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    PasswordController(db).forgot_password(payload.email)


@router.post("/reset-password", status_code=204)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    PasswordController(db).reset_password(payload.token, payload.new_password)


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    PasswordController(db).change_password(
        current_user.id, payload.current_password, payload.new_password
    )


@router.post("/send-verification-email", status_code=204)
def send_verification_email(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    EmailVerificationController(db).send_verification_email(current_user.id)


@router.post("/verify-email", status_code=204)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    EmailVerificationController(db).verify_email(payload.token)


@router.get("/google/login")
def google_login(db: Session = Depends(get_db)):
    auth_url, state = AuthController(db).google_login_url()
    response = RedirectResponse(url=auth_url)
    response.set_cookie(
        GOOGLE_STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/google/callback")
def google_callback(code: str, state: str, request: Request, db: Session = Depends(get_db)):
    expected_state = request.cookies.get(GOOGLE_STATE_COOKIE)
    failure_url = f"{settings.FRONTEND_ORIGIN}/login?error=google_auth_failed"

    if not expected_state or expected_state != state:
        return RedirectResponse(url=failure_url)

    try:
        tokens = AuthController(db).google_callback(code, request)
    except AppError:
        return RedirectResponse(url=failure_url)

    fragment = urlencode({"access_token": tokens.access_token, "refresh_token": tokens.refresh_token})
    response = RedirectResponse(url=f"{settings.FRONTEND_ORIGIN}/auth/google/complete#{fragment}")
    response.delete_cookie(GOOGLE_STATE_COOKIE)
    return response


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return AuthController(db).list_sessions(current_user.id)


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    AuthController(db).revoke_session(current_user.id, session_id)


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
