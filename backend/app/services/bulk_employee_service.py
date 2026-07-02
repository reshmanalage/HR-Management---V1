"""
Bulk employee import via Excel (.xlsx) — optimised for speed.

Strategy:
  1. Pre-load ALL existing codes, emails, departments, designations into
     memory once — zero per-row DB queries during validation.
  2. Bulk-create any new departments / designations in one shot.
  3. Single multi-row INSERT for all valid employees.
  4. Return a base64-encoded Excel of failed rows for correction.

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
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from sqlalchemy import select, insert as sa_insert, func
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

HEADER_FILL    = PatternFill("solid", fgColor="4F46E5")
HEADER_FONT    = Font(color="FFFFFF", bold=True)
SAMPLE_FILL    = PatternFill("solid", fgColor="EEF2FF")
ERROR_FILL     = PatternFill("solid", fgColor="FEE2E2")
ERROR_HDR_FILL = PatternFill("solid", fgColor="DC2626")
COL_WIDTHS     = [18, 15, 15, 15, 10, 14, 25, 25, 14, 20, 22, 18, 16, 14, 14, 14, 10]


# ── template ──────────────────────────────────────────────────────────────────

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
        ws.cell(row=2, column=col_idx, value=sample).fill = SAMPLE_FILL

    for i, w in enumerate(COL_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── result types ──────────────────────────────────────────────────────────────

@dataclass
class RowResult:
    row: int
    status: str
    employee_code: str = ""
    name: str = ""
    error: str = ""


@dataclass
class BulkImportResult:
    total: int = 0
    success: int = 0
    failed: int = 0
    rows: list[RowResult] = field(default_factory=list)
    failed_rows_xlsx_b64: str = ""


# ── failed-rows Excel ─────────────────────────────────────────────────────────

def _build_failed_xlsx(failed: list[tuple[int, list, str]]) -> str:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Failed Rows"

    for col_idx, (_, header, _) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    err_col = len(COLUMNS) + 1
    err_hdr = ws.cell(row=1, column=err_col, value="Error")
    err_hdr.fill = ERROR_HDR_FILL
    err_hdr.font = Font(color="FFFFFF", bold=True)

    for out_row, (_, values, error) in enumerate(failed, start=2):
        for col_idx, val in enumerate(values, start=1):
            ws.cell(row=out_row, column=col_idx, value=val).fill = ERROR_FILL
        ws.cell(row=out_row, column=err_col, value=error).fill = ERROR_FILL

    for i, w in enumerate(COL_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.column_dimensions[get_column_letter(err_col)].width = 45
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


# ── helpers ───────────────────────────────────────────────────────────────────

def _cell_str(raw: list, col: int) -> str:
    v = raw[col - 1]
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


# ── main processor ────────────────────────────────────────────────────────────

def process_upload(db: Session, file_bytes: bytes, created_by: int) -> BulkImportResult:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    result = BulkImportResult()

    # ── Step 1: pre-load lookups into memory (6 queries total) ───────────────
    existing_codes  = set(db.scalars(select(Employee.employee_code)))
    existing_emails = set(
        e for e in db.scalars(select(Employee.company_email))
        if e is not None
    )
    dept_map   = {d.name.lower(): d.id for d in db.scalars(select(Department))}
    desig_map  = {d.title.lower(): d.id for d in db.scalars(select(Designation))}
    max_emp_id = db.scalar(select(func.max(Employee.id))) or 0

    # ── Step 2: read rows from Excel ─────────────────────────────────────────
    all_rows: list[tuple[int, list]] = []
    for row_idx in range(2, ws.max_row + 1):
        raw = [ws.cell(row=row_idx, column=c).value for c in range(1, len(COLUMNS) + 1)]
        if all(v is None or str(v).strip() == "" for v in raw):
            continue
        all_rows.append((row_idx, raw))

    result.total = len(all_rows)

    # ── Step 3: collect new depts/desigs needed ───────────────────────────────
    new_depts  = {
        _cell_str(raw, 10).lower()
        for _, raw in all_rows
        if _cell_str(raw, 10) and _cell_str(raw, 10).lower() not in dept_map
    }
    new_desigs = {
        _cell_str(raw, 11).lower()
        for _, raw in all_rows
        if _cell_str(raw, 11) and _cell_str(raw, 11).lower() not in desig_map
    }

    # Bulk-insert new depts in one shot
    if new_depts:
        db.execute(sa_insert(Department), [{"name": n.title()} for n in new_depts])
        db.flush()
        for d in db.scalars(select(Department).where(
            Department.name.in_([n.title() for n in new_depts])
        )):
            dept_map[d.name.lower()] = d.id

    # Bulk-insert new desigs in one shot
    if new_desigs:
        db.execute(sa_insert(Designation), [{"title": t.title()} for t in new_desigs])
        db.flush()
        for d in db.scalars(select(Designation).where(
            Designation.title.in_([t.title() for t in new_desigs])
        )):
            desig_map[d.title.lower()] = d.id

    # ── Step 4: validate rows in memory, build payloads ───────────────────────
    valid_payloads: list[tuple[int, dict, str, str]] = []
    failed_raw:     list[tuple[int, list, str]]      = []
    used_codes:     set[str] = set()
    used_emails:    set[str] = set()
    auto_id = max_emp_id  # counter for auto-generating codes

    for row_idx, raw in all_rows:
        col = lambda c: _cell_str(raw, c)  # noqa: E731
        first_name = col(2)
        last_name  = col(4)

        try:
            if not first_name or not last_name:
                raise ValueError("First name and last name are required")

            # Employee code
            emp_code_raw = col(1)
            if emp_code_raw:
                if emp_code_raw in existing_codes or emp_code_raw in used_codes:
                    raise ValueError(f"Employee code '{emp_code_raw}' already exists")
                emp_code = emp_code_raw
            else:
                auto_id += 1
                emp_code = f"EMP{auto_id:04d}"
                while emp_code in existing_codes or emp_code in used_codes:
                    auto_id += 1
                    emp_code = f"EMP{auto_id:04d}"
            used_codes.add(emp_code)

            # Email uniqueness
            company_email = col(8) or None
            if company_email:
                if company_email in existing_emails or company_email in used_emails:
                    raise ValueError(f"Company email '{company_email}' already in use")
                used_emails.add(company_email)

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

            dept_name  = col(10).lower()
            desig_name = col(11).lower()

            valid_payloads.append((row_idx, dict(
                employee_code=emp_code,
                first_name=first_name,
                middle_name=col(3) or None,
                last_name=last_name,
                gender=gender,
                date_of_birth=dob,
                personal_email=col(7) or None,
                company_email=company_email,
                mobile_number=col(9) or None,
                department_id=dept_map.get(dept_name),
                designation_id=desig_map.get(desig_name),
                employment_type=employment_type,
                employee_status=employee_status,
                date_of_joining=doj,
                branch=col(15) or None,
                location=col(16) or None,
                grade=col(17) or None,
                created_by=created_by,
                is_active=True,
            ), emp_code, f"{first_name} {last_name}"))

        except Exception as exc:
            result.failed += 1
            result.rows.append(RowResult(
                row=row_idx, status="error",
                name=f"{first_name} {last_name}".strip(),
                error=str(exc),
            ))
            failed_raw.append((row_idx, raw, str(exc)))

    # ── Step 5: single bulk INSERT ────────────────────────────────────────────
    if valid_payloads:
        try:
            db.execute(sa_insert(Employee), [p for _, p, _, _ in valid_payloads])
            db.commit()
            for row_idx, _, emp_code, name in valid_payloads:
                result.success += 1
                result.rows.append(RowResult(row=row_idx, status="success", employee_code=emp_code, name=name))
        except Exception:
            # Bulk failed — retry one by one to find bad rows
            db.rollback()
            for row_idx, payload, emp_code, name in valid_payloads:
                try:
                    db.execute(sa_insert(Employee), [payload])
                    db.commit()
                    result.success += 1
                    result.rows.append(RowResult(row=row_idx, status="success", employee_code=emp_code, name=name))
                except Exception as exc:
                    db.rollback()
                    result.failed += 1
                    result.rows.append(RowResult(row=row_idx, status="error", name=name, error=str(exc)))
                    src_raw = [ws.cell(row=row_idx, column=c).value for c in range(1, len(COLUMNS) + 1)]
                    failed_raw.append((row_idx, src_raw, str(exc)))

    if failed_raw:
        result.failed_rows_xlsx_b64 = _build_failed_xlsx(failed_raw)

    result.rows.sort(key=lambda r: r.row)
    return result
