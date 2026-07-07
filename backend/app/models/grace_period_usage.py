from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class GracePeriodUsage(Base):
    __tablename__ = "grace_period_usage"
    __table_args__ = (
        UniqueConstraint("employee_id", "payroll_cycle_start", name="uq_grace_emp_cycle"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    payroll_cycle_start: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD (the 20th)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    employee: Mapped["Employee"] = relationship("Employee")
