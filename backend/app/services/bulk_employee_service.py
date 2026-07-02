"""
Bulk employee import via Excel (.xlsx).

Strategy:
  1. Parse every row — validate, resolve dept/desig, auto-generate codes.
  2. Bulk-INSERT all valid rows in one SQLAlchemy Core statement (fast).
  3. Return a base64-encoded Excel of the failed rows (with an Error column)
     so HR can correct and re-upload just the failures.

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

import base64
import io
from dataclasses import dataclass, field
from datetime import date, datetime

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, fills
from openpyxl.utils import get_column_letter
from sqlalchemy import select, insert as sa_insert
from sqlalchemy.orm import Session

from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee, EmployeeStatus, EmploymentType, Gender

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

HEADER_FILL  = PatternFill("solid", fgColor="4F46E5")
HEADER_FONT  = Font(color="FFFFFF", bold=True)
SAMPLE_FILL  = PatternFill("solid", fgColor="EEF2FF")
ERROR_FILL   = PatternFill("solid", fgColor="FEE2E2")
ERROR_HDR_FILL = PatternFill("solid", fgColor="DC2626")

COL_WIDTHS = [18, 15, 15, 15, 10, 14, 25, 25, 14, 20, 22, 18, 16, 14, 14, 14, 10]


def generate_template() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Employees"

    for col_idx, (_, header, _) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    for col_idx, (_, _, sample) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=2, column=col_idx, value=sample)
        cell.fill = SAMPLE_FILL

    for i, w in enumerate(COL_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── helpers ───────────────────────────────────────────────────────────────────

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


def _next_available_code(db: Session, used_in_batch: set[str]) -> str:
    from sqlalchemy import func
    result = db.scalar(select(func.max(Employee.id)))
    next_id = (result or 0) + len(used_in_batch) + 1
    while True:
        code = f"EMP{next_id:04d}"
        if code not in used_in_batch and not db.scalar(select(Employee).where(Employee.employee_code == code)):
            return code
        next_id += 1


# ── result types ─────────────────────────────────────────────────────────────

@dataclass
class RowResult:
    row: int
    status: str          # "success" | "error"
    employee_code: str = ""
    name: str = ""
    error: str = ""


@dataclass
class BulkImportResult:
    total: int = 0
    success: int = 0
    failed: int = 0
    rows: list[RowResult] = field(default_factory=list)
    failed_rows_xlsx_b64: str = ""   # base64-encoded Excel of failed rows for re-download


# ── failed-rows Excel generator ───────────────────────────────────────────────

def _build_failed_xlsx(ws_source, failed: list[tuple[int, list, str]]) -> str:
    """
    failed: list of (original_row_idx, raw_cell_values[17], error_message)
    Returns base64-encoded xlsx bytes.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Failed Rows"

    # Headers
    for col_idx, (_, header, _) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    # Error column header
    err_col = len(COLUMNS) + 1
    err_cell = ws.cell(row=1, column=err_col, value="Error")
    err_cell.fill = ERROR_HDR_FILL
    err_cell.font = Font(color="FFFFFF", bold=True)

    for out_row, (_, values, error) in enumerate(failed, start=2):
        for col_idx, val in enumerate(values, start=1):
            cell = ws.cell(row=out_row, column=col_idx, value=val)
            cell.fill = ERROR_FILL
        ws.cell(row=out_row, column=err_col, value=error).fill = ERROR_FILL

    for i, w in enumerate(COL_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.column_dimensions[get_column_letter(err_col)].width = 45
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


# ── main upload processor ─────────────────────────────────────────────────────

def process_upload(db: Session, file_bytes: bytes, created_by: int) -> BulkImportResult:
    wb   = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws   = wb.active
    result = BulkImportResult()

    valid_rows: list[tuple[int, dict, str, str]] = []   # (row_idx, payload_dict, emp_code, name)
    failed_raw: list[tuple[int, list, str]] = []         # (row_idx, raw_values, error)
    used_codes: set[str] = set()

    # ── Pass 1: parse & validate every row ───────────────────────────────────
    # Dept/desig auto-creation happens here (flushed but not committed yet).
    for row_idx in range(2, ws.max_row + 1):
        raw = [ws.cell(row=row_idx, column=c).value for c in range(1, len(COLUMNS) + 1)]
        if all(v is None or str(v).strip() == "" for v in raw):
            continue

        result.total += 1

        def col(c): return str(raw[c - 1]).strip() if raw[c - 1] is not None else ""

        first_name = col(2)
        last_name  = col(4)

        try:
            if not first_name or not last_name:
                raise ValueError("First name and last name are required")

            # Employee code
            emp_code_raw = col(1)
            if emp_code_raw:
                if emp_code_raw in used_codes or db.scalar(
                    select(Employee).where(Employee.employee_code == emp_code_raw)
                ):
                    raise ValueError(f"Employee code '{emp_code_raw}' already exists")
                emp_code = emp_code_raw
            else:
                emp_code = _next_available_code(db, used_codes)
            used_codes.add(emp_code)

            # Gender
            gender_raw = col(5).lower()
            gender = gender_raw if gender_raw in ("male", "female", "other") else None

            # Dates
            dob_raw = raw[5]
            dob = dob_raw.date() if isinstance(dob_raw, datetime) else _parse_date(str(dob_raw) if dob_raw else "")

            doj_raw = raw[13]
            doj = doj_raw.date() if isinstance(doj_raw, datetime) else _parse_date(str(doj_raw) if doj_raw else "")

            # Employment type
            et_raw = col(12).lower().replace(" ", "_")
            employment_type = None
            try:
                employment_type = EmploymentType(et_raw).value if et_raw else None
            except ValueError:
                pass

            # Employee status
            es_raw = col(13).lower().replace(" ", "_")
            try:
                employee_status = EmployeeStatus(es_raw).value if es_raw else EmployeeStatus.ACTIVE.value
            except ValueError:
                employee_status = EmployeeStatus.ACTIVE.value

            # Dept / Desig (auto-create; flushed into session, committed with the bulk insert)
            dept  = _get_or_create_dept(db, col(10))
            desig = _get_or_create_desig(db, col(11))

            # Duplicate email check
            company_email = col(8) or None
            if company_email and db.scalar(select(Employee).where(Employee.company_email == company_email)):
                raise ValueError(f"Company email '{company_email}' already in use")

            payload = dict(
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
                is_active=True,
            )
            valid_rows.append((row_idx, payload, emp_code, f"{first_name} {last_name}"))

        except Exception as exc:
            result.failed += 1
            result.rows.append(RowResult(
                row=row_idx, status="error",
                name=f"{first_name} {last_name}".strip(),
                error=str(exc),
            ))
            failed_raw.append((row_idx, raw, str(exc)))

    # ── Pass 2: single bulk INSERT for all valid rows ─────────────────────────
    if valid_rows:
        try:
            db.execute(sa_insert(Employee), [payload for _, payload, _, _ in valid_rows])
            db.commit()
            for row_idx, _, emp_code, name in valid_rows:
                result.success += 1
                result.rows.append(RowResult(row=row_idx, status="success", employee_code=emp_code, name=name))
        except Exception as bulk_exc:
            # Bulk insert failed — fall back to one-by-one to isolate bad rows
            db.rollback()
            for row_idx, payload, emp_code, name in valid_rows:
                try:
                    db.execute(sa_insert(Employee), [payload])
                    db.commit()
                    result.success += 1
                    result.rows.append(RowResult(row=row_idx, status="success", employee_code=emp_code, name=name))
                except Exception as exc:
                    db.rollback()
                    result.failed += 1
                    result.rows.append(RowResult(row=row_idx, status="error", name=name, error=str(exc)))
                    # Find original raw values for the failed xlsx
                    src_raw = [ws.cell(row=row_idx, column=c).value for c in range(1, len(COLUMNS) + 1)]
                    failed_raw.append((row_idx, src_raw, str(exc)))

    # ── Build failed-rows Excel if any failures ───────────────────────────────
    if failed_raw:
        result.failed_rows_xlsx_b64 = _build_failed_xlsx(ws, failed_raw)

    result.rows.sort(key=lambda r: r.row)
    return result
