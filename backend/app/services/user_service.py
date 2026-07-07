from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import EmailAlreadyExistsError, RoleNotFoundError, UserNotFoundError
from app.core.security import generate_opaque_token, hash_opaque_token, hash_password
from app.models.user import User
from app.models.user_role import UserRole
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.password_reset_token_repository import PasswordResetTokenRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.utils.email_sender import send_welcome_email


class UserService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repository = UserRepository(db)
        self.role_repository = RoleRepository(db)
        self.reset_token_repository = PasswordResetTokenRepository(db)
        self.audit_log_repository = AuditLogRepository(db)

    def create_user(
        self,
        *,
        creator_id: int,
        first_name: str,
        last_name: str,
        email: str,
        role_id: int,
        employee_code: str | None,
        ip_address: str | None,
        password: str | None = None,
    ) -> User:
        if self.user_repository.get_by_email(email) is not None:
            raise EmailAlreadyExistsError()

        role = self.role_repository.get_by_id(role_id)
        if role is None:
            raise RoleNotFoundError()

        user = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            employee_code=employee_code or None,
            password_hash=hash_password(password) if password else None,
            plain_password=password if password else None,
            is_active=True,
            is_email_verified=bool(password),  # skip email verify when password is set by admin
            created_by=creator_id,
        )
        self.user_repository.save(user)

        self.db.add(UserRole(user_id=user.id, role_id=role.id, assigned_by=creator_id))

        self.audit_log_repository.create(
            actor_user_id=creator_id,
            action="USER_CREATED",
            entity_type="user",
            entity_id=user.id,
            metadata={"role": role.name},
            ip_address=ip_address,
        )

        raw_token = generate_opaque_token()
        self.reset_token_repository.create(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        )

        self.db.commit()

        if not password:
            # No password set by admin — send set-password email and log link as fallback
            set_password_link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={raw_token}"
            import logging
            logging.getLogger(__name__).info(
                "SET-PASSWORD LINK for %s → %s", email, set_password_link
            )
            send_welcome_email(to_email=user.email, set_password_link=set_password_link)

        return user

    def admin_reset_password(self, user_id: int, new_password: str) -> User:
        from app.core.security import hash_password as _hash
        user = self.user_repository.get_by_id(user_id)
        if user is None:
            raise UserNotFoundError()
        user.password_hash = _hash(new_password)
        user.plain_password = new_password
        user.is_email_verified = True
        self.user_repository.save(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def list_users(self) -> list[tuple[User, list[str]]]:
        users = self.user_repository.list_all()
        return [(user, self.user_repository.get_role_names(user.id)) for user in users]

    def get_user(self, user_id: int) -> tuple[User, list[str]]:
        user = self.user_repository.get_by_id(user_id)
        if user is None:
            raise UserNotFoundError()
        return user, self.user_repository.get_role_names(user_id)
