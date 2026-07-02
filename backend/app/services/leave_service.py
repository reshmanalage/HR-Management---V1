from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.holiday import Holiday, HolidayType
from app.models.leave_application import HalfDayPeriod, LeaveApplication, LeaveStatus
from app.models.leave_approval import ApprovalAction, LeaveApproval
from app.models.leave_balance import LeaveBalance
from app.models.leave_type import LeaveType
from app.models.pl_accrual_log import PLAccrualLog
from app.repositories.leave_repository import (
    HolidayRepository,
    LeaveApplicationRepository,
    LeaveBalanceRepository,
    LeaveTypeRepository,
    PLAccrualRepository,
)
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.leave_schema import (
    HolidayCreate,
    HolidayUpdate,
    LeaveApplicationCreate,
    LeaveApprovalCreate,
    LeaveBalanceInit,
    LeaveTypeCreate,
    LeaveTypeUpdate,
    PLAccrualCreate,
)


def _count_working_days(from_date: date, to_date: date, holiday_dates: set[date]) -> float:
    days = 0
    current = from_date
    while current <= to_date:
        if current.weekday() < 5 and current not in holiday_dates:
            days += 1
        current += timedelta(days=1)
    return float(days)


class LeaveTypeService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = LeaveTypeRepository(db)

    def create(self, payload: LeaveTypeCreate) -> LeaveType:
        if self.repo.get_by_code(payload.code):
            raise AppError(f"Leave type with code '{payload.code}' already exists", 409)
        lt = LeaveType(**payload.model_dump())
        self.repo.save(lt)
        self.db.commit()
        self.db.refresh(lt)
        return lt

    def update(self, lt_id: int, payload: LeaveTypeUpdate) -> LeaveType:
        lt = self.repo.get_by_id(lt_id)
        if not lt:
            raise AppError("Leave type not found", 404)
        for k, v in payload.model_dump(exclude_none=True).items():
            setattr(lt, k, v)
        self.db.commit()
        self.db.refresh(lt)
        return lt

    def list_all(self) -> list[LeaveType]:
        return self.repo.list_all()

    def list_active(self) -> list[LeaveType]:
        return self.repo.list_active()

    def delete(self, lt_id: int) -> None:
        lt = self.repo.get_by_id(lt_id)
        if not lt:
            raise AppError("Leave type not found", 404)
        self.db.delete(lt)
        self.db.commit()


class HolidayService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = HolidayRepository(db)

    def create(self, payload: HolidayCreate) -> Holiday:
        if self.repo.get_by_date(payload.holiday_date):
            raise AppError(f"A holiday already exists on {payload.holiday_date}", 409)
        data = payload.model_dump()
        h = Holiday(name=data["name"], holiday_date=data["holiday_date"],
                    holiday_type=data["holiday_type"], description=data.get("description"))
        self.repo.save(h)
        self.db.commit()
        self.db.refresh(h)
        return h

    def update(self, h_id: int, payload: HolidayUpdate) -> Holiday:
        h = self.repo.get_by_id(h_id)
        if not h:
            raise AppError("Holiday not found", 404)
        for k, v in payload.model_dump(exclude_none=True).items():
            setattr(h, k, v)
        self.db.commit()
        self.db.refresh(h)
        return h

    def list_year(self, year: int) -> list[Holiday]:
        return self.repo.list_year(year)

    def list_all(self) -> list[Holiday]:
        return self.repo.list_all()

    def delete(self, h_id: int) -> None:
        h = self.repo.get_by_id(h_id)
        if not h:
            raise AppError("Holiday not found", 404)
        self.db.delete(h)
        self.db.commit()


