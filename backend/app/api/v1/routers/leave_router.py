from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.exceptions import AppError
from app.database.session import get_db
from app.models.leave_application import LeaveStatus
from app.models.user import User
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.leave_schema import (
    CancelLeaveRequest,
    LeaveApplicationEdit,
    HolidayCreate,
    HolidayOut,
    HolidayUpdate,
    LeaveApplicationCreate,
    LeaveApplicationOut,
    LeaveApprovalCreate,
    LeaveApprovalOut,
    LeaveBalanceInit,
    LeaveBalanceOut,
    LeaveTypeCreate,
    LeaveTypeOut,
    LeaveTypeUpdate,
    PLAccrualCreate,
    PLAccrualOut,
)
from app.services.leave_service import (
    HolidayService,
    LeaveApplicationService,
    LeaveBalanceService,
    LeaveTypeService,
    PLAccrualService,
)

router = APIRouter(prefix="/leave", tags=["leave"])


def _is_hr_admin(user: User) -> bool:
    return any(r.role.name in ("SUPER_ADMIN", "HR_ADMIN", "EXECUTIVE_ASSISTANT") for r in user.user_roles)


def _get_employee_id(user: User, db: Session) -> int | None:
    """Return the employee record linked to this user (matched by email)."""
    emp_repo = EmployeeRepository(db)
    emp = emp_repo.get_by_email(user.email)
    return emp.id if emp else None


def _can_act_on_behalf(current_user: User, target_employee_id: int, caller_emp_id: int | None, db: Session) -> bool:
    if _is_hr_admin(current_user):
        return True
    if caller_emp_id:
        target_emp = EmployeeRepository(db).get_by_id(target_employee_id)
        if target_emp and target_emp.reporting_manager_id == caller_emp_id:
            return True
    return False


# ── Leave Types ───────────────────────────────────────────────────────────────

