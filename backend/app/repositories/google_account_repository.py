from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.google_account import GoogleAccount


class GoogleAccountRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_google_id(self, google_id: str) -> GoogleAccount | None:
        stmt = select(GoogleAccount).where(GoogleAccount.google_id == google_id)
        return self.db.scalar(stmt)

    def link(self, *, user_id: int, google_id: str, email: str) -> GoogleAccount:
        account = GoogleAccount(user_id=user_id, google_id=google_id, email=email)
        self.db.add(account)
        self.db.flush()
        return account
