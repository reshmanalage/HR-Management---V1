from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.repositories.role_repository import RoleRepository
from app.schemas.user_schema import RoleOut

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleOut])
def list_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return RoleRepository(db).list_all()