class LeaveBalanceService:
    def __init__(self, db: Session):
        self.db = db
        self.bal_repo = LeaveBalanceRepository(db)
        self.lt_repo = LeaveTypeRepository(db)
        self.emp_repo = EmployeeRepository(db)

    def init_for_employee(self, payload: LeaveBalanceInit) -> list[LeaveBalance]:
        emp = self.emp_repo.get_by_id(payload.employee_id)
        if not emp:
            raise AppError("Employee not found", 404)
        leave_types = self.lt_repo.list_active()
        created = []
        for lt in leave_types:
            if lt.is_earned:
                # PL balances are built via accrual; start at 0
                days = 0.0
            else:
                days = float(lt.days_allowed)
            existing = self.bal_repo.get(payload.employee_id, lt.id, payload.year)
            if existing:
                continue
            bal = LeaveBalance(
                employee_id=payload.employee_id,
                leave_type_id=lt.id,
                year=payload.year,
                allocated=days,
            )
            self.bal_repo.save(bal)
            created.append(bal)
        self.db.commit()
        for b in created:
            self.db.refresh(b)
        return self.bal_repo.list_for_employee(payload.employee_id, payload.year)

    def get_balances(self, employee_id: int, year: int) -> list[LeaveBalance]:
        return self.bal_repo.list_for_employee(employee_id, year)


class LeaveApplicationService:
    def __init__(self, db: Session):
        self.db = db
        self.app_repo = LeaveApplicationRepository(db)
        self.bal_repo = LeaveBalanceRepository(db)
        self.lt_repo = LeaveTypeRepository(db)
        self.hol_repo = HolidayRepository(db)
        self.emp_repo = EmployeeRepository(db)

    def _get_days(self, from_date: date, to_date: date, is_half_day: bool) -> float:
        if is_half_day:
            return 0.5
        holiday_dates = self.hol_repo.holiday_dates_between(from_date, to_date)
        days = _count_working_days(from_date, to_date, holiday_dates)
        if days <= 0:
            raise AppError("No working days in the selected date range", 400)
        return days

    def apply(self, employee_id: int, payload: LeaveApplicationCreate) -> LeaveApplication:
        lt = self.lt_repo.get_by_id(payload.leave_type_id)
        if not lt or not lt.is_active:
            raise AppError("Leave type not found or inactive", 404)

        days = self._get_days(payload.from_date, payload.to_date, payload.is_half_day)
        year = payload.from_date.year

        # Balance check
        bal = self.bal_repo.get(employee_id, payload.leave_type_id, year)
        if not bal:
            raise AppError("No leave balance found. Please contact HR to initialise your leave balance.", 400)
        if bal.remaining < days:
            raise AppError(
                f"Insufficient balance. Available: {bal.remaining} days, Requested: {days} days", 400
            )

        app = LeaveApplication(
            employee_id=employee_id,
            leave_type_id=payload.leave_type_id,
            from_date=payload.from_date,
            to_date=payload.to_date,
            days=days,
            is_half_day=payload.is_half_day,
            half_day_period=payload.half_day_period,
            reason=payload.reason,
            status=LeaveStatus.PENDING,
        )
        self.app_repo.save(app)
        self.db.commit()
        return self.app_repo.get_by_id(app.id)

    def cancel(self, app_id: int, employee_id: int, cancel_reason: str | None) -> LeaveApplication:
        app = self.app_repo.get_by_id(app_id)
        if not app:
            raise AppError("Leave application not found", 404)
        if app.employee_id != employee_id:
            raise AppError("Cannot cancel another employee's leave", 403)
        if app.status not in (LeaveStatus.PENDING, LeaveStatus.APPROVED):
            raise AppError("Only pending or approved leaves can be cancelled", 400)

        if app.status == LeaveStatus.APPROVED:
            # Restore balance
            bal = self.bal_repo.get(app.employee_id, app.leave_type_id, app.from_date.year)
            if bal:
                bal.used = max(0.0, float(bal.used) - float(app.days))

        app.status = LeaveStatus.CANCELLED
        app.cancelled_at = datetime.utcnow()
        app.cancel_reason = cancel_reason
        self.db.commit()
        return self.app_repo.get_by_id(app_id)

    def decide(
        self,
        app_id: int,
        approver_user_id: int,
        approver_employee_id: int | None,
        payload: LeaveApprovalCreate,
        is_hr_admin: bool,
    ) -> LeaveApplication:
        app = self.app_repo.get_by_id(app_id)
        if not app:
            raise AppError("Leave application not found", 404)
        if app.status != LeaveStatus.PENDING:
            raise AppError("Only pending applications can be approved or rejected", 400)

        # Check authority: HR admin or the reporting manager
        if not is_hr_admin:
            emp = self.emp_repo.get_by_id(app.employee_id)
            if not emp or emp.reporting_manager_id != approver_employee_id:
                raise AppError("You are not authorised to approve this leave", 403)

        approval = LeaveApproval(
            application_id=app_id,
            approver_id=approver_user_id,
            action=payload.action,
            comment=payload.comment,
        )
        self.db.add(approval)

        if payload.action == ApprovalAction.APPROVED:
            app.status = LeaveStatus.APPROVED
            # Deduct from balance
            bal = self.bal_repo.get(app.employee_id, app.leave_type_id, app.from_date.year)
            if bal:
                bal.used = float(bal.used) + float(app.days)
        else:
            app.status = LeaveStatus.REJECTED

        self.db.commit()
        return self.app_repo.get_by_id(app_id)

    def get_application(self, app_id: int) -> LeaveApplication:
        app = self.app_repo.get_by_id(app_id)
        if not app:
            raise AppError("Leave application not found", 404)
        return app

    def list_for_employee(self, employee_id: int) -> list[LeaveApplication]:
        return self.app_repo.list_for_employee(employee_id)

    def list_all(self, status: LeaveStatus | None = None) -> list[LeaveApplication]:
        return self.app_repo.list_all(status=status)

    def list_pending_for_manager(self, manager_employee_id: int) -> list[LeaveApplication]:
        return self.app_repo.list_pending_for_manager(manager_employee_id)


