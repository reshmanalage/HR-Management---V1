import enum
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class HalfDayPeriod(str, enum.Enum):
    MORNING = "morning"
    AFTERNOON = "afternoon"


class LeaveApplication(Base):
    __tablename__ = "leave_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    from_date: Mapped[date] = mapped_column(Date)
    to_date: Mapped[date] = mapped_column(Date)
    days: Mapped[float] = mapped_column(Numeric(5, 1))
    is_half_day: Mapped[bool] = mapped_column(Boolean, default=False)
    half_day_period: Mapped[HalfDayPeriod | None] = mapped_column(SAEnum(HalfDayPeriod))
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[LeaveStatus] = mapped_column(SAEnum(LeaveStatus), default=LeaveStatus.PENDING)
    applied_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancel_reason: Mapped[str | None] = mapped_column(Text)

    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="leave_applications", foreign_keys=[employee_id]
    )
    leave_type: Mapped["LeaveType"] = relationship("LeaveType", back_populates="applications")
    approvals: Mapped[list["LeaveApproval"]] = relationship(
        "LeaveApproval", back_populates="application", cascade="all, delete-orphan"
    )
