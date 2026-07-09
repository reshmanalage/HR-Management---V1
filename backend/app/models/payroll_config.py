import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Numeric, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class PayrollModule(str, enum.Enum):
    PROBATION_OFFICE  = "probation_office"
    PROBATION_WORKER  = "probation_worker"
    PERMANENT_OFFICE  = "permanent_office"
    PERMANENT_WORKER  = "permanent_worker"
    CONTRACT_OFFICE   = "contract_office"
    CONTRACT_WORKER   = "contract_worker"
    CONSULTANT_OFFICE = "consultant_office"
    CONSULTANT_WORKER = "consultant_worker"
    CONSULTANT_HK     = "consultant_housekeeping"
    CONSULTANT_SEC    = "consultant_security"
    CASH_OFFICE       = "cash_office"
    CASH_WORKER       = "cash_worker"


class OTEmployeeType(str, enum.Enum):
    OFFICE_STAFF = "office_staff"
    WORKER       = "worker"
    HOUSEKEEPING = "housekeeping"
    SECURITY     = "security"


class PTGender(str, enum.Enum):
    MALE   = "male"
    FEMALE = "female"
    ALL    = "all"


# ---------------------------------------------------------------------------
# PF Configuration
# ---------------------------------------------------------------------------
class PayrollPFConfig(Base):
    __tablename__ = "payroll_pf_config"

    id             : Mapped[int]        = mapped_column(primary_key=True, autoincrement=True)
    wage_pct       : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)   # 0.8000
    wage_ceiling   : Mapped[float]      = mapped_column(Numeric(10, 2), nullable=False)  # 15000.00
    ee_rate        : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)   # 0.1200
    er_rate        : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)   # 0.1200
    effective_from : Mapped[date]       = mapped_column(Date, nullable=False)
    effective_to   : Mapped[date | None]= mapped_column(Date, nullable=True)
    created_at     : Mapped[datetime]   = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("effective_from", name="uq_pf_effective_from"),)


# ---------------------------------------------------------------------------
# ESIC Configuration
# ---------------------------------------------------------------------------
class PayrollESICConfig(Base):
    __tablename__ = "payroll_esic_config"

    id             : Mapped[int]        = mapped_column(primary_key=True, autoincrement=True)
    wage_ceiling   : Mapped[float]      = mapped_column(Numeric(10, 2), nullable=False)  # 21000.00
    ee_rate        : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)   # 0.0075
    er_rate        : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)   # 0.0325
    effective_from : Mapped[date]       = mapped_column(Date, nullable=False)
    effective_to   : Mapped[date | None]= mapped_column(Date, nullable=True)
    created_at     : Mapped[datetime]   = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("effective_from", name="uq_esic_effective_from"),)


# ---------------------------------------------------------------------------
# Salary Structure (Basic / HRA / Others ratios)
# ---------------------------------------------------------------------------
class PayrollSalaryConfig(Base):
    __tablename__ = "payroll_salary_config"

    id             : Mapped[int]        = mapped_column(primary_key=True, autoincrement=True)
    basic_pct      : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)  # 0.5000
    hra_pct        : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)  # 0.2000
    others_pct     : Mapped[float]      = mapped_column(Numeric(5, 4), nullable=False)  # 0.3000
    effective_from : Mapped[date]       = mapped_column(Date, nullable=False)
    effective_to   : Mapped[date | None]= mapped_column(Date, nullable=True)
    created_at     : Mapped[datetime]   = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("effective_from", name="uq_sal_effective_from"),)


# ---------------------------------------------------------------------------
# OT Configuration (per employee type)
# ---------------------------------------------------------------------------
class PayrollOTConfig(Base):
    __tablename__ = "payroll_ot_config"

    id              : Mapped[int]        = mapped_column(primary_key=True, autoincrement=True)
    employee_type   : Mapped[OTEmployeeType] = mapped_column(
        Enum(OTEmployeeType, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    ot_multiplier   : Mapped[float]      = mapped_column(Numeric(4, 2), nullable=False)
    break_minutes   : Mapped[int]        = mapped_column(SmallInteger, nullable=False, default=31)
    effective_from  : Mapped[date]       = mapped_column(Date, nullable=False)
    effective_to    : Mapped[date | None]= mapped_column(Date, nullable=True)
    created_at      : Mapped[datetime]   = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("employee_type", "effective_from", name="uq_ot_type_effective_from"),
    )


# ---------------------------------------------------------------------------
# PT Slabs (state-wise, gender-wise)
# ---------------------------------------------------------------------------
class PayrollPTSlab(Base):
    __tablename__ = "payroll_pt_slabs"

    id             : Mapped[int]         = mapped_column(primary_key=True, autoincrement=True)
    state          : Mapped[str]         = mapped_column(String(50), nullable=False)
    gender         : Mapped[PTGender]    = mapped_column(
        Enum(PTGender, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    min_gross      : Mapped[float]       = mapped_column(Numeric(12, 2), nullable=False)
    max_gross      : Mapped[float | None]= mapped_column(Numeric(12, 2), nullable=True)  # NULL = no cap
    pt_amount      : Mapped[float]       = mapped_column(Numeric(8, 2), nullable=False)
    effective_from : Mapped[date]        = mapped_column(Date, nullable=False)
    effective_to   : Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at     : Mapped[datetime]    = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("state", "gender", "min_gross", "effective_from", name="uq_pt_slab"),
    )


# ---------------------------------------------------------------------------
# Module-level toggles (pf_enabled, esic_enabled, etc.)
# ---------------------------------------------------------------------------
class PayrollModuleConfig(Base):
    __tablename__ = "payroll_module_config"

    id                      : Mapped[int]          = mapped_column(primary_key=True, autoincrement=True)
    payroll_module          : Mapped[PayrollModule] = mapped_column(
        Enum(PayrollModule, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    pf_enabled              : Mapped[bool]         = mapped_column(nullable=False, default=False)
    esic_enabled            : Mapped[bool]         = mapped_column(nullable=False, default=False)
    pt_enabled              : Mapped[bool]         = mapped_column(nullable=False, default=False)
    ot_enabled              : Mapped[bool]         = mapped_column(nullable=False, default=True)
    contract_deduction_rate : Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    effective_from          : Mapped[date]         = mapped_column(Date, nullable=False)
    effective_to            : Mapped[date | None]  = mapped_column(Date, nullable=True)
    created_at              : Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("payroll_module", "effective_from", name="uq_module_config"),
    )
