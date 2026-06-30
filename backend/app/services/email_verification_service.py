from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import InvalidTokenError
from app.core.security import generate_opaque_token, hash_opaque_token
from app.repositories.email_verification_token_repository import EmailVerificationTokenRepository
from app.repositories.user_repository import UserRepository
from app.utils.email_sender import send_email_verification_email


class EmailVerificationService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repository = UserRepository(db)
        self.token_repository = EmailVerificationTokenRepository(db)

    def send_verification_email(self, *, user_id: int) -> None:
        user = self.user_repository.get_by_id(user_id)
        if user is None or user.is_email_verified:
            self.db.commit()
            return

        self.token_repository.invalidate_active_for_user(user.id)

        raw_token = generate_opaque_token()
        self.token_repository.create(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS),
        )
        self.db.commit()

        verify_link = f"{settings.FRONTEND_ORIGIN}/verify-email?token={raw_token}"
        send_email_verification_email(to_email=user.email, verify_link=verify_link)

    def verify_email(self, *, token: str) -> None:
        token_hash = hash_opaque_token(token)
        token_record = self.token_repository.get_by_hash(token_hash)

        if token_record is None or token_record.verified_at is not None:
            raise InvalidTokenError()

        if token_record.expires_at <= datetime.utcnow():
            raise InvalidTokenError("Verification link has expired")

        user = self.user_repository.get_by_id(token_record.user_id)
        if user is None:
            raise InvalidTokenError()

        user.is_email_verified = True
        self.user_repository.save(user)
        self.token_repository.mark_verified(token_record)

        self.db.commit()
