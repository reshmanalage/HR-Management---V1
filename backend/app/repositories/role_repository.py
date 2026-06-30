from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.role import Role


class RoleRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[Role]:
        return list(self.db.scalars(select(Role)).all())

    def get_by_id(self, role_id: int) -> Role | None:
        return self.db.get(Role, role_id)

    def get_by_name(self, name: str) -> Role | None:
        stmt = select(Role).where(Role.name == name)
        return self.db.scalar(stmt)
