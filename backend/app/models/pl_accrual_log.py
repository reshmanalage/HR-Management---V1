from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class PLAccrualLog(Base):
    __tablename__ = "pl_accrual_logs"
    __table_args__ = (UniqueConstraint("employee_id", "month", "year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    month: Mapped[int] = mapped_column(Integer)
    year: Mapped[int] = mapped_column(Integer)
    days_present: Mapped[int] = mapped_column(Integer, default=0)
    qualified: Mapped[bool] = mapped_column(Boolean, default=False)
    pl_earned: Mapped[float] = mapped_column(Numeric(4, 2), default=0)
    processed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    employee: Mapped["Employee"] = relationship("Employee", back_populates="pl_accrual_logs")
