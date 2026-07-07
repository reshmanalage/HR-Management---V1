import datetime
from pydantic import BaseModel, Field


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
    deduction_mode: str  # "penalty" | "actual_hours"

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
    cycle_start: datetime.date  # must be the 20th of a month


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
    cycle_start: str   # YYYY-MM-DD
    date: str          # YYYY-MM-DD
    deduction_days: float = Field(..., ge=0.0, le=3.0)
    reason: str        # HR must supply a reason for the override


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


# ── Attendance Report (full daily grid) ──────────────────────────────────────

class DayAttendanceOut(BaseModel):
    date: str
    day_name: str          # Mon, Tue, …
    is_weekend: bool
    is_holiday: bool
    holiday_name: str | None = None
    status: str            # P / A / WO / H / LV
    in_time: str | None = None
    out_time: str | None = None
    working_minutes: int | None = None
    late_by_minutes: int = 0      # minutes after shift start (0 = on time / early)
    early_by_minutes: int = 0     # minutes before shift end (0 = on time / stayed late)
    ot_minutes: int = 0           # >0 on normal days when out ≥60 min past shift end;
                                  # on WO/Holiday full duration counts as OT
    deduction_days: float = 0.0
    deduction_reasons: list[str] = []
    deduction_ids: list[int] = []          # IDs of AttendanceDeduction rows for this day
    has_manual_override: bool = False      # True when an HR override exists for this day
    # Pre-computed values for the two calculation modes (for the HR override UI)
    deduction_actual_hours: float = 0.0   # (late_mins + early_mins) / shift_duration
    deduction_penalty: float = 0.0        # system penalty-tier rows total (0 if LOP not run)


class EmployeeAttendanceSummary(BaseModel):
    employee_id: int
    employee_name: str
    employee_code: str | None = None
    shift_info: str | None = None          # e.g. "General (09:00–18:00)"
    shift_duration_minutes: int = 0        # shift_end - shift_start in minutes
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
