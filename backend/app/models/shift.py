from sqlalchemy import Boolean, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    # start_time / end_time are None for flexible (mixed) shifts
    start_time: Mapped[str | None] = mapped_column(String(5))   # "HH:MM"
    end_time: Mapped[str | None] = mapped_column(String(5))     # "HH:MM"
    is_flexible: Mapped[bool] = mapped_column(Boolean, default=False)
    break_duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    grace_period_minutes: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Half-day cutoffs for LOP calculation.
    # If null, auto-computed as the shift midpoint (start + duration/2).
    half_day_late_cutoff: Mapped[str | None] = mapped_column(String(5))   # "HH:MM"
    half_day_early_cutoff: Mapped[str | None] = mapped_column(String(5))  # "HH:MM"
