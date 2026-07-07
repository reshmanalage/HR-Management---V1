from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.exceptions import AppError
from app.database.session import get_db
from app.models.user import User
from app.models.user_module_access import MODULES, UserModuleAccess

router = APIRouter(prefix="/users", tags=["module-access"])


def _require_super_admin(user: User):
    if not any(r.role.name == "SUPER_ADMIN" for r in user.user_roles):
        raise AppError("SUPER_ADMIN access required", 403)


class ModuleAccessPayload(BaseModel):
    modules: list[str]


@router.get("/{user_id}/modules")
def get_user_modules(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _require_super_admin(current_user)
    rows = db.scalars(
        select(UserModuleAccess).where(UserModuleAccess.user_id == user_id)
    ).all()
    return {"user_id": user_id, "modules": [r.module for r in rows], "all_modules": MODULES}


@router.put("/{user_id}/modules")
def set_user_modules(
    user_id: int,
    payload: ModuleAccessPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _require_super_admin(current_user)
    invalid = [m for m in payload.modules if m not in MODULES]
    if invalid:
        raise AppError(f"Unknown modules: {invalid}", 400)

    db.query(UserModuleAccess).filter(UserModuleAccess.user_id == user_id).delete()
    for module in payload.modules:
        db.add(UserModuleAccess(user_id=user_id, module=module))
    db.commit()
    return {"user_id": user_id, "modules": payload.modules}
