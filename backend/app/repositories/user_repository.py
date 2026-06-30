from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.user import User
from app.models.user_role import UserRole


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return self.db.scalar(stmt)

    def get_role_names(self, user_id: int) -> list[str]:
        stmt = (
            select(UserRole)
            .options(selectinload(UserRole.role))
            .where(UserRole.user_id == user_id)
        )
        user_roles = self.db.scalars(stmt).all()
        return [ur.role.name for ur in user_roles]

    def save(self, user: User) -> User:
        self.db.add(user)
        self.db.flush()
        return user
