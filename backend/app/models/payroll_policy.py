from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class PayrollPolicy(Base):
    """Singleton row (id=1) — company-wide payroll and attendance rules."""
    __tablename__ = "payroll_policy"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)

    # Payroll cycle
    cycle_start_day: Mapped[int] = mapped_column(Integer, default=21)   # 21st of month
    cycle_end_day: Mapped[int] = mapped_column(Integer, default=20)     # 20th of next month

    # Standard shift (used when employee has no assigned shift)
    shift_start: Mapped[str] = mapped_column(String(5), default="08:30")
    shift_end: Mapped[str] = mapped_column(String(5), default="19:00")

    # Grace period
    grace_period_minutes: Mapped[int] = mapped_column(Integer, default=10)
    max_grace_per_cycle: Mapped[int] = mapped_column(Integer, default=6)

    # Half-day cut-offs
    # If arriving AFTER this time → half-day late (requires half-day app + manager approval)
    half_day_late_cutoff: Mapped[str] = mapped_column(String(5), default="13:30")
    # If leaving BEFORE this time → half-day early (requires half-day app + manager approval)
    half_day_early_cutoff: Mapped[str] = mapped_column(String(5), default="14:30")

    # Paid leave eligibility
    min_attendance_for_paid_leave: Mapped[int] = mapped_column(Integer, default=21)

    # Max emergency leave applications allowed per calendar month
    emergency_leave_per_month: Mapped[int] = mapped_column(Integer, default=2)

    # LOP deduction method for late arrival / early leaving
    # "penalty"      → fixed tier deductions (0.5d, 1d, 2× etc.) — default
    # "actual_hours" → proportional deduction = minutes_missed / shift_duration
    # Applications (regularizations, leave) always take priority in both modes.
    deduction_mode: Mapped[str] = mapped_column(String(20), default="penalty")
