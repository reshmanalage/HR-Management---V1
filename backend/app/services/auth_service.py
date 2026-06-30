from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import (
    AccountInactiveError,
    GoogleAccountNotProvisionedError,
    InvalidCredentialsError,
    InvalidTokenError,
    SessionNotFoundError,
)
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_opaque_token,
    verify_password,
)
from app.models.login_log import LoginStatus
from app.repositories.google_account_repository import GoogleAccountRepository
from app.repositories.login_log_repository import LoginLogRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.token_repository import TokenRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import TokenResponse
from app.services.google_oauth_service import GoogleProfile
from app.services.login_security_service import LoginSecurityService


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repository = UserRepository(db)
        self.login_log_repository = LoginLogRepository(db)
        self.session_repository = SessionRepository(db)
        self.token_repository = TokenRepository(db)
        self.google_account_repository = GoogleAccountRepository(db)
        self.login_security_service = LoginSecurityService(self.user_repository)

    def login(
        self,
        *,
        email: str,
        password: str,
        remember_me: bool,
        ip_address: str | None,
        user_agent: str | None,
    ) -> TokenResponse:
        user = self.user_repository.get_by_email(email)

        if user is None or user.password_hash is None:
            self.login_log_repository.create(
                user_id=None,
                email_attempted=email,
                ip_address=ip_address,
                user_agent=user_agent,
                status=LoginStatus.FAILED,
            )
            self.db.commit()
            raise InvalidCredentialsError()

        try:
            self.login_security_service.ensure_not_locked(user)
        except Exception:
            self.login_log_repository.create(
                user_id=user.id,
                email_attempted=email,
                ip_address=ip_address,
                user_agent=user_agent,
                status=LoginStatus.LOCKED,
            )
            self.db.commit()
            raise

        if not user.is_active:
            self.db.commit()
            raise AccountInactiveError()

        if not verify_password(password, user.password_hash):
            self.login_security_service.register_failed_attempt(user)
            self.login_log_repository.create(
                user_id=user.id,
                email_attempted=email,
                ip_address=ip_address,
                user_agent=user_agent,
                status=LoginStatus.FAILED,
            )
            self.db.commit()
            raise InvalidCredentialsError()

        self.login_security_service.register_successful_login(user)
        self.login_log_repository.create(
            user_id=user.id,
            email_attempted=email,
            ip_address=ip_address,
            user_agent=user_agent,
            status=LoginStatus.SUCCESS,
        )

        session = self.session_repository.create(user_id=user.id, ip_address=ip_address, user_agent=user_agent)

        access_token = create_access_token(subject=str(user.id))
        refresh_token = self._issue_refresh_token(user_id=user.id, session_id=session.id, remember_me=remember_me)

        self.db.commit()

        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    def refresh(self, *, refresh_token: str) -> TokenResponse:
        token_hash = hash_opaque_token(refresh_token)
        token_record = self.token_repository.get_by_hash(token_hash)

        if token_record is None or token_record.revoked_at is not None:
            raise InvalidTokenError()

        if token_record.expires_at <= datetime.utcnow():
            raise InvalidTokenError("Refresh token has expired")

        user = self.user_repository.get_by_id(token_record.user_id)
        if user is None or not user.is_active:
            raise InvalidTokenError()

        self.token_repository.revoke(token_record)

        access_token = create_access_token(subject=str(user.id))
        new_refresh_token = self._issue_refresh_token(
            user_id=user.id,
            session_id=token_record.session_id,
            remember_me=False,
            lifetime_override=token_record.expires_at - token_record.created_at,
        )

        self.db.commit()

        return TokenResponse(access_token=access_token, refresh_token=new_refresh_token)

    def logout(self, *, refresh_token: str) -> None:
        token_hash = hash_opaque_token(refresh_token)
        token_record = self.token_repository.get_by_hash(token_hash)

        if token_record is None:
            return

        self.token_repository.revoke(token_record)

        if token_record.session_id:
            session = self.session_repository.get_by_id(token_record.session_id)
            if session:
                self.session_repository.deactivate(session)

        self.db.commit()

    def google_login(
        self,
        *,
        profile: GoogleProfile,
        ip_address: str | None,
        user_agent: str | None,
    ) -> TokenResponse:
        google_account = self.google_account_repository.get_by_google_id(profile.google_id)

        if google_account is not None:
            user = self.user_repository.get_by_id(google_account.user_id)
        else:
            # No existing link - only allow this to succeed if a pre-provisioned
            # user already exists with this email (no public self-registration).
            user = self.user_repository.get_by_email(profile.email)
            if user is None:
                self.login_log_repository.create(
                    user_id=None,
                    email_attempted=profile.email,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    status=LoginStatus.FAILED,
                )
                self.db.commit()
                raise GoogleAccountNotProvisionedError()

            self.google_account_repository.link(
                user_id=user.id, google_id=profile.google_id, email=profile.email
            )

        if user is None or not user.is_active:
            self.db.commit()
            raise AccountInactiveError()

        try:
            self.login_security_service.ensure_not_locked(user)
        except Exception:
            self.login_log_repository.create(
                user_id=user.id,
                email_attempted=profile.email,
                ip_address=ip_address,
                user_agent=user_agent,
                status=LoginStatus.LOCKED,
            )
            self.db.commit()
            raise

        if profile.email_verified and not user.is_email_verified:
            user.is_email_verified = True
            self.user_repository.save(user)

        self.login_security_service.register_successful_login(user)
        self.login_log_repository.create(
            user_id=user.id,
            email_attempted=profile.email,
            ip_address=ip_address,
            user_agent=user_agent,
            status=LoginStatus.SUCCESS,
        )

        session = self.session_repository.create(user_id=user.id, ip_address=ip_address, user_agent=user_agent)

        access_token = create_access_token(subject=str(user.id))
        refresh_token = self._issue_refresh_token(user_id=user.id, session_id=session.id, remember_me=False)

        self.db.commit()

        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    def list_sessions(self, *, user_id: int) -> list:
        return self.session_repository.list_active_for_user(user_id)

    def revoke_session(self, *, user_id: int, session_id: int) -> None:
        session = self.session_repository.get_by_id(session_id)
        if session is None or session.user_id != user_id or not session.is_active:
            raise SessionNotFoundError()

        self.session_repository.deactivate(session)
        self.token_repository.revoke_all_for_session(session_id)
        self.db.commit()

    def _issue_refresh_token(
        self,
        *,
        user_id: int,
        session_id: int | None,
        remember_me: bool,
        lifetime_override: timedelta | None = None,
    ) -> str:
        if lifetime_override is not None:
            lifetime = lifetime_override
        elif remember_me:
            lifetime = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS_REMEMBER_ME)
        else:
            lifetime = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        raw_token = generate_opaque_token()
        self.token_repository.create(
            user_id=user_id,
            session_id=session_id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=datetime.utcnow() + lifetime,
        )
        return raw_token
