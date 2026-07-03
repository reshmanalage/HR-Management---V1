from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.shift_schema import ShiftCreate, ShiftOut, ShiftUpdate
from app.services.shift_service import ShiftService

router = APIRouter(prefix="/shifts", tags=["shifts"])


def _svc(db: Session = Depends(get_db)) -> ShiftService:
    return ShiftService(db)


@router.get("", response_model=list[ShiftOut])
def list_shifts(svc: ShiftService = Depends(_svc), _: User = Depends(get_current_user)):
    return svc.list_shifts()


@router.post("", response_model=ShiftOut, status_code=201)
def create_shift(payload: ShiftCreate, svc: ShiftService = Depends(_svc), _: User = Depends(get_current_user)):
    return svc.create_shift(payload)


@router.get("/{shift_id}", response_model=ShiftOut)
def get_shift(shift_id: int, svc: ShiftService = Depends(_svc), _: User = Depends(get_current_user)):
    return svc.get_shift(shift_id)


@router.patch("/{shift_id}", response_model=ShiftOut)
def update_shift(shift_id: int, payload: ShiftUpdate, svc: ShiftService = Depends(_svc), _: User = Depends(get_current_user)):
    return svc.update_shift(shift_id, payload)


@router.delete("/{shift_id}", status_code=204)
def delete_shift(shift_id: int, svc: ShiftService = Depends(_svc), _: User = Depends(get_current_user)):
    svc.delete_shift(shift_id)
