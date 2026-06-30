from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.user_role import UserRole


class PermissionRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[Permission]:
        return list(self.db.scalars(select(Permission)).all())

    def get_user_permission_codes(self, user_id: int) -> set[str]:
        stmt = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .where(UserRole.user_id == user_id)
        )
        return set(self.db.scalars(stmt).all())
