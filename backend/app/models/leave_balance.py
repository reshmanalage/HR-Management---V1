from sqlalchemy import Integer, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class LeaveBalance(Base):
    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("employee_id", "leave_type_id", "year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id", ondelete="CASCADE"))
    year: Mapped[int] = mapped_column(Integer)
    allocated: Mapped[float] = mapped_column(Numeric(6, 1), default=0)
    carried_forward: Mapped[float] = mapped_column(Numeric(6, 1), default=0)
    used: Mapped[float] = mapped_column(Numeric(6, 1), default=0)

    @property
    def remaining(self) -> float:
        return float(self.allocated) + float(self.carried_forward) - float(self.used)

    employee: Mapped["Employee"] = relationship("Employee", back_populates="leave_balances")
    leave_type: Mapped["LeaveType"] = relationship("LeaveType", back_populates="balances")
