import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class RegularizationType(str, enum.Enum):
    LATE_COMING = "late_coming"
    EARLY_GOING = "early_going"
    HALF_DAY = "half_day"
    OUT_OF_OFFICE = "out_of_office"


class RegularizationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class AttendanceRegularization(Base):
    __tablename__ = "attendance_regularizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[RegularizationType] = mapped_column(SAEnum(RegularizationType))
    in_time: Mapped[str | None] = mapped_column(String(5), nullable=True, comment="HH:MM actual in time")
    out_time: Mapped[str | None] = mapped_column(String(5), nullable=True, comment="HH:MM actual out time")
    out_from: Mapped[str | None] = mapped_column(String(5), nullable=True, comment="HH:MM out-of-office start (out_of_office type)")
    out_till: Mapped[str | None] = mapped_column(String(5), nullable=True, comment="HH:MM out-of-office end (out_of_office type)")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RegularizationStatus] = mapped_column(
        SAEnum(RegularizationStatus), default=RegularizationStatus.PENDING
    )
    applied_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id], back_populates="regularizations")
    decided_by: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[decided_by_id])
