from sqlalchemy.orm import Session

from app.models.session import UserSession


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, *, user_id: int, ip_address: str | None, user_agent: str | None) -> UserSession:
        session = UserSession(user_id=user_id, ip_address=ip_address, user_agent=user_agent)
        self.db.add(session)
        self.db.flush()
        return session

    def get_by_id(self, session_id: int) -> UserSession | None:
        return self.db.get(UserSession, session_id)

    def deactivate(self, session: UserSession) -> None:
        session.is_active = False
        self.db.flush()
