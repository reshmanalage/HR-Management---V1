"""
Bulk employee import via Excel (.xlsx).

Speed strategy:
  - openpyxl read_only=True  → skips cell-style tree, ~3x faster parse
  - All lookups fetched as raw tuples (no ORM object hydration, no lazy loads)
  - Bulk-create new depts/desigs in one INSERT each
  - Single multi-row INSERT for all valid employees
  - Row-by-row fallback only if bulk INSERT fails, with per-row error capture
  - Failed rows packaged as base64 xlsx for re-upload
"""
from __future__ import annotations

import base64
import io
import logging
from dataclasses import dataclass, field
from datetime import date, datetime

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from sqlalchemy import select, insert as sa_insert, func, text
from sqlalchemy.orm import Session

from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee, EmployeeStatus, EmploymentType

log = logging.getLogger(__name__)

COLUMNS = [
    ("employee_code",   "Employee Code",    "EMP0001 (leave blank to auto-generate)"),
    ("first_name",      "First Name *",     "John"),
    ("middle_name",     "Middle Name",      ""),
    ("last_name",       "Last Name",        "Doe"),
    ("gender",          "Gender",           "male / female / other"),
    ("date_of_birth",   "Date of Birth",    "1990-01-25"),
    ("personal_email",  "Personal Email",   "john@gmail.com"),
    ("company_email",   "Company Email",    "john@company.com"),
    ("mobile_number",   "Mobile Number",    "9876543210"),
    ("department",      "Department",       "Engineering"),
    ("designation",     "Designation",      "Software Engineer"),
    ("employment_type", "Employment Type",  "permanent / probation / contract / intern / part_time / consultant"),
    ("employee_status", "Employee Status",  "active / probation / notice_period / inactive / terminated"),
    ("date_of_joining", "Date of Joining *", "2024-01-01"),
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
NCOLS          = len(COLUMNS)


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


# ── helpers ───────────────────────────────────────────────────────────────────

def _s(raw: tuple, col: int) -> str:
    v = raw[col - 1] if col - 1 < len(raw) else None
    return str(v).strip() if v is not None else ""


def _parse_date(raw_val) -> date | None:
    if raw_val is None:
        return None
    if isinstance(raw_val, datetime):
        return raw_val.date()
    if isinstance(raw_val, date):
        return raw_val
    s = str(raw_val).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _is_empty_row(raw: tuple) -> bool:
    return all(v is None or str(v).strip() == "" for v in raw)


# ── failed-rows Excel ─────────────────────────────────────────────────────────

def _build_failed_xlsx(failed: list[tuple[int, tuple, str]]) -> str:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Failed Rows"

    for col_idx, (_, header, _) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    err_col = NCOLS + 1
    err_hdr = ws.cell(row=1, column=err_col, value="Error")
    err_hdr.fill = ERROR_HDR_FILL
    err_hdr.font = Font(color="FFFFFF", bold=True)

    for out_row, (_, values, error) in enumerate(failed, start=2):
        for col_idx in range(1, NCOLS + 1):
            v = values[col_idx - 1] if col_idx - 1 < len(values) else None
            ws.cell(row=out_row, column=col_idx, value=v).fill = ERROR_FILL
        ws.cell(row=out_row, column=err_col, value=error).fill = ERROR_FILL

    for i, w in enumerate(COL_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.column_dimensions[get_column_letter(err_col)].width = 45
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


# ── main processor ────────────────────────────────────────────────────────────

def process_upload(db: Session, file_bytes: bytes, created_by: int) -> BulkImportResult:
    result = BulkImportResult()

    # ── Step 1: pre-load lookups as raw tuples — zero ORM hydration ──────────
    log.info("bulk_import: loading existing codes/emails/depts/desigs")

    existing_codes: set[str] = set(
        row[0] for row in db.execute(
            select(Employee.employee_code).where(Employee.employee_code.isnot(None))
        )
    )
    existing_emails: set[str] = set(
        row[0] for row in db.execute(
            select(Employee.company_email).where(Employee.company_email.isnot(None))
        )
    )
    # Fetch only id + name columns — never touch .employees relationship
    dept_map: dict[str, int] = {
        row[1].lower(): row[0]
        for row in db.execute(select(Department.id, Department.name))
    }
    desig_map: dict[str, int] = {
        row[1].lower(): row[0]
        for row in db.execute(select(Designation.id, Designation.title))
    }
    max_emp_id: int = db.scalar(select(func.max(Employee.id))) or 0

    log.info(
        "bulk_import: lookups ready — codes=%d emails=%d depts=%d desigs=%d",
        len(existing_codes), len(existing_emails), len(dept_map), len(desig_map),
    )

    # ── Step 2: parse Excel with read_only streaming ──────────────────────────
    log.info("bulk_import: parsing Excel (%d bytes)", len(file_bytes))
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
    ws = wb.active

    all_rows: list[tuple[int, tuple]] = []
    consecutive_empty = 0
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        raw = tuple(row[:NCOLS])
        if _is_empty_row(raw):
            consecutive_empty += 1
            if consecutive_empty >= 10:
                # Stop reading — rest of sheet is blank
                break
        else:
            consecutive_empty = 0
            all_rows.append((row_idx, raw))

    wb.close()
    result.total = len(all_rows)
    log.info("bulk_import: %d data rows found", result.total)

    if not all_rows:
        return result

    # ── Step 3: bulk-create new depts / desigs in one shot each ──────────────
    needed_depts = {
        _s(raw, 10).lower() for _, raw in all_rows
        if _s(raw, 10) and _s(raw, 10).lower() not in dept_map
    }
    needed_desigs = {
        _s(raw, 11).lower() for _, raw in all_rows
        if _s(raw, 11) and _s(raw, 11).lower() not in desig_map
    }

    if needed_depts:
        log.info("bulk_import: creating %d new departments", len(needed_depts))
        db.execute(sa_insert(Department), [{"name": n.title()} for n in needed_depts])
        db.flush()
        for row in db.execute(
            select(Department.id, Department.name).where(
                Department.name.in_([n.title() for n in needed_depts])
            )
        ):
            dept_map[row[1].lower()] = row[0]

    if needed_desigs:
        log.info("bulk_import: creating %d new designations", len(needed_desigs))
        db.execute(sa_insert(Designation), [{"title": t.title()} for t in needed_desigs])
        db.flush()
        for row in db.execute(
            select(Designation.id, Designation.title).where(
                Designation.title.in_([t.title() for t in needed_desigs])
            )
        ):
            desig_map[row[1].lower()] = row[0]

    # ── Step 4: validate every row in memory (zero DB queries) ───────────────
    log.info("bulk_import: validating %d rows in memory", len(all_rows))
    valid_payloads: list[tuple[int, dict, str, str]] = []
    failed_raw:     list[tuple[int, tuple, str]]     = []
    used_codes:     set[str] = set()
    used_emails:    set[str] = set()
    auto_id = max_emp_id

    for row_idx, raw in all_rows:
        first_name = _s(raw, 2)
        last_name  = _s(raw, 4)
        full_name  = f"{first_name} {last_name}".strip()

        try:
            if not first_name:
                raise ValueError("First name is required")

            # Date of joining — mandatory
            doj = _parse_date(raw[13] if len(raw) > 13 else None)
            if not doj:
                raise ValueError("Date of joining is required (format: YYYY-MM-DD)")

            # Employee code
            emp_code_raw = _s(raw, 1)
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

            # Company email uniqueness
            company_email: str | None = _s(raw, 8) or None
            if company_email:
                if company_email in existing_emails or company_email in used_emails:
                    raise ValueError(f"Company email '{company_email}' already in use")
                used_emails.add(company_email)

            # Gender
            gender_raw = _s(raw, 5).lower()
            gender = gender_raw if gender_raw in ("male", "female", "other") else None

            # Dates
            dob = _parse_date(raw[5] if len(raw) > 5 else None)
            # doj already parsed and validated above

            # Employment type
            et_raw = _s(raw, 12).lower().replace(" ", "_")
            try:
                employment_type: str | None = EmploymentType(et_raw).value if et_raw else None
            except ValueError:
                employment_type = None

            # Employee status
            es_raw = _s(raw, 13).lower().replace(" ", "_")
            try:
                employee_status = EmployeeStatus(es_raw).value if es_raw else EmployeeStatus.ACTIVE.value
            except ValueError:
                employee_status = EmployeeStatus.ACTIVE.value

            valid_payloads.append((row_idx, dict(
                employee_code=emp_code,
                first_name=first_name,
                middle_name=_s(raw, 3) or None,
                last_name=last_name,
                gender=gender,
                date_of_birth=dob,
                personal_email=_s(raw, 7) or None,
                company_email=company_email,
                mobile_number=_s(raw, 9) or None,
                department_id=dept_map.get(_s(raw, 10).lower()) if _s(raw, 10) else None,
                designation_id=desig_map.get(_s(raw, 11).lower()) if _s(raw, 11) else None,
                employment_type=employment_type,
                employee_status=employee_status,
                date_of_joining=doj,
                branch=_s(raw, 15) or None,
                location=_s(raw, 16) or None,
                grade=_s(raw, 17) or None,
                created_by=created_by,
                is_active=True,
            ), emp_code, full_name))

        except Exception as exc:
            result.failed += 1
            result.rows.append(RowResult(row=row_idx, status="error", name=full_name, error=str(exc)))
            failed_raw.append((row_idx, raw, str(exc)))

    log.info("bulk_import: %d valid, %d invalid", len(valid_payloads), len(failed_raw))

    # ── Step 5: single bulk INSERT ────────────────────────────────────────────
    if valid_payloads:
        try:
            log.info("bulk_import: executing bulk INSERT for %d rows", len(valid_payloads))
            db.execute(sa_insert(Employee), [p for _, p, _, _ in valid_payloads])
            db.commit()
            log.info("bulk_import: bulk INSERT committed successfully")
            for row_idx, _, emp_code, name in valid_payloads:
                result.success += 1
                result.rows.append(RowResult(row=row_idx, status="success", employee_code=emp_code, name=name))
        except Exception as bulk_exc:
            log.error("bulk_import: bulk INSERT failed (%s), falling back to row-by-row", bulk_exc)
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
                    src_raw = next((r for ri, r in all_rows if ri == row_idx), ())
                    failed_raw.append((row_idx, src_raw, str(exc)))

    if failed_raw:
        result.failed_rows_xlsx_b64 = _build_failed_xlsx(failed_raw)

    result.rows.sort(key=lambda r: r.row)
    log.info("bulk_import: done — success=%d failed=%d", result.success, result.failed)
    return result
