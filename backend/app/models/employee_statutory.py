from datetime import date, datetime

from sqlalchemy import String, Boolean, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class EmployeeStatutory(Base):
    __tablename__ = "employee_statutory"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, unique=True)

    # PF / EPF
    uan_number: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    pf_member_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pf_eligible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    pf_joining_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    vpf_eligible: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    eps_eligible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    edli_eligible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # ESIC
    esic_ip_number: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    esic_eligible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    esic_joining_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    esic_dispensary: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Tax / Compliance
    pan_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    aadhaar_number: Mapped[str | None] = mapped_column(String(12), nullable=True)
    pt_state: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="State for Professional Tax slab")

    # KYC flags
    aadhaar_linked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    pan_linked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    bank_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    uan_activated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    kyc_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    employee: Mapped["Employee"] = relationship("Employee", back_populates="statutory")
