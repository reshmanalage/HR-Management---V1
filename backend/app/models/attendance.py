from sqlalchemy import Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Cycle period this record belongs to
    cycle_start: Mapped[str] = mapped_column(String(10))  # "YYYY-MM-DD"
    cycle_end: Mapped[str] = mapped_column(String(10))

    # Raw values from the biometric report (no FK required)
    raw_employee_code: Mapped[str] = mapped_column(String(20))
    raw_employee_name: Mapped[str] = mapped_column(String(200))

    # Linked employee (nullable — may not match if code differs)
    employee_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    date: Mapped[str] = mapped_column(String(10))  # "YYYY-MM-DD"
    status: Mapped[str | None] = mapped_column(String(10))   # P / A / WO / WOP

    in_time: Mapped[str | None] = mapped_column(String(5))   # "HH:MM"
    out_time: Mapped[str | None] = mapped_column(String(5))  # "HH:MM"
    duration_minutes: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (
        UniqueConstraint("cycle_start", "raw_employee_code", "date", name="uq_attendance_cycle_emp_date"),
    )
