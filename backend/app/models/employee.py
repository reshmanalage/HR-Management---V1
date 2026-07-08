from datetime import date, datetime
import enum

from sqlalchemy import String, Boolean, Date, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class BloodGroup(str, enum.Enum):
    A_POS = "A+"
    A_NEG = "A-"
    B_POS = "B+"
    B_NEG = "B-"
    AB_POS = "AB+"
    AB_NEG = "AB-"
    O_POS = "O+"
    O_NEG = "O-"
    UNKNOWN = "Unknown"


class MaritalStatus(str, enum.Enum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    WIDOWED = "widowed"
    OTHER = "other"


class EmploymentType(str, enum.Enum):
    PERMANENT = "permanent"
    PROBATION = "probation"
    CONTRACT = "contract"
    INTERN = "intern"
    PART_TIME = "part_time"
    CONSULTANT = "consultant"


class EmployeeCategory(str, enum.Enum):
    OFFICE_STAFF = "office_staff"
    WORKER = "worker"
    MANAGEMENT = "management"
    SECURITY = "security"
    HOUSEKEEPING = "housekeeping"


class PaymentMode(str, enum.Enum):
    CASH = "cash"
    CONSULTANT = "consultant"
    BANK = "bank"


class EmployeeStatus(str, enum.Enum):
    ACTIVE = "active"
    PROBATION = "probation"
    NOTICE_PERIOD = "notice_period"
    INACTIVE = "inactive"
    TERMINATED = "terminated"


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    biometric_code: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)

    # Name
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Personal
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_group: Mapped[BloodGroup | None] = mapped_column(Enum(BloodGroup), nullable=True)
    marital_status: Mapped[MaritalStatus | None] = mapped_column(Enum(MaritalStatus), nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    religion: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Contact
    personal_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company_email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    # keep email as alias for company_email for backward compat
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mobile_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alternate_mobile: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Employment
    date_of_joining: Mapped[date | None] = mapped_column(Date, nullable=True)
    confirmation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    resignation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    relieving_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    employment_type: Mapped[EmploymentType | None] = mapped_column(Enum(EmploymentType), nullable=True)
    employee_category: Mapped[EmployeeCategory | None] = mapped_column(Enum(EmployeeCategory), nullable=True)
    payment_mode: Mapped[PaymentMode | None] = mapped_column(Enum(PaymentMode), nullable=True)
    employee_status: Mapped[EmployeeStatus] = mapped_column(
        Enum(EmployeeStatus), nullable=False, default=EmployeeStatus.ACTIVE
    )

    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    designation_id: Mapped[int | None] = mapped_column(ForeignKey("designations.id"), nullable=True)
    reporting_manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    branch: Mapped[str | None] = mapped_column(String(150), nullable=True)
    location: Mapped[str | None] = mapped_column(String(150), nullable=True)
    grade: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shift: Mapped[str | None] = mapped_column(String(100), nullable=True)   # legacy display name
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Photo
    photo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    photo_drive_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Legacy flat address (kept for migration safety, replaced by address table)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    department: Mapped["Department | None"] = relationship("Department", back_populates="employees")
    designation: Mapped["Designation | None"] = relationship("Designation", back_populates="employees")
    shift_obj: Mapped["Shift | None"] = relationship("Shift", foreign_keys=[shift_id])
    reporting_manager: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[reporting_manager_id], remote_side="Employee.id"
    )
    addresses: Mapped[list["EmployeeAddress"]] = relationship(
        "EmployeeAddress", back_populates="employee", cascade="all, delete-orphan"
    )
    documents: Mapped[list["EmployeeDocument"]] = relationship(
        "EmployeeDocument", back_populates="employee", cascade="all, delete-orphan"
    )
    bank_accounts: Mapped[list["EmployeeBankAccount"]] = relationship(
        "EmployeeBankAccount", back_populates="employee", cascade="all, delete-orphan"
    )
    statutory: Mapped["EmployeeStatutory | None"] = relationship(
        "EmployeeStatutory", back_populates="employee", uselist=False, cascade="all, delete-orphan"
    )
    leave_balances: Mapped[list["LeaveBalance"]] = relationship(
        "LeaveBalance", back_populates="employee", cascade="all, delete-orphan"
    )
    leave_applications: Mapped[list["LeaveApplication"]] = relationship(
        "LeaveApplication", back_populates="employee", cascade="all, delete-orphan",
        foreign_keys="LeaveApplication.employee_id",
    )
    pl_accrual_logs: Mapped[list["PLAccrualLog"]] = relationship(
        "PLAccrualLog", back_populates="employee", cascade="all, delete-orphan"
    )
    regularizations: Mapped[list["AttendanceRegularization"]] = relationship(
        "AttendanceRegularization", back_populates="employee", cascade="all, delete-orphan",
        foreign_keys="AttendanceRegularization.employee_id",
    )
