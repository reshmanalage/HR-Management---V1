from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.dependencies import require_permission
from app.controllers.user_controller import UserController
from app.core.permissions import CREATE_USER, VIEW_USERS
from app.database.session import get_db
from app.models.user import User
from app.schemas.user_schema import CreateUserRequest, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: CreateUserRequest,
    request: Request,
    current_user: User = Depends(require_permission(CREATE_USER)),
    db: Session = Depends(get_db),
):
    return UserController(db).create_user(payload, current_user.id, request)


@router.get("", response_model=list[UserOut])
def list_users(
    current_user: User = Depends(require_permission(VIEW_USERS)),
    db: Session = Depends(get_db),
):
    return UserController(db).list_users()
