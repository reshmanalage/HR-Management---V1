from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.employee_salary_revision import RevisionType


class SalaryRevisionIn(BaseModel):
    effective_date: date
    ctc: float = Field(..., gt=0, description="Annual CTC in INR")
    basic: Optional[float] = None
    hra: Optional[float] = None
    allowances: Optional[float] = None
    revision_type: RevisionType = RevisionType.JOINING
    remarks: Optional[str] = None


class SalaryRevisionOut(BaseModel):
    id: int
    employee_id: int
    effective_date: date
    ctc: float
    basic: Optional[float] = None
    hra: Optional[float] = None
    allowances: Optional[float] = None
    revision_type: RevisionType
    remarks: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}
