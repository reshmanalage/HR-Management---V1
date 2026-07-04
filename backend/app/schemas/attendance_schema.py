from pydantic import BaseModel, ConfigDict


class AttendanceRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cycle_start: str
    cycle_end: str
    raw_employee_code: str
    raw_employee_name: str
    employee_id: int | None
    date: str
    status: str | None
    in_time: str | None
    out_time: str | None
    duration_minutes: int | None


class AttendanceRecordUpdate(BaseModel):
    in_time: str | None = None   # "HH:MM" or null to clear
    out_time: str | None = None
    status: str | None = None


class AttendanceImportResult(BaseModel):
    inserted: int
    skipped: int
    errors: list[str]
