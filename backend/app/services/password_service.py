from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import InvalidCredentialsError, InvalidTokenError
from app.core.security import (
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    verify_password,
)
from app.repositories.password_reset_token_repository import PasswordResetTokenRepository
from app.repositories.token_repository import TokenRepository
from app.repositories.user_repository import UserRepository
from app.utils.email_sender import send_password_reset_email


class PasswordService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repository = UserRepository(db)
        self.reset_token_repository = PasswordResetTokenRepository(db)
        self.refresh_token_repository = TokenRepository(db)

    def request_password_reset(self, *, email: str) -> None:
        user = self.user_repository.get_by_email(email)

        # Always behave the same way regardless of whether the email exists,
        # so the endpoint can't be used to enumerate registered accounts.
        if user is None or not user.is_active:
            self.db.commit()
            return

        self.reset_token_repository.invalidate_active_for_user(user.id)

        raw_token = generate_opaque_token()
        self.reset_token_repository.create(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        )
        self.db.commit()

        reset_link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={raw_token}"
        send_password_reset_email(to_email=user.email, reset_link=reset_link)

    def reset_password(self, *, token: str, new_password: str) -> None:
        token_hash = hash_opaque_token(token)
        token_record = self.reset_token_repository.get_by_hash(token_hash)

        if token_record is None or token_record.used_at is not None:
            raise InvalidTokenError()

        if token_record.expires_at <= datetime.utcnow():
            raise InvalidTokenError("Reset token has expired")

        user = self.user_repository.get_by_id(token_record.user_id)
        if user is None or not user.is_active:
            raise InvalidTokenError()

        user.password_hash = hash_password(new_password)
        self.user_repository.save(user)

        self.reset_token_repository.mark_used(token_record)
        self.refresh_token_repository.revoke_all_for_user(user.id)

        self.db.commit()

    def change_password(self, *, user_id: int, current_password: str, new_password: str) -> None:
        user = self.user_repository.get_by_id(user_id)
        if user is None or user.password_hash is None:
            raise InvalidCredentialsError()

        if not verify_password(current_password, user.password_hash):
            raise InvalidCredentialsError()

        user.password_hash = hash_password(new_password)
        user.plain_password = None  # user owns their password now
        self.user_repository.save(user)

        self.refresh_token_repository.revoke_all_for_user(user.id)

        self.db.commit()
