import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.payroll_config import PayrollModule


class RunStatus(str, enum.Enum):
    DRAFT      = "draft"
    PROCESSING = "processing"
    APPROVED   = "approved"
    LOCKED     = "locked"


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id             : Mapped[int]          = mapped_column(primary_key=True, autoincrement=True)
    period_year    : Mapped[int]          = mapped_column(SmallInteger, nullable=False)
    period_month   : Mapped[int]          = mapped_column(SmallInteger, nullable=False)
    payroll_module : Mapped[PayrollModule]= mapped_column(
        Enum(PayrollModule, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    total_days     : Mapped[int]          = mapped_column(SmallInteger, nullable=False)
    working_days   : Mapped[int]          = mapped_column(SmallInteger, nullable=False)
    status         : Mapped[RunStatus]    = mapped_column(
        Enum(RunStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False, default=RunStatus.DRAFT,
    )
    created_by     : Mapped[int | None]   = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_by    : Mapped[int | None]   = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at    : Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    locked_by      : Mapped[int | None]   = mapped_column(ForeignKey("users.id"), nullable=True)
    locked_at      : Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    unlock_reason  : Mapped[str | None]   = mapped_column(Text, nullable=True)
    created_at     : Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())

    entries: Mapped[list["PayrollEntry"]] = relationship(
        "PayrollEntry", back_populates="run", cascade="all, delete-orphan"
    )
    attendances: Mapped[list["PayrollAttendance"]] = relationship(
        "PayrollAttendance", back_populates="run", cascade="all, delete-orphan"
    )
    manual_inputs: Mapped[list["PayrollManualInput"]] = relationship(
        "PayrollManualInput", back_populates="run", cascade="all, delete-orphan"
    )


class PayrollAttendance(Base):
    __tablename__ = "payroll_attendance"

    id          : Mapped[int]   = mapped_column(primary_key=True, autoincrement=True)
    run_id      : Mapped[int]   = mapped_column(ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id : Mapped[int]   = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    lop_days    : Mapped[float] = mapped_column(nullable=False, default=0)
    ot_hours    : Mapped[float] = mapped_column(nullable=False, default=0)
    duty_hours  : Mapped[float] = mapped_column(nullable=False, default=0)
    entered_by  : Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at  : Mapped[datetime]   = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    run      : Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="attendances")
    employee : Mapped["Employee"]   = relationship("Employee")


class PayrollManualInput(Base):
    __tablename__ = "payroll_manual_inputs"

    id                : Mapped[int]   = mapped_column(primary_key=True, autoincrement=True)
    run_id            : Mapped[int]   = mapped_column(ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id       : Mapped[int]   = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    reimbursement     : Mapped[float] = mapped_column(nullable=False, default=0)
    incentive         : Mapped[float] = mapped_column(nullable=False, default=0)
    bonus             : Mapped[float] = mapped_column(nullable=False, default=0)
    advance           : Mapped[float] = mapped_column(nullable=False, default=0)
    other_deduction   : Mapped[float] = mapped_column(nullable=False, default=0)
    extra_deduction_1 : Mapped[float] = mapped_column(nullable=False, default=0)
    extra_deduction_2 : Mapped[float] = mapped_column(nullable=False, default=0)
    remarks           : Mapped[str | None] = mapped_column(Text, nullable=True)
    entered_by        : Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at        : Mapped[datetime]   = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    run      : Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="manual_inputs")
    employee : Mapped["Employee"]   = relationship("Employee")