@router.get("/types", response_model=list[LeaveTypeOut])
def list_leave_types(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return LeaveTypeService(db).list_all()


@router.post("/types", response_model=LeaveTypeOut, status_code=201)
def create_leave_type(
    payload: LeaveTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return LeaveTypeService(db).create(payload)


@router.put("/types/{lt_id}", response_model=LeaveTypeOut)
def update_leave_type(
    lt_id: int,
    payload: LeaveTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return LeaveTypeService(db).update(lt_id, payload)


@router.delete("/types/{lt_id}", status_code=204)
def delete_leave_type(
    lt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    LeaveTypeService(db).delete(lt_id)


# ── Holidays ──────────────────────────────────────────────────────────────────

@router.get("/holidays", response_model=list[HolidayOut])
def list_holidays(
    year: int = Query(default=date.today().year),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return HolidayService(db).list_year(year)


@router.post("/holidays", response_model=HolidayOut, status_code=201)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return HolidayService(db).create(payload)


@router.put("/holidays/{h_id}", response_model=HolidayOut)
def update_holiday(
    h_id: int,
    payload: HolidayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return HolidayService(db).update(h_id, payload)


@router.delete("/holidays/{h_id}", status_code=204)
def delete_holiday(
    h_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    HolidayService(db).delete(h_id)


# ── Leave Balances ────────────────────────────────────────────────────────────

@router.post("/balances/init", response_model=list[LeaveBalanceOut])
def init_leave_balances(
    payload: LeaveBalanceInit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    balances = LeaveBalanceService(db).init_for_employee(payload)
    return [_balance_out(b) for b in balances]


@router.post("/balances/init-bulk")
def init_leave_balances_bulk(
    year: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return LeaveBalanceService(db).init_bulk(year)


@router.get("/balances/me", response_model=list[LeaveBalanceOut])
def my_balances(
    year: int = Query(default=date.today().year),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    if not emp_id:
        raise AppError("No employee record linked to your account", 404)
    balances = LeaveBalanceService(db).get_balances(emp_id, year)
    return [_balance_out(b) for b in balances]


@router.get("/balances/{employee_id}", response_model=list[LeaveBalanceOut])
def employee_balances(
    employee_id: int,
    year: int = Query(default=date.today().year),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    balances = LeaveBalanceService(db).get_balances(employee_id, year)
    return [_balance_out(b) for b in balances]


def _balance_out(bal) -> LeaveBalanceOut:
    return LeaveBalanceOut(
        id=bal.id,
        leave_type_id=bal.leave_type_id,
        leave_type_name=bal.leave_type.name,
        leave_type_code=bal.leave_type.code,
        year=bal.year,
        allocated=float(bal.allocated),
        carried_forward=float(bal.carried_forward),
        used=float(bal.used),
        remaining=bal.remaining,
    )


# ── Leave Applications ────────────────────────────────────────────────────────

@router.post("/applications", response_model=LeaveApplicationOut, status_code=201)
def apply_leave(
    payload: LeaveApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    caller_emp_id = _get_employee_id(current_user, db)

    if payload.on_behalf_of_employee_id:
        if not _can_act_on_behalf(current_user, payload.on_behalf_of_employee_id, caller_emp_id, db):
            raise AppError("You are not authorised to submit applications on behalf of this employee", 403)
        target_emp_id = payload.on_behalf_of_employee_id
        bypass = True
    else:
        if not caller_emp_id:
            raise AppError("No employee record linked to your account", 404)
        target_emp_id = caller_emp_id
        bypass = False

    app = LeaveApplicationService(db).apply(target_emp_id, payload, bypass_advance_check=bypass)
    return _app_out(app)


@router.get("/applications/me", response_model=list[LeaveApplicationOut])
def my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    if not emp_id:
        raise AppError("No employee record linked to your account", 404)
    return [_app_out(a) for a in LeaveApplicationService(db).list_for_employee(emp_id)]


@router.get("/applications", response_model=list[LeaveApplicationOut])
def list_applications(
    status: LeaveStatus | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return [_app_out(a) for a in LeaveApplicationService(db).list_all(status=status)]


@router.get("/applications/pending-for-me", response_model=list[LeaveApplicationOut])
def pending_for_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    if not emp_id:
        return []
    return [_app_out(a) for a in LeaveApplicationService(db).list_pending_for_manager(emp_id)]


@router.patch("/applications/{app_id}", response_model=LeaveApplicationOut)
def edit_leave(
    app_id: int,
    payload: LeaveApplicationEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not any(r.role.name in ("SUPER_ADMIN", "EXECUTIVE_ASSISTANT") for r in current_user.user_roles):
        raise AppError("Only SUPER_ADMIN or EXECUTIVE_ASSISTANT can edit leave applications", 403)
    app = LeaveApplicationService(db).edit(app_id, payload)
    return _app_out(app)


@router.post("/applications/{app_id}/cancel", response_model=LeaveApplicationOut)
def cancel_leave(
    app_id: int,
    payload: CancelLeaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    if not emp_id:
        raise AppError("No employee record linked to your account", 404)
    app = LeaveApplicationService(db).cancel(app_id, emp_id, payload.cancel_reason)
    return _app_out(app)


@router.post("/applications/{app_id}/decide", response_model=LeaveApplicationOut)
def decide_leave(
    app_id: int,
    payload: LeaveApprovalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_id = _get_employee_id(current_user, db)
    is_hr = _is_hr_admin(current_user)
    app = LeaveApplicationService(db).decide(
        app_id=app_id,
        approver_user_id=current_user.id,
        approver_employee_id=emp_id,
        payload=payload,
        is_hr_admin=is_hr,
    )
    return _app_out(app)


def _app_out(app) -> LeaveApplicationOut:
    emp = app.employee
    approvals = [
        LeaveApprovalOut(
            id=a.id,
            approver_id=a.approver_id,
            approver_name=f"{a.approver.first_name} {a.approver.last_name}",
            action=a.action,
            comment=a.comment,
            actioned_at=a.actioned_at,
        )
        for a in app.approvals
    ]
    return LeaveApplicationOut(
        id=app.id,
        employee_id=app.employee_id,
        employee_name=f"{emp.first_name} {emp.last_name}",
        employee_code=emp.employee_code,
        leave_type_id=app.leave_type_id,
        leave_type_name=app.leave_type.name,
        from_date=app.from_date,
        to_date=app.to_date,
        days=float(app.days),
        is_half_day=app.is_half_day,
        half_day_period=app.half_day_period,
        reason=app.reason,
        status=app.status,
        applied_at=app.applied_at,
        cancelled_at=app.cancelled_at,
        cancel_reason=app.cancel_reason,
        approvals=approvals,
    )


# ── PL Accrual ────────────────────────────────────────────────────────────────

@router.post("/pl-accrual", response_model=PLAccrualOut, status_code=201)
def process_pl_accrual(
    payload: PLAccrualCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return PLAccrualService(db).process(payload)


@router.get("/pl-accrual/{employee_id}", response_model=list[PLAccrualOut])
def get_pl_accrual_log(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_hr_admin(current_user):
        raise AppError("HR admin access required", 403)
    return PLAccrualService(db).list_for_employee(employee_id)
