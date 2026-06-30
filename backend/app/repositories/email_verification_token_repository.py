from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.email_verification_token import EmailVerificationToken


class EmailVerificationTokenRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, *, user_id: int, token_hash: str, expires_at: datetime) -> EmailVerificationToken:
        token = EmailVerificationToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(token)
        self.db.flush()
        return token

    def get_by_hash(self, token_hash: str) -> EmailVerificationToken | None:
        stmt = select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash)
        return self.db.scalar(stmt)

    def mark_verified(self, token: EmailVerificationToken) -> None:
        token.verified_at = datetime.utcnow()
        self.db.flush()

    def invalidate_active_for_user(self, user_id: int) -> None:
        stmt = select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user_id, EmailVerificationToken.verified_at.is_(None)
        )
        for token in self.db.scalars(stmt).all():
            token.verified_at = datetime.utcnow()
        self.db.flush()
