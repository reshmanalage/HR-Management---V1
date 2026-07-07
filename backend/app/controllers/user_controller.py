from fastapi import Request
from sqlalchemy.orm import Session

from app.schemas.user_schema import CreateUserRequest, UserOut
from app.services.user_service import UserService


def _user_out(user, roles) -> UserOut:
    return UserOut(
        id=user.id,
        employee_code=user.employee_code,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        is_active=user.is_active,
        is_locked=user.is_locked,
        is_email_verified=user.is_email_verified,
        created_at=user.created_at,
        roles=roles,
        plain_password=user.plain_password,
    )


class UserController:
    def __init__(self, db: Session):
        self.user_service = UserService(db)

    def create_user(self, payload: CreateUserRequest, creator_id: int, request: Request) -> UserOut:
        user = self.user_service.create_user(
            creator_id=creator_id,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            role_id=payload.role_id,
            employee_code=payload.employee_code,
            ip_address=request.client.host if request.client else None,
            password=payload.password or None,
        )
        _, roles = self.user_service.get_user(user.id)
        return _user_out(user, roles)

    def reset_password(self, user_id: int, new_password: str) -> UserOut:
        user = self.user_service.admin_reset_password(user_id, new_password)
        _, roles = self.user_service.get_user(user.id)
        return _user_out(user, roles)

    def list_users(self) -> list[UserOut]:
        return [_user_out(user, roles) for user, roles in self.user_service.list_users()]
