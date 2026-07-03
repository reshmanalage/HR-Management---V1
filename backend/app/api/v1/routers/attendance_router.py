from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy import select, distinct
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.attendance import AttendanceRecord
from app.models.user import User
from app.schemas.attendance_schema import AttendanceImportResult, AttendanceRecordOut
from app.services.attendance_import_service import import_attendance

router = APIRouter(prefix="/attendance", tags=["attendance"])


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
