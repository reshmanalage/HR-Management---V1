from datetime import date, datetime

from sqlalchemy import String, Boolean, Date, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database.base import Base


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_of_joining: Mapped[date | None] = mapped_column(Date, nullable=True)

    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    designation_id: Mapped[int | None] = mapped_column(ForeignKey("designations.id"), nullable=True)

    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    photo_drive_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    department: Mapped["Department | None"] = relationship("Department", back_populates="employees")
    designation: Mapped["Designation | None"] = relationship("Designation", back_populates="employees")
