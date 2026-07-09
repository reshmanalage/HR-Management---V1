from __future__ import annotations

import datetime as _dt
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.payroll_config import PayrollModule
from app.models.payroll_run import RunStatus
from app.models.payroll_entry import EntryApprovalStatus


# ── Legacy LOP / Attendance schemas (used by LOPReportPage) ──────────────────

class PayrollPolicyOut(BaseModel):
    id: int
    cycle_start_day: int
    cycle_end_day: int
    shift_start: str
    shift_end: str
    grace_period_minutes: int
    max_grace_per_cycle: int
    half_day_late_cutoff: str
    half_day_early_cutoff: str
    min_attendance_for_paid_leave: int
    emergency_leave_per_month: int
    deduction_mode: str

    model_config = {"from_attributes": True}


class PayrollPolicyUpdate(BaseModel):
    shift_start: str | None = None
    shift_end: str | None = None
    grace_period_minutes: int | None = Field(None, ge=1, le=60)
    max_grace_per_cycle: int | None = Field(None, ge=0, le=20)
    half_day_late_cutoff: str | None = None
    half_day_early_cutoff: str | None = None
    min_attendance_for_paid_leave: int | None = Field(None, ge=1)
    emergency_leave_per_month: int | None = Field(None, ge=0)
    deduction_mode: str | None = Field(None, pattern="^(penalty|actual_hours)$")


class LOPCalculateRequest(BaseModel):
    cycle_start: _dt.date


class DeductionItemOut(BaseModel):
    id: int
    date: str
    deduction_type: str
    deduction_days: float
    reason: str | None
    is_manual_override: bool = False

    model_config = {"from_attributes": True}


class DeductionOverrideRequest(BaseModel):
    employee_id: int
    cycle_start: str
    date: str
    deduction_days: float = Field(..., ge=0.0, le=3.0)
    reason: str


class DeductionOverrideDelete(BaseModel):
    employee_id: int
    cycle_start: str
    date: str


class EmployeeLOPOut(BaseModel):
    employee_id: int
    employee_name: str
    employee_code: str | None
    total_deduction_days: float
    deductions: list[DeductionItemOut]


class LOPReportOut(BaseModel):
    cycle_start: str
    cycle_end: str
    employees: list[EmployeeLOPOut]


class DayAttendanceOut(BaseModel):
    date: str
    day_name: str
    is_weekend: bool
    is_holiday: bool
    holiday_name: str | None = None
    status: str
    in_time: str | None = None
    out_time: str | None = None
    working_minutes: int | None = None
    late_by_minutes: int = 0
    early_by_minutes: int = 0
    ot_minutes: int = 0
    deduction_days: float = 0.0
    deduction_reasons: list[str] = []
    deduction_ids: list[int] = []
    has_manual_override: bool = False
    deduction_actual_hours: float = 0.0
    deduction_penalty: float = 0.0


class EmployeeAttendanceSummary(BaseModel):
    employee_id: int
    employee_name: str
    employee_code: str | None = None
    shift_info: str | None = None
    shift_duration_minutes: int = 0
    days: list[DayAttendanceOut]
    total_present: int = 0
    total_absent: int = 0
    total_wo: int = 0
    total_holidays: int = 0
    total_leave: int = 0
    total_ot_hours: float = 0.0
    total_deduction_days: float = 0.0


class AttendanceReportOut(BaseModel):
    cycle_start: str
    cycle_end: str
    all_dates: list[str]
    employees: list[EmployeeAttendanceSummary]


# ── Run ───────────────────────────────────────────────────────────────────────

class PayrollRunCreate(BaseModel):
    period_year   : int = Field(..., ge=2020, le=2100)
    period_month  : int = Field(..., ge=1, le=12)
    payroll_module: PayrollModule
    total_days    : int = Field(..., ge=1, le=31)
    working_days  : int = Field(..., ge=1, le=31)


class PayrollRunOut(BaseModel):
    id            : int
    period_year   : int
    period_month  : int
    payroll_module: str
    total_days    : int
    working_days  : int
    status        : str
    created_by    : Optional[int]
    approved_by   : Optional[int]
    approved_at   : Optional[datetime]
    locked_at     : Optional[datetime]
    created_at    : datetime

    model_config = {"from_attributes": True}


# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceUpsert(BaseModel):
    lop_days  : float = Field(0, ge=0, le=31)
    ot_hours  : float = Field(0, ge=0)
    duty_hours: float = Field(0, ge=0)


class AttendanceOut(BaseModel):
    id         : int
    run_id     : int
    employee_id: int
    lop_days   : float
    ot_hours   : float
    duty_hours : float
    updated_at : datetime

    model_config = {"from_attributes": True}


# ── Manual Inputs ─────────────────────────────────────────────────────────────

class ManualInputUpsert(BaseModel):
    reimbursement    : float = Field(0, ge=0)
    incentive        : float = Field(0, ge=0)
    bonus            : float = Field(0, ge=0)
    advance          : float = Field(0, ge=0)
    other_deduction  : float = Field(0, ge=0)
    extra_deduction_1: float = Field(0, ge=0)
    extra_deduction_2: float = Field(0, ge=0)
    remarks          : Optional[str] = None


