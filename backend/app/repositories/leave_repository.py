from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.holiday import Holiday
from app.models.leave_application import LeaveApplication, LeaveStatus
from app.models.leave_approval import LeaveApproval
from app.models.leave_balance import LeaveBalance
from app.models.leave_type import LeaveType
from app.models.pl_accrual_log import PLAccrualLog


class LeaveTypeRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, lt_id: int) -> LeaveType | None:
        return self.db.get(LeaveType, lt_id)

    def get_by_code(self, code: str) -> LeaveType | None:
        return self.db.scalar(select(LeaveType).where(LeaveType.code == code))

    def list_active(self) -> list[LeaveType]:
        return list(self.db.scalars(select(LeaveType).where(LeaveType.is_active.is_(True)).order_by(LeaveType.name)))

    def list_all(self) -> list[LeaveType]:
        return list(self.db.scalars(select(LeaveType).order_by(LeaveType.name)))

    def save(self, lt: LeaveType) -> LeaveType:
        self.db.add(lt)
        self.db.flush()
        return lt


class HolidayRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, h_id: int) -> Holiday | None:
        return self.db.get(Holiday, h_id)

    def get_by_date(self, d: date) -> Holiday | None:
        return self.db.scalar(select(Holiday).where(Holiday.holiday_date == d))

    def list_year(self, year: int) -> list[Holiday]:
        from sqlalchemy import extract
        return list(self.db.scalars(
            select(Holiday)
            .where(extract("year", Holiday.holiday_date) == year)
            .order_by(Holiday.holiday_date)
        ))

    def list_all(self) -> list[Holiday]:
        return list(self.db.scalars(select(Holiday).order_by(Holiday.holiday_date)))

    def holiday_dates_between(self, from_date: date, to_date: date) -> set[date]:
        rows = self.db.scalars(
            select(Holiday.holiday_date).where(
                Holiday.holiday_date >= from_date,
                Holiday.holiday_date <= to_date,
                Holiday.is_active.is_(True),
            )
        )
        return set(rows)

    def save(self, h: Holiday) -> Holiday:
        self.db.add(h)
        self.db.flush()
        return h

    def delete(self, h: Holiday) -> None:
        self.db.delete(h)
        self.db.flush()


class LeaveBalanceRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, employee_id: int, leave_type_id: int, year: int) -> LeaveBalance | None:
        return self.db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == leave_type_id,
                LeaveBalance.year == year,
            )
        )

    def list_for_employee(self, employee_id: int, year: int) -> list[LeaveBalance]:
        return list(self.db.scalars(
            select(LeaveBalance)
            .options(joinedload(LeaveBalance.leave_type))
            .where(LeaveBalance.employee_id == employee_id, LeaveBalance.year == year)
        ))

    def save(self, bal: LeaveBalance) -> LeaveBalance:
        self.db.add(bal)
        self.db.flush()
        return bal


class LeaveApplicationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, app_id: int) -> LeaveApplication | None:
        return self.db.scalar(
            select(LeaveApplication)
            .options(
                joinedload(LeaveApplication.employee),
                joinedload(LeaveApplication.leave_type),
                joinedload(LeaveApplication.approvals).joinedload(LeaveApproval.approver),
            )
            .where(LeaveApplication.id == app_id)
        )

    def list_for_employee(self, employee_id: int) -> list[LeaveApplication]:
        return list(self.db.scalars(
            select(LeaveApplication)
            .options(joinedload(LeaveApplication.leave_type), joinedload(LeaveApplication.approvals))
            .where(LeaveApplication.employee_id == employee_id)
            .order_by(LeaveApplication.applied_at.desc())
        ).unique())

    def list_pending_for_manager(self, manager_employee_id: int) -> list[LeaveApplication]:
        from app.models.employee import Employee
        return list(self.db.scalars(
            select(LeaveApplication)
            .join(LeaveApplication.employee)
            .options(
                joinedload(LeaveApplication.employee),
                joinedload(LeaveApplication.leave_type),
                joinedload(LeaveApplication.approvals),
            )
            .where(
                Employee.reporting_manager_id == manager_employee_id,
                LeaveApplication.status == LeaveStatus.PENDING,
            )
            .order_by(LeaveApplication.applied_at.desc())
        ).unique())

    def list_all(self, *, status: LeaveStatus | None = None) -> list[LeaveApplication]:
        q = (
            select(LeaveApplication)
            .options(
                joinedload(LeaveApplication.employee),
                joinedload(LeaveApplication.leave_type),
                joinedload(LeaveApplication.approvals).joinedload(LeaveApproval.approver),
            )
            .order_by(LeaveApplication.applied_at.desc())
        )
        if status:
            q = q.where(LeaveApplication.status == status)
        return list(self.db.scalars(q).unique())

    def save(self, app: LeaveApplication) -> LeaveApplication:
        self.db.add(app)
        self.db.flush()
        return app


class PLAccrualRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, employee_id: int, month: int, year: int) -> PLAccrualLog | None:
        return self.db.scalar(
            select(PLAccrualLog).where(
                PLAccrualLog.employee_id == employee_id,
                PLAccrualLog.month == month,
                PLAccrualLog.year == year,
            )
        )

    def list_for_employee(self, employee_id: int) -> list[PLAccrualLog]:
        return list(self.db.scalars(
            select(PLAccrualLog)
            .where(PLAccrualLog.employee_id == employee_id)
            .order_by(PLAccrualLog.year.desc(), PLAccrualLog.month.desc())
        ))

    def save(self, log: PLAccrualLog) -> PLAccrualLog:
        self.db.add(log)
        self.db.flush()
        return log
