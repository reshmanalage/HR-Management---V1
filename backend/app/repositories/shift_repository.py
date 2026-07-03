from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.shift import Shift


class ShiftRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[Shift]:
        return list(self.db.scalars(select(Shift).order_by(Shift.name)))

    def get_by_id(self, shift_id: int) -> Shift | None:
        return self.db.get(Shift, shift_id)

    def get_by_name(self, name: str) -> Shift | None:
        return self.db.scalar(select(Shift).where(Shift.name == name))

    def save(self, shift: Shift) -> Shift:
        self.db.add(shift)
        self.db.flush()
        return shift

    def delete(self, shift: Shift) -> None:
        self.db.delete(shift)
        self.db.flush()
