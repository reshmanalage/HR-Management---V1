from sqlalchemy import String, Boolean, Numeric, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class LeaveType(Base):
    __tablename__ = "leave_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    days_allowed: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)
    carry_forward: Mapped[bool] = mapped_column(Boolean, default=False)
    max_carry_forward_days: Mapped[float | None] = mapped_column(Numeric(5, 1))
    # PL (earned leave) config
    is_earned: Mapped[bool] = mapped_column(Boolean, default=False)
    accrual_threshold_days: Mapped[int | None] = mapped_column(Integer)
    accrual_per_month: Mapped[float | None] = mapped_column(Numeric(4, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    advance_days: Mapped[int] = mapped_column(Integer, default=0, comment="Min days in advance required to apply (0 = no restriction)")
    # LOP penalty flags
    is_emergency: Mapped[bool] = mapped_column(Boolean, default=False)
    is_long_leave: Mapped[bool] = mapped_column(Boolean, default=False)

    balances: Mapped[list["LeaveBalance"]] = relationship("LeaveBalance", back_populates="leave_type")
    applications: Mapped[list["LeaveApplication"]] = relationship("LeaveApplication", back_populates="leave_type")
