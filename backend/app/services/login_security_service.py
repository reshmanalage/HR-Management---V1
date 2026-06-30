from datetime import datetime, timedelta

from app.core.config import settings
from app.core.exceptions import AccountLockedError
from app.models.user import User
from app.repositories.user_repository import UserRepository


class LoginSecurityService:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    def ensure_not_locked(self, user: User) -> None:
        if not user.is_locked:
            return

        if user.locked_until and user.locked_until <= datetime.utcnow():
            self._unlock(user)
            return

        raise AccountLockedError()

    def register_failed_attempt(self, user: User) -> None:
        user.failed_login_attempts += 1

        if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.is_locked = True
            user.locked_until = datetime.utcnow() + timedelta(minutes=settings.ACCOUNT_LOCK_MINUTES)

        self.user_repository.save(user)

    def register_successful_login(self, user: User) -> None:
        user.failed_login_attempts = 0
        user.is_locked = False
        user.locked_until = None
        self.user_repository.save(user)

    def _unlock(self, user: User) -> None:
        user.is_locked = False
        user.locked_until = None
        user.failed_login_attempts = 0
        self.user_repository.save(user)
