import enum

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class DeductionType(str, enum.Enum):
    LATE_ARRIVAL     = "late_arrival"
    EARLY_LEAVING    = "early_leaving"
    GRACE_EXCEEDED   = "grace_exceeded"
    ABSENCE          = "absence"          # absent without leave
    LEAVE_LOP        = "leave_lop"        # leave counted as LOP (1×)
    LEAVE_DOUBLE     = "leave_double"     # penalty leave (2×)
    MANUAL_OVERRIDE  = "manual_override"  # HR/admin manual correction


class AttendanceDeduction(Base):
    __tablename__ = "attendance_deductions"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    payroll_cycle_start: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD
    date: Mapped[str] = mapped_column(String(10))                 # YYYY-MM-DD
    deduction_type: Mapped[DeductionType] = mapped_column(SAEnum(DeductionType, native_enum=False))
    deduction_days: Mapped[float] = mapped_column(Numeric(6, 3))
    reason: Mapped[str | None] = mapped_column(Text)
    # True when an HR/admin manually overrode the system-calculated deduction.
    # System-calculated rows for the same day are suppressed but kept for audit.
    is_manual_override: Mapped[bool] = mapped_column(Boolean, default=False)

    employee: Mapped["Employee"] = relationship("Employee")
