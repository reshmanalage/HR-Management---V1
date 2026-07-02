"""
Bulk employee import via Excel (.xlsx).

Template columns (in order):
  A  employee_code       – optional; auto-generated if blank
  B  first_name          – required
  C  middle_name         – optional
  D  last_name           – required
  E  gender              – male / female / other
  F  date_of_birth       – YYYY-MM-DD
  G  personal_email      – optional
  H  company_email       – optional
  I  mobile_number       – optional
  J  department          – name; created if not found
  K  designation         – title; created if not found
  L  employment_type     – permanent / probation / contract / intern / part_time / consultant
  M  employee_status     – active / probation / notice_period / inactive / terminated
  N  date_of_joining     – YYYY-MM-DD
  O  branch              – optional
  P  location            – optional
  Q  grade               – optional
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date, datetime

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee, EmployeeStatus, EmploymentType, Gender
from app.repositories.employee_repository import EmployeeRepository

COLUMNS = [
    ("employee_code",   "Employee Code",    "EMP0001 (leave blank to auto-generate)"),
    ("first_name",      "First Name *",     "John"),
    ("middle_name",     "Middle Name",      ""),
    ("last_name",       "Last Name *",      "Doe"),
    ("gender",          "Gender",           "male / female / other"),
    ("date_of_birth",   "Date of Birth",    "1990-01-25"),
    ("personal_email",  "Personal Email",   "john@gmail.com"),
    ("company_email",   "Company Email",    "john@company.com"),
    ("mobile_number",   "Mobile Number",    "9876543210"),
    ("department",      "Department",       "Engineering"),
    ("designation",     "Designation",      "Software Engineer"),
    ("employment_type", "Employment Type",  "permanent / probation / contract / intern / part_time / consultant"),
    ("employee_status", "Employee Status",  "active / probation / notice_period / inactive / terminated"),
    ("date_of_joining", "Date of Joining",  "2024-01-01"),
    ("branch",          "Branch",           "Mumbai"),
    ("location",        "Location",         "WFH / Office"),
    ("grade",           "Grade",            "L2"),
]

HEADER_FILL = PatternFill("solid", fgColor="4F46E5")
HEADER_FONT = Font(color="FFFFFF", bold=True)
SAMPLE_FILL = PatternFill("solid", fgColor="EEF2FF")


def generate_template() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Employees"

    # Headers
    for col_idx, (_, header, _) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    # Sample row
    for col_idx, (_, _, sample) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=2, column=col_idx, value=sample)
        cell.fill = SAMPLE_FILL

    # Column widths
    widths = [18, 15, 15, 15, 10, 14, 25, 25, 14, 20, 22, 18, 16, 14, 14, 14, 10]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@dataclass
class RowResult:
    row: int
    status: str          # "success" | "error" | "skipped"
    employee_code: str = ""
    name: str = ""
    error: str = ""


@dataclass
class BulkImportResult:
    total: int = 0
    success: int = 0
    failed: int = 0
    rows: list[RowResult] = field(default_factory=list)


def _cell_str(ws, row: int, col: int) -> str:
    v = ws.cell(row=row, column=col).value
    return str(v).strip() if v is not None else ""


def _parse_date(value: str) -> date | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    # openpyxl may give a datetime object directly
    return None


def _get_or_create_dept(db: Session, name: str) -> Department | None:
    if not name:
        return None
    dept = db.scalar(select(Department).where(Department.name == name))
    if not dept:
        dept = Department(name=name)
        db.add(dept)
        db.flush()
    return dept


def _get_or_create_desig(db: Session, title: str) -> Designation | None:
    if not title:
        return None
    desig = db.scalar(select(Designation).where(Designation.title == title))
    if not desig:
        desig = Designation(title=title)
        db.add(desig)
        db.flush()
    return desig


def process_upload(db: Session, file_bytes: bytes, created_by: int) -> BulkImportResult:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    repo = EmployeeRepository(db)
    result = BulkImportResult()

    for row_idx in range(2, ws.max_row + 1):
        # Skip completely empty rows
        row_values = [ws.cell(row=row_idx, column=c).value for c in range(1, len(COLUMNS) + 1)]
        if all(v is None or str(v).strip() == "" for v in row_values):
            continue

        result.total += 1
        col = lambda c: _cell_str(ws, row_idx, c)  # noqa: E731

        first_name = col(2)
        last_name  = col(4)

        if not first_name or not last_name:
            result.failed += 1
            result.rows.append(RowResult(
                row=row_idx, status="error",
                name=f"{first_name} {last_name}".strip(),
                error="First name and last name are required",
            ))
            continue

        try:
            savepoint = db.begin_nested()
            # Resolve employee code
            emp_code_raw = col(1)
            if emp_code_raw:
                if repo.get_by_code(emp_code_raw):
                    raise ValueError(f"Employee code '{emp_code_raw}' already exists")
                emp_code = emp_code_raw
            else:
                emp_code = repo.next_employee_code()
                # Ensure uniqueness in this batch
                while repo.get_by_code(emp_code):
                    emp_code = repo.next_employee_code()

            # Resolve gender
            gender_raw = col(5).lower()
            gender = None
            if gender_raw in ("male", "female", "other"):
                gender = Gender(gender_raw)

            # Dates
            dob_raw = ws.cell(row=row_idx, column=6).value
            dob = dob_raw.date() if isinstance(dob_raw, datetime) else _parse_date(str(dob_raw) if dob_raw else "")

            doj_raw = ws.cell(row=row_idx, column=14).value
            doj = doj_raw.date() if isinstance(doj_raw, datetime) else _parse_date(str(doj_raw) if doj_raw else "")

            # Employment type
            et_raw = col(12).lower().replace(" ", "_")
            employment_type = None
            try:
                employment_type = EmploymentType(et_raw) if et_raw else None
            except ValueError:
                pass

            # Employee status
            es_raw = col(13).lower().replace(" ", "_")
            employee_status = EmployeeStatus.ACTIVE
            try:
                employee_status = EmployeeStatus(es_raw) if es_raw else EmployeeStatus.ACTIVE
            except ValueError:
                pass

            # Department / Designation (auto-create)
            dept  = _get_or_create_dept(db, col(10))
            desig = _get_or_create_desig(db, col(11))

            # Duplicate email check
            company_email = col(8) or None
            if company_email and repo.get_by_email(company_email):
                raise ValueError(f"Company email '{company_email}' already exists")

            emp = Employee(
                employee_code=emp_code,
                first_name=first_name,
                middle_name=col(3) or None,
                last_name=last_name,
                gender=gender,
                date_of_birth=dob,
                personal_email=col(7) or None,
                company_email=company_email,
                mobile_number=col(9) or None,
                department_id=dept.id if dept else None,
                designation_id=desig.id if desig else None,
                employment_type=employment_type,
                employee_status=employee_status,
                date_of_joining=doj,
                branch=col(15) or None,
                location=col(16) or None,
                grade=col(17) or None,
                created_by=created_by,
            )
            db.add(emp)
            db.flush()

            savepoint.commit()
            result.success += 1
            result.rows.append(RowResult(
                row=row_idx, status="success",
                employee_code=emp_code,
                name=f"{first_name} {last_name}",
            ))

        except Exception as exc:
            savepoint.rollback()
            # Re-attach session state after rollback by using a savepoint approach
            # We just note the failure and continue
            result.failed += 1
            result.rows.append(RowResult(
                row=row_idx, status="error",
                name=f"{first_name} {last_name}",
                error=str(exc),
            ))
            continue

    db.commit()
    return result
