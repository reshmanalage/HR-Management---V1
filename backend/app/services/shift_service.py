from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models.shift import Shift
from app.repositories.shift_repository import ShiftRepository
from app.schemas.shift_schema import ShiftCreate, ShiftUpdate


class ShiftService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ShiftRepository(db)

    def list_shifts(self) -> list[Shift]:
        return self.repo.list_all()

    def get_shift(self, shift_id: int) -> Shift:
        shift = self.repo.get_by_id(shift_id)
        if shift is None:
            raise NotFoundError("Shift not found")
        return shift

    def create_shift(self, payload: ShiftCreate) -> Shift:
        if self.repo.get_by_name(payload.name) is not None:
            raise ConflictError("A shift with this name already exists")
        shift = Shift(**payload.model_dump())
        self.repo.save(shift)
        self.db.commit()
        self.db.refresh(shift)
        return shift

    def update_shift(self, shift_id: int, payload: ShiftUpdate) -> Shift:
        shift = self.get_shift(shift_id)
        data = payload.model_dump(exclude_unset=True)
        if "name" in data and data["name"] != shift.name:
            if self.repo.get_by_name(data["name"]) is not None:
                raise ConflictError("A shift with this name already exists")
        for key, value in data.items():
            setattr(shift, key, value)
        self.db.commit()
        self.db.refresh(shift)
        return shift

    def delete_shift(self, shift_id: int) -> None:
        shift = self.get_shift(shift_id)
        self.repo.delete(shift)
        self.db.commit()
