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


class AttendanceManualEntry(BaseModel):
    employee_id: int
    cycle_start: str   # "YYYY-MM-DD"
    cycle_end: str     # "YYYY-MM-DD"
    date: str          # "YYYY-MM-DD"
    in_time: str | None = None   # "HH:MM"
    out_time: str | None = None  # "HH:MM"


class AttendanceDayEntry(BaseModel):
    date: str                    # "YYYY-MM-DD"
    status: str                  # "P", "A", "WO"
    in_time: str | None = None
    out_time: str | None = None


class AttendanceManualBulk(BaseModel):
    employee_id: int
    cycle_start: str
    cycle_end: str
    days: list[AttendanceDayEntry]


class AttendanceManualBulkResult(BaseModel):
    inserted: int
    skipped: int
