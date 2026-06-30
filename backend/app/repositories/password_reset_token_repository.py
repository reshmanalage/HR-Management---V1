from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.password_reset_token import PasswordResetToken


class PasswordResetTokenRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, *, user_id: int, token_hash: str, expires_at: datetime) -> PasswordResetToken:
        token = PasswordResetToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(token)
        self.db.flush()
        return token

    def get_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        stmt = select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        return self.db.scalar(stmt)

    def mark_used(self, token: PasswordResetToken) -> None:
        token.used_at = datetime.utcnow()
        self.db.flush()

    def invalidate_active_for_user(self, user_id: int) -> None:
        stmt = select(PasswordResetToken).where(
            PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None)
        )
        for token in self.db.scalars(stmt).all():
            token.used_at = datetime.utcnow()
        self.db.flush()