class ManualInputOut(BaseModel):
    id                : int
    run_id            : int
    employee_id       : int
    reimbursement     : float
    incentive         : float
    bonus             : float
    advance           : float
    other_deduction   : float
    extra_deduction_1 : float
    extra_deduction_2 : float
    remarks           : Optional[str]
    updated_at        : datetime

    model_config = {"from_attributes": True}


# ── Payroll Entry ─────────────────────────────────────────────────────────────

class PayrollEntryOut(BaseModel):
    id            : int
    run_id        : int
    employee_id   : int
    employee_name : Optional[str] = None
    employee_code : Optional[str] = None
    payroll_module: str

    @model_validator(mode="wrap")
    @classmethod
    def _populate_employee_name(cls, value, handler):
        instance = handler(value)
        if instance.employee_name is None and hasattr(value, "employee") and value.employee:
            emp = value.employee
            parts = [emp.first_name, emp.middle_name, emp.last_name]
            instance.employee_name = " ".join(p for p in parts if p)
            instance.employee_code = emp.employee_code
        return instance

    monthly_ctc   : float
    pf            : float
    gross         : float
    basic         : float
    hra           : float
    others        : float
    per_day_salary: float

    lop_days      : float
    lop_amount    : float
    actual_gross  : float
    actual_basic  : float
    actual_hra    : float
    actual_others : float

    duty_hours    : float
    ot_hours      : float
    ot_rate       : float
    ot_multiplier : float
    ot_amount     : float

    reimbursement : float
    incentive     : float
    bonus         : float
    total_earnings: float

    actual_pf     : float
    employer_pf   : float
    ee_esic       : float
    er_esic       : float
    pt            : float

    advance            : float
    other_deduction    : float
    extra_deduction_1  : float
    extra_deduction_2  : float
    contract_deduction : float
    total_deductions   : float
    net_pay            : float

    pf_applicable           : bool
    esic_applicable         : bool
    esic_applicability_notes: Optional[str]

    approval_status : str
    hold_reason     : Optional[str]
    payment_mode    : str
    paid_at         : Optional[datetime]
    payment_remarks : Optional[str]
    computed_at     : datetime

    model_config = {"from_attributes": True}


# ── Approval ──────────────────────────────────────────────────────────────────

class HoldRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class MarkPaidRequest(BaseModel):
    paid_at : datetime
    remarks : Optional[str] = None


class UnlockRequest(BaseModel):
    reason: str = Field(..., min_length=5)


# ── Module Transition ─────────────────────────────────────────────────────────

class ModuleChangeRequest(BaseModel):
    to_module      : PayrollModule
    effective_date : date
    reason         : str = Field(..., min_length=1)


class ModuleHistoryOut(BaseModel):
    id             : int
    employee_id    : int
    from_module    : Optional[str]
    to_module      : str
    effective_date : date
    change_reason  : Optional[str]
    created_at     : datetime

    model_config = {"from_attributes": True}


# ── Summary ───────────────────────────────────────────────────────────────────

class RunSummaryOut(BaseModel):
    run_id                  : int
    employee_count          : int
    total_gross             : float = 0
    total_actual_gross      : float = 0
    total_ot_amount         : float = 0
    total_earnings          : float = 0
    total_pf                : float = 0
    total_employer_pf       : float = 0
    total_ee_esic           : float = 0
    total_er_esic           : float = 0
    total_pt                : float = 0
    total_contract_deduction: float = 0
    total_deductions        : float = 0
    total_net_pay           : float = 0
    approval_status_counts  : dict  = Field(default_factory=dict)


# ── Config ────────────────────────────────────────────────────────────────────

class PFConfigOut(BaseModel):
    id            : int
    wage_pct      : float
    wage_ceiling  : float
    ee_rate       : float
    er_rate       : float
    effective_from: date
    effective_to  : Optional[date]

    model_config = {"from_attributes": True}


class ESICConfigOut(BaseModel):
    id            : int
    wage_ceiling  : float
    ee_rate       : float
    er_rate       : float
    effective_from: date
    effective_to  : Optional[date]

    model_config = {"from_attributes": True}


class SalaryConfigOut(BaseModel):
    id            : int
    basic_pct     : float
    hra_pct       : float
    others_pct    : float
    effective_from: date
    effective_to  : Optional[date]

    model_config = {"from_attributes": True}


class OTConfigOut(BaseModel):
    id            : int
    employee_type : str
    ot_multiplier : float
    break_minutes : int
    effective_from: date
    effective_to  : Optional[date]

    model_config = {"from_attributes": True}


class PTSlabOut(BaseModel):
    id            : int
    state         : str
    gender        : str
    min_gross     : float
    max_gross     : Optional[float]
    pt_amount     : float
    effective_from: date
    effective_to  : Optional[date]

    model_config = {"from_attributes": True}
