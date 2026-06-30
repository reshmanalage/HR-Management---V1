from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.login_log import LoginLog, LoginStatus


class LoginLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        user_id: int | None,
        email_attempted: str,
        ip_address: str | None,
        user_agent: str | None,
        status: LoginStatus,
    ) -> LoginLog:
        log = LoginLog(
            user_id=user_id,
            email_attempted=email_attempted,
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
        )
        self.db.add(log)
        self.db.flush()
        return log

    def list_for_user(self, user_id: int, limit: int = 50) -> list[LoginLog]:
        stmt = (
            select(LoginLog)
            .where(LoginLog.user_id == user_id)
            .order_by(LoginLog.created_at.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())
