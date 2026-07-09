import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.mysql import JSON

from app.database.base import Base
from app.models.payroll_config import PayrollModule


class EntryApprovalStatus(str, enum.Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    ON_HOLD  = "on_hold"
    PAID     = "paid"


class PayrollEntry(Base):
    """One row per employee per payroll run — stores all 15 calculation steps."""
    __tablename__ = "payroll_entries"

    id             : Mapped[int]          = mapped_column(primary_key=True, autoincrement=True)
    run_id         : Mapped[int]          = mapped_column(ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id    : Mapped[int]          = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_module : Mapped[PayrollModule]= mapped_column(
        Enum(PayrollModule, values_callable=lambda x: [e.value for e in x]), nullable=False
    )

    # ── Steps 1–4: Theoretical ───────────────────────────────────────────
    monthly_ctc    : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    pf             : Mapped[float]        = mapped_column(Numeric(10, 2), nullable=False, default=0)
    gross          : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    basic          : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    hra            : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    others         : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    per_day_salary : Mapped[float]        = mapped_column(Numeric(12, 4), nullable=False)

    # ── Steps 5–6: Actual (post-LOP) ─────────────────────────────────────
    lop_days       : Mapped[float]        = mapped_column(Numeric(5, 2), nullable=False, default=0)
    lop_amount     : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False, default=0)
    actual_gross   : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    actual_basic   : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    actual_hra     : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)
    actual_others  : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)

    # ── Step 7: OT ───────────────────────────────────────────────────────
    duty_hours     : Mapped[float]        = mapped_column(Numeric(7, 2), nullable=False, default=0)
    ot_hours       : Mapped[float]        = mapped_column(Numeric(7, 2), nullable=False, default=0)
    ot_rate        : Mapped[float]        = mapped_column(Numeric(12, 4), nullable=False, default=0)
    ot_multiplier  : Mapped[float]        = mapped_column(Numeric(4, 2), nullable=False, default=1)
    ot_amount      : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # ── Step 8: Earnings ─────────────────────────────────────────────────
    reimbursement  : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False, default=0)
    incentive      : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False, default=0)
    bonus          : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total_earnings : Mapped[float]        = mapped_column(Numeric(12, 2), nullable=False)

    # ── Steps 9–11: Statutory deductions ────────────────────────────────
    actual_pf      : Mapped[float]        = mapped_column(Numeric(10, 2), nullable=False, default=0)
    employer_pf    : Mapped[float]        = mapped_column(Numeric(10, 2), nullable=False, default=0)
    ee_esic        : Mapped[float]        = mapped_column(Numeric(10, 2), nullable=False, default=0)
    er_esic        : Mapped[float]        = mapped_column(Numeric(10, 2), nullable=False, default=0)
    pt             : Mapped[float]        = mapped_column(Numeric(10, 2), nullable=False, default=0)

    # ── Steps 12–14: Manual + Contract + Net ────────────────────────────
    advance            : Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False, default=0)
    other_deduction    : Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False, default=0)
    extra_deduction_1  : Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False, default=0)
    extra_deduction_2  : Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False, default=0)
    contract_deduction : Mapped[float]    = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total_deductions   : Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False)
    net_pay            : Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False)

    # ── Statutory flags (snapshot) ────────────────────────────────────
    pf_applicable           : Mapped[bool]       = mapped_column(nullable=False, default=False)
    esic_applicable         : Mapped[bool]       = mapped_column(nullable=False, default=False)
    esic_applicability_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Approval workflow ─────────────────────────────────────────────
    approval_status  : Mapped[EntryApprovalStatus] = mapped_column(
        Enum(EntryApprovalStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False, default=EntryApprovalStatus.PENDING,
    )
    hold_reason     : Mapped[str | None]  = mapped_column(Text, nullable=True)
    payment_mode    : Mapped[str]         = mapped_column(String(10), nullable=False, default="bank")
    paid_at         : Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_by         : Mapped[int | None]  = mapped_column(ForeignKey("users.id"), nullable=True)
    payment_remarks : Mapped[str | None]  = mapped_column(Text, nullable=True)

    # ── Audit ─────────────────────────────────────────────────────────
    calculation_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    computed_at    : Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())
    computed_by    : Mapped[int | None]   = mapped_column(ForeignKey("users.id"), nullable=True)

    run      : Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="entries")
    employee : Mapped["Employee"]   = relationship("Employee")
    payslip  : Mapped["PayrollPayslip | None"] = relationship(
        "PayrollPayslip", back_populates="entry", uselist=False, cascade="all, delete-orphan"
    )


class EmployeeModuleHistory(Base):
    """Tracks every payroll module transition for an employee."""
    __tablename__ = "employee_module_history"

    id             : Mapped[int]          = mapped_column(primary_key=True, autoincrement=True)
    employee_id    : Mapped[int]          = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    from_module    : Mapped[str | None]   = mapped_column(String(30), nullable=True)
    to_module      : Mapped[str]          = mapped_column(String(30), nullable=False)
    effective_date : Mapped[date]         = mapped_column(Date, nullable=False)
    changed_by     : Mapped[int | None]   = mapped_column(ForeignKey("users.id"), nullable=True)
    change_reason  : Mapped[str | None]   = mapped_column(Text, nullable=True)
    created_at     : Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())

    employee : Mapped["Employee"] = relationship("Employee")


class PayrollAuditLog(Base):
    """Immutable audit trail for every payroll action."""
    __tablename__ = "payroll_audit_log"

    id             : Mapped[int]      = mapped_column(primary_key=True, autoincrement=True)
    event_type     : Mapped[str]      = mapped_column(String(50), nullable=False, index=True)
    entity_type    : Mapped[str]      = mapped_column(String(20), nullable=False)
    entity_id      : Mapped[int]      = mapped_column(nullable=False, index=True)
    employee_id    : Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)
    run_id         : Mapped[int | None] = mapped_column(ForeignKey("payroll_runs.id"), nullable=True, index=True)
    previous_value : Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value      : Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason         : Mapped[str | None]  = mapped_column(Text, nullable=True)
    performed_by   : Mapped[int | None]  = mapped_column(ForeignKey("users.id"), nullable=True)
    performed_at   : Mapped[datetime]    = mapped_column(DateTime, server_default=func.now(), index=True)
    ip_address     : Mapped[str | None]  = mapped_column(String(45), nullable=True)


class PayrollPayslip(Base):
    __tablename__ = "payroll_payslips"

    id           : Mapped[int]          = mapped_column(primary_key=True, autoincrement=True)
    entry_id     : Mapped[int]          = mapped_column(ForeignKey("payroll_entries.id", ondelete="CASCADE"), nullable=False, unique=True)
    generated_at : Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())
    generated_by : Mapped[int | None]   = mapped_column(ForeignKey("users.id"), nullable=True)
    file_url     : Mapped[str | None]   = mapped_column(Text, nullable=True)
    file_key     : Mapped[str | None]   = mapped_column(String(500), nullable=True)
    emailed_at   : Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    entry : Mapped["PayrollEntry"] = relationship("PayrollEntry", back_populates="payslip")
