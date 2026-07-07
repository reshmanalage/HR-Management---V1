from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.exceptions import AppError
from app.database.session import get_db
from app.models.attendance_regularization import RegularizationStatus
from app.models.user import User
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.regularization_schema import (
    RegularizationCreate,
    RegularizationDecide,
    RegularizationOut,
)
from app.services.regularization_service import RegularizationService

router = APIRouter(prefix="/regularizations", tags=["regularizations"])


def _is_hr_admin(user: User) -> bool:
    return any(r.role.name in ("SUPER_ADMIN", "HR_ADMIN", "EXECUTIVE_ASSISTANT") for r in user.user_roles)


def _get_employee_id(user: User, db: Session) -> int | None:
    emp = EmployeeRepository(db).get_by_email(user.email)
    return emp.id if emp else None


def _out(rec) -> RegularizationOut:
    emp = rec.employee
    decider = rec.decided_by
    return RegularizationOut(
        id=rec.id,
        employee_id=rec.employee_id,
        employee_name=f"{emp.first_name} {emp.last_name}",
        employee_code=emp.employee_code,
        date=rec.date,
        type=rec.type,
        in_time=rec.in_time,
        out_time=rec.out_time,
        out_from=rec.out_from,
        out_till=rec.out_till,
        reason=rec.reason,
        status=rec.status,
        applied_at=rec.applied_at,
        decided_at=rec.decided_at,
        decided_by_name=f"{decider.first_name} {decider.last_name}" if decider else None,
        comment=rec.comment,
    )


@router.post("", response_model=RegularizationOut, status_code=201)
def apply(
    payload: RegularizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    if not emp_id:
        raise AppError("No employee record linked to your account", 404)
    return _out(RegularizationService(db).apply(emp_id, payload))


@router.get("/me", response_model=list[RegularizationOut])
def my_regularizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    if not emp_id:
        raise AppError("No employee record linked to your account", 404)
    return [_out(r) for r in RegularizationService(db).list_for_employee(emp_id)]


@router.get("", response_model=list[RegularizationOut])
def list_all(
    status: RegularizationStatus | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return [_out(r) for r in RegularizationService(db).list_all(status=status)]


@router.post("/{reg_id}/decide", response_model=RegularizationOut)
def decide(
    reg_id: int,
    payload: RegularizationDecide,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    emp_id = _get_employee_id(current_user, db)
    return _out(RegularizationService(db).decide(reg_id, emp_id, payload))


@router.post("/{reg_id}/cancel", response_model=RegularizationOut)
def cancel(
    reg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    if not emp_id:
        raise AppError("No employee record linked to your account", 404)
    return _out(RegularizationService(db).cancel(reg_id, emp_id))
