from fastapi import Request
from sqlalchemy.orm import Session

from app.schemas.auth_schema import LoginRequest, TokenResponse
from app.services.auth_service import AuthService


class AuthController:
    def __init__(self, db: Session):
        self.auth_service = AuthService(db)

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
