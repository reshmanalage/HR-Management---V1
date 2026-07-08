import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class RevisionType(str, enum.Enum):
    JOINING    = "joining"
    APPRAISAL  = "appraisal"
    PROMOTION  = "promotion"
    CORRECTION = "correction"


class EmployeeSalaryRevision(Base):
    __tablename__ = "employee_salary_revisions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )

    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    ctc: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    # optional breakdown (all nullable — fill what you know)
    basic:       Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    hra:         Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    allowances:  Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    revision_type: Mapped[RevisionType] = mapped_column(
        Enum(RevisionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=RevisionType.JOINING,
    )
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    employee: Mapped["Employee"] = relationship("Employee", back_populates="salary_revisions")
