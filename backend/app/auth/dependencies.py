from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.exceptions import InvalidTokenError, PermissionDeniedError
from app.core.security import decode_token
from app.database.session import get_db
from app.models.user import User
from app.repositories.permission_repository import PermissionRepository
from app.repositories.user_repository import UserRepository

bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise InvalidTokenError()

    if payload.get("type") != "access":
        raise InvalidTokenError()

    user_id = payload.get("sub")
    if user_id is None:
        raise InvalidTokenError()

    user = UserRepository(db).get_by_id(int(user_id))
    if user is None or not user.is_active:
        raise InvalidTokenError()

    return user


def require_permission(permission_code: str):
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        user_permissions = PermissionRepository(db).get_user_permission_codes(current_user.id)
        if permission_code not in user_permissions:
            raise PermissionDeniedError(permission_code)
        return current_user

    return dependency
