from __future__ import annotations

import datetime as dt
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.holiday import HolidayType
from app.models.leave_application import HalfDayPeriod, LeaveStatus
from app.models.leave_approval import ApprovalAction


# ── Leave Type ────────────────────────────────────────────────────────────────

class LeaveTypeCreate(BaseModel):
    name: str
    code: str
    description: str | None = None
    days_allowed: float = 0
    is_paid: bool = True
    carry_forward: bool = False
    max_carry_forward_days: float | None = None
    is_earned: bool = False
    accrual_threshold_days: int | None = None
    accrual_per_month: float | None = None
    advance_days: int = 0
    is_emergency: bool = False
    is_long_leave: bool = False


class LeaveTypeUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    days_allowed: float | None = None
    is_paid: bool | None = None
    carry_forward: bool | None = None
    max_carry_forward_days: float | None = None
    is_earned: bool | None = None
    accrual_threshold_days: int | None = None
    accrual_per_month: float | None = None
    is_active: bool | None = None
    advance_days: int | None = None
    is_emergency: bool | None = None
    is_long_leave: bool | None = None


class LeaveTypeOut(BaseModel):
    id: int
    name: str
    code: str
    description: str | None
    days_allowed: float
    is_paid: bool
    carry_forward: bool
    max_carry_forward_days: float | None
    is_earned: bool
    accrual_threshold_days: int | None
    accrual_per_month: float | None
    is_active: bool
    advance_days: int
    is_emergency: bool
    is_long_leave: bool

    model_config = {"from_attributes": True}


# ── Holiday ───────────────────────────────────────────────────────────────────

class HolidayCreate(BaseModel):
    name: str
    holiday_date: dt.date
    holiday_type: HolidayType = HolidayType.NATIONAL
    description: str | None = None


class HolidayUpdate(BaseModel):
    name: str | None = None
    holiday_date: dt.date | None = None
    holiday_type: HolidayType | None = None
    description: str | None = None
    is_active: bool | None = None


class HolidayOut(BaseModel):
    id: int
    name: str
    holiday_date: dt.date
    holiday_type: HolidayType
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}


# ── Leave Balance ─────────────────────────────────────────────────────────────

class LeaveBalanceInit(BaseModel):
    employee_id: int
    year: int


class LeaveBalanceOut(BaseModel):
    id: int
    leave_type_id: int
    leave_type_name: str
    leave_type_code: str
    year: int
    allocated: float
    carried_forward: float
    used: float
    remaining: float

    model_config = {"from_attributes": True}


# ── Leave Approval ────────────────────────────────────────────────────────────

class LeaveApprovalCreate(BaseModel):
    action: ApprovalAction
    comment: str | None = None


class LeaveApprovalOut(BaseModel):
    id: int
    approver_id: int
    approver_name: str
    action: ApprovalAction
    comment: str | None
    actioned_at: dt.datetime

    model_config = {"from_attributes": True}


# ── Leave Application ─────────────────────────────────────────────────────────

class LeaveApplicationCreate(BaseModel):
    leave_type_id: int
    from_date: dt.date
    to_date: dt.date
    is_half_day: bool = False
    half_day_period: HalfDayPeriod | None = None
    reason: str | None = None
    on_behalf_of_employee_id: int | None = None

    @field_validator("to_date")
    @classmethod
    def to_after_from(cls, v, info):
        if "from_date" in info.data and v < info.data["from_date"]:
            raise ValueError("to_date must be on or after from_date")
        return v


class LeaveApplicationOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    employee_code: str
    leave_type_id: int
    leave_type_name: str
    from_date: dt.date
    to_date: dt.date
    days: float
    is_half_day: bool
    half_day_period: HalfDayPeriod | None
    reason: str | None
    status: LeaveStatus
    applied_at: dt.datetime
    cancelled_at: dt.datetime | None
    cancel_reason: str | None
    approvals: list[LeaveApprovalOut]

    model_config = {"from_attributes": True}


class CancelLeaveRequest(BaseModel):
    cancel_reason: str | None = None


class LeaveApplicationEdit(BaseModel):
    from_date: dt.date | None = None
    to_date: dt.date | None = None
    reason: str | None = None
    is_half_day: bool | None = None
    half_day_period: HalfDayPeriod | None = None


# ── PL Accrual ────────────────────────────────────────────────────────────────

class PLAccrualCreate(BaseModel):
    employee_id: int
    month: int
    year: int
    days_present: int


class PLAccrualOut(BaseModel):
    id: int
    employee_id: int
    month: int
    year: int
    days_present: int
    qualified: bool
    pl_earned: float
    processed_at: dt.datetime

    model_config = {"from_attributes": True}