class PLAccrualService:
    def __init__(self, db: Session):
        self.db = db
        self.accrual_repo = PLAccrualRepository(db)
        self.bal_repo = LeaveBalanceRepository(db)
        self.lt_repo = LeaveTypeRepository(db)
        self.emp_repo = EmployeeRepository(db)

    def process(self, payload: PLAccrualCreate) -> PLAccrualLog:
        emp = self.emp_repo.get_by_id(payload.employee_id)
        if not emp:
            raise AppError("Employee not found", 404)

        existing = self.accrual_repo.get(payload.employee_id, payload.month, payload.year)
        if existing:
            raise AppError(f"PL accrual for {payload.month}/{payload.year} already processed", 409)

        # Find the PL leave type
        pl_types = [lt for lt in self.lt_repo.list_active() if lt.is_earned]
        if not pl_types:
            raise AppError("No earned leave type (PL) configured", 400)
        pl_type = pl_types[0]

        threshold = pl_type.accrual_threshold_days or 21
        per_month = float(pl_type.accrual_per_month or 1.0)
        qualified = payload.days_present >= threshold
        pl_earned = per_month if qualified else 0.0

        log = PLAccrualLog(
            employee_id=payload.employee_id,
            month=payload.month,
            year=payload.year,
            days_present=payload.days_present,
            qualified=qualified,
            pl_earned=pl_earned,
        )
        self.accrual_repo.save(log)

        if qualified and pl_earned > 0:
            # Add PL to next month's year balance (or current year if Dec→Jan carry)
            target_year = payload.year + 1 if payload.month == 12 else payload.year
            bal = self.bal_repo.get(payload.employee_id, pl_type.id, target_year)
            if not bal:
                bal = LeaveBalance(
                    employee_id=payload.employee_id,
                    leave_type_id=pl_type.id,
                    year=target_year,
                    allocated=0,
                )
                self.db.add(bal)
                self.db.flush()
            bal.allocated = float(bal.allocated) + pl_earned

        self.db.commit()
        self.db.refresh(log)
        return log

    def list_for_employee(self, employee_id: int) -> list[PLAccrualLog]:
        return self.accrual_repo.list_for_employee(employee_id)
