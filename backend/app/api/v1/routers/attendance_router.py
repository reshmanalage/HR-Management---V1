from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy import select, distinct
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.attendance import AttendanceRecord
from app.models.employee import Employee, EmployeeStatus
from app.models.user import User
from app.core.exceptions import AppError, NotFoundError
from app.schemas.attendance_schema import (
    AttendanceImportResult, AttendanceManualBulk, AttendanceManualBulkResult,
    AttendanceManualEntry, AttendanceRecordOut, AttendanceRecordUpdate,
)
from app.services.attendance_import_service import import_attendance
from app.services.biometric_mapping_service import map_biometrics

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/map-biometrics")
async def map_biometric_codes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Upload a biometric attendance Excel to match employee names and set
    their biometric_code in the DB. Run this once before importing attendance.
    """
    data = await file.read()
    result = map_biometrics(data, db)
    return result


@router.post("/import", response_model=AttendanceImportResult)
async def import_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    data = await file.read()
    result = import_attendance(data, db)
    return result


@router.get("/cycles", response_model=list[dict])
def list_cycles(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.execute(
        select(
            distinct(AttendanceRecord.cycle_start),
            AttendanceRecord.cycle_end,
        ).order_by(AttendanceRecord.cycle_start.desc())
    ).all()
    return [{"cycle_start": r[0], "cycle_end": r[1]} for r in rows]


@router.get("", response_model=list[AttendanceRecordOut])
def list_records(
    cycle_start: str = Query(...),
    employee_code: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(AttendanceRecord).where(AttendanceRecord.cycle_start == cycle_start)
    if employee_code:
        q = q.where(AttendanceRecord.raw_employee_code == employee_code)
    q = q.order_by(AttendanceRecord.raw_employee_name, AttendanceRecord.date)
    return list(db.scalars(q))


@router.patch("/{record_id}", response_model=AttendanceRecordOut)
def update_record(
    record_id: int,
    payload: AttendanceRecordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rec = db.get(AttendanceRecord, record_id)
    if rec is None:
        raise NotFoundError("Attendance record not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, value)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/non-biometric-employees", response_model=list[dict])
def list_non_biometric_employees(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Active employees with no biometric device enrollment."""
    rows = db.scalars(
        select(Employee)
        .where(
            Employee.biometric_code.is_(None),
            Employee.employee_status.in_([
                EmployeeStatus.ACTIVE,
                EmployeeStatus.PROBATION,
            ]),
        )
        .order_by(Employee.first_name, Employee.last_name)
    ).all()
    return [
        {
            "id": e.id,
            "code": e.employee_code,
            "name": " ".join(filter(None, [e.first_name, e.middle_name, e.last_name])),
        }
        for e in rows
    ]


@router.post("/manual", response_model=AttendanceRecordOut)
def add_manual_entry(
    payload: AttendanceManualEntry,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Create a manual attendance record for an employee not enrolled in biometric."""
    emp = db.get(Employee, payload.employee_id)
    if emp is None:
        raise NotFoundError("Employee not found")

    # Validate date within cycle
    if not (payload.cycle_start <= payload.date <= payload.cycle_end):
        raise AppError("Date must fall within the selected payroll cycle", 422)

    # Check for duplicate
    existing = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.cycle_start == payload.cycle_start,
            AttendanceRecord.raw_employee_code == emp.employee_code,
            AttendanceRecord.date == payload.date,
        )
    )
    if existing:
        raise AppError(
            f"An attendance record for {emp.first_name} on {payload.date} already exists in this cycle",
            409,
        )

    duration = None
    if payload.in_time and payload.out_time:
        try:
            h1, m1 = map(int, payload.in_time.split(":"))
            h2, m2 = map(int, payload.out_time.split(":"))
            duration = (h2 * 60 + m2) - (h1 * 60 + m1)
            if duration < 0:
                duration = None
        except Exception:
            duration = None

    status = "P" if (payload.in_time or payload.out_time) else "A"
    full_name = " ".join(filter(None, [emp.first_name, emp.middle_name, emp.last_name]))

    rec = AttendanceRecord(
        cycle_start=payload.cycle_start,
        cycle_end=payload.cycle_end,
        raw_employee_code=emp.employee_code,
        raw_employee_name=full_name,
        employee_id=emp.id,
        date=payload.date,
        status=status,
        in_time=payload.in_time,
        out_time=payload.out_time,
        duration_minutes=duration,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/manual-bulk", response_model=AttendanceManualBulkResult)
def add_manual_bulk(
    payload: AttendanceManualBulk,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk-create manual attendance records for a full cycle."""
    emp = db.get(Employee, payload.employee_id)
    if emp is None:
        raise NotFoundError("Employee not found")

    full_name = " ".join(filter(None, [emp.first_name, emp.middle_name, emp.last_name]))

    # Fetch existing dates for this employee in this cycle to skip duplicates
    existing_dates = set(
        db.scalars(
            select(AttendanceRecord.date).where(
                AttendanceRecord.cycle_start == payload.cycle_start,
                AttendanceRecord.raw_employee_code == emp.employee_code,
            )
        ).all()
    )

    inserted = 0
    skipped = 0
    for day in payload.days:
        if day.date in existing_dates:
            skipped += 1
            continue

        duration = None
        if day.in_time and day.out_time:
            try:
                h1, m1 = map(int, day.in_time.split(":"))
                h2, m2 = map(int, day.out_time.split(":"))
                d = (h2 * 60 + m2) - (h1 * 60 + m1)
                if d > 0:
                    duration = d
            except Exception:
                pass

        db.add(AttendanceRecord(
            cycle_start=payload.cycle_start,
            cycle_end=payload.cycle_end,
            raw_employee_code=emp.employee_code,
            raw_employee_name=full_name,
            employee_id=emp.id,
            date=day.date,
            status=day.status,
            in_time=day.in_time,
            out_time=day.out_time,
            duration_minutes=duration,
        ))
        inserted += 1

    db.commit()
    return {"inserted": inserted, "skipped": skipped}


@router.get("/employees", response_model=list[dict])
def list_employees_in_cycle(
    cycle_start: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.execute(
        select(
            distinct(AttendanceRecord.raw_employee_code),
            AttendanceRecord.raw_employee_name,
        )
        .where(AttendanceRecord.cycle_start == cycle_start)
        .order_by(AttendanceRecord.raw_employee_name)
    ).all()
    return [{"code": r[0], "name": r[1]} for r in rows]
