from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.attendance_regularization import (
    AttendanceRegularization,
    RegularizationStatus,
    RegularizationType,
)
from app.schemas.regularization_schema import RegularizationCreate, RegularizationDecide

_MIN_OOO_HOURS = 3


def _time_to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


class RegularizationService:
    def __init__(self, db: Session):
        self.db = db

    def apply(self, employee_id: int, payload: RegularizationCreate) -> AttendanceRegularization:
        t = payload.type

        if t == RegularizationType.LATE_COMING and not payload.in_time:
            raise AppError("in_time (expected arrival time) is required for late coming", 400)
        if t == RegularizationType.EARLY_GOING and not payload.out_time:
            raise AppError("out_time (early departure time) is required for early going", 400)
        if t == RegularizationType.OUT_OF_OFFICE:
            if not payload.out_from or not payload.out_till:
                raise AppError("out_from and out_till are required for out-of-office", 400)
            gap = _time_to_minutes(payload.out_till) - _time_to_minutes(payload.out_from)
            if gap < _MIN_OOO_HOURS * 60:
                raise AppError(f"Out-of-office duration must be at least {_MIN_OOO_HOURS} hours", 400)

        rec = AttendanceRegularization(
            employee_id=employee_id,
            date=payload.date,
            type=payload.type,
            in_time=payload.in_time,
            out_time=payload.out_time,
            out_from=payload.out_from,
            out_till=payload.out_till,
            reason=payload.reason,
            status=RegularizationStatus.PENDING,
        )
        self.db.add(rec)
        self.db.commit()
        self.db.refresh(rec)
        return rec

    def list_for_employee(self, employee_id: int) -> list[AttendanceRegularization]:
        return list(
            self.db.scalars(
                select(AttendanceRegularization)
                .where(AttendanceRegularization.employee_id == employee_id)
                .order_by(AttendanceRegularization.applied_at.desc())
            )
        )

    def list_pending(self) -> list[AttendanceRegularization]:
        return list(
            self.db.scalars(
                select(AttendanceRegularization)
                .where(AttendanceRegularization.status == RegularizationStatus.PENDING)
                .order_by(AttendanceRegularization.applied_at)
            )
        )

    def list_all(self, status: RegularizationStatus | None = None) -> list[AttendanceRegularization]:
        q = select(AttendanceRegularization).order_by(AttendanceRegularization.applied_at.desc())
        if status:
            q = q.where(AttendanceRegularization.status == status)
        return list(self.db.scalars(q))

    def decide(
        self,
        reg_id: int,
        decider_employee_id: int,
        payload: RegularizationDecide,
    ) -> AttendanceRegularization:
        rec = self.db.get(AttendanceRegularization, reg_id)
        if not rec:
            raise AppError("Regularization request not found", 404)
        if rec.status != RegularizationStatus.PENDING:
            raise AppError("Only pending requests can be actioned", 400)
        if payload.action not in (RegularizationStatus.APPROVED, RegularizationStatus.REJECTED):
            raise AppError("Action must be 'approved' or 'rejected'", 400)

        rec.status = payload.action
        rec.decided_at = datetime.utcnow()
        rec.decided_by_id = decider_employee_id
        rec.comment = payload.comment
        self.db.commit()
        self.db.refresh(rec)
        return rec

    def cancel(self, reg_id: int, employee_id: int) -> AttendanceRegularization:
        rec = self.db.get(AttendanceRegularization, reg_id)
        if not rec:
            raise AppError("Regularization request not found", 404)
        if rec.employee_id != employee_id:
            raise AppError("Cannot cancel another employee's request", 403)
        if rec.status != RegularizationStatus.PENDING:
            raise AppError("Only pending requests can be cancelled", 400)
        rec.status = RegularizationStatus.CANCELLED
        self.db.commit()
        self.db.refresh(rec)
        return rec
