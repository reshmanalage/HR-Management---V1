from datetime import date, datetime

from pydantic import BaseModel

from app.models.attendance_regularization import RegularizationStatus, RegularizationType


class RegularizationCreate(BaseModel):
    date: date
    type: RegularizationType
    in_time: str | None = None    # HH:MM — required for late_coming
    out_time: str | None = None   # HH:MM — required for early_going
    out_from: str | None = None   # HH:MM — required for out_of_office
    out_till: str | None = None   # HH:MM — required for out_of_office
    reason: str | None = None


class RegularizationDecide(BaseModel):
    action: RegularizationStatus   # approved | rejected
    comment: str | None = None


class RegularizationOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    employee_code: str
    date: date
    type: RegularizationType
    in_time: str | None
    out_time: str | None
    out_from: str | None
    out_till: str | None
    reason: str | None
    status: RegularizationStatus
    applied_at: datetime
    decided_at: datetime | None
    decided_by_name: str | None
    comment: str | None

    model_config = {"from_attributes": True}
