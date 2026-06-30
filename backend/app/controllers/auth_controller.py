from fastapi import Request
from sqlalchemy.orm import Session

from app.schemas.auth_schema import LoginRequest, TokenResponse
from app.services.auth_service import AuthService
from app.services.google_oauth_service import GoogleOAuthService


class AuthController:
    def __init__(self, db: Session):
        self.auth_service = AuthService(db)
        self.google_oauth_service = GoogleOAuthService()

    def login(self, payload: LoginRequest, request: Request) -> TokenResponse:
        return self.auth_service.login(
            email=payload.email,
            password=payload.password,
            remember_me=payload.remember_me,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

    def refresh(self, refresh_token: str) -> TokenResponse:
        return self.auth_service.refresh(refresh_token=refresh_token)

    def logout(self, refresh_token: str) -> None:
        self.auth_service.logout(refresh_token=refresh_token)

    def list_sessions(self, user_id: int):
        return self.auth_service.list_sessions(user_id=user_id)

    def revoke_session(self, user_id: int, session_id: int) -> None:
        self.auth_service.revoke_session(user_id=user_id, session_id=session_id)

    def google_login_url(self) -> tuple[str, str]:
        return self.google_oauth_service.build_authorization_url()

    def google_callback(self, code: str, request: Request) -> TokenResponse:
        profile = self.google_oauth_service.exchange_code_for_profile(code)
        return self.auth_service.google_login(
            profile=profile,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
