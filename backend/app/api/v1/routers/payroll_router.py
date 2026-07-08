import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.v1.routers.auth_router import get_current_user
from app.database.session import get_db
from app.models.attendance import AttendanceRecord
from app.models.attendance_deduction import AttendanceDeduction
from app.models.employee import Employee
from app.models.holiday import Holiday
from app.models.leave_application import LeaveApplication, LeaveStatus
from app.models.payroll_policy import PayrollPolicy
from app.models.shift import Shift
from app.models.attendance_deduction import DeductionType
from app.schemas.payroll_schema import (
    AttendanceReportOut,
    DayAttendanceOut,
    DeductionItemOut,
    DeductionOverrideDelete,
    DeductionOverrideRequest,
    EmployeeAttendanceSummary,
    EmployeeLOPOut,
    LOPCalculateRequest,
    LOPReportOut,
    PayrollPolicyOut,
    PayrollPolicyUpdate,
)
from app.services.lop_calculation_service import (
    _cycle_dates,
    _cycle_end,
    _get_or_create_policy,
    _out_minutes,
    _resolve_shift_thresholds,
    _to_minutes,
    calculate_lop_bulk,
    calculate_lop_for_employee,
)

router = APIRouter(prefix="/payroll", tags=["payroll"])


def _require_super_admin(current_user=Depends(get_current_user)):
    if not any(r.role.name == "SUPER_ADMIN" for r in current_user.user_roles):
        raise HTTPException(403, "Super Admin access required")
    return current_user


def _require_hr_or_admin(current_user=Depends(get_current_user)):
    """Allow SUPER_ADMIN or any user with 'admin' module access (HR role)."""
    is_super = any(r.role.name == "SUPER_ADMIN" for r in current_user.user_roles)
    has_admin_module = any(m.module == "admin" for m in current_user.module_access)
    if not (is_super or has_admin_module):
        raise HTTPException(403, "Super Admin or HR (admin module) access required")
    return current_user


# ──────────────────────────────────────────────
# Policy
# ──────────────────────────────────────────────

@router.get("/policy", response_model=PayrollPolicyOut)
def get_policy(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return _get_or_create_policy(db)


@router.put("/policy", response_model=PayrollPolicyOut)
def update_policy(
    payload: PayrollPolicyUpdate,
    db: Session = Depends(get_db),
    _=Depends(_require_hr_or_admin),
):
    policy = _get_or_create_policy(db)
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(policy, field, val)
    db.commit()
    db.refresh(policy)
    return policy


# ──────────────────────────────────────────────
# Calculate LOP
# ──────────────────────────────────────────────

@router.post("/calculate-lop")
def calculate_lop(
    payload: LOPCalculateRequest,
    db: Session = Depends(get_db),
    _=Depends(_require_hr_or_admin),
):
    """Run LOP calculation for all active employees for the given cycle."""
    results = calculate_lop_bulk(db, payload.cycle_start)
    total_deductions = sum(
        sum(float(d.deduction_days) for d in deds) for deds in results.values()
    )
    return {
        "message": f"LOP calculation complete for cycle starting {payload.cycle_start}",
        "employees_processed": len(results),
        "total_deduction_days": round(total_deductions, 3),
    }


@router.post("/calculate-lop/{employee_id}")
def calculate_lop_single(
    employee_id: int,
    payload: LOPCalculateRequest,
    db: Session = Depends(get_db),
    _=Depends(_require_hr_or_admin),
):
    """Recalculate LOP for a single employee (useful for corrections)."""
    emp = db.query(Employee).filter_by(id=employee_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    deductions = calculate_lop_for_employee(db, employee_id, payload.cycle_start, overwrite=True)
    db.commit()
    return {
        "message": f"LOP recalculated for {emp.first_name} {emp.last_name}",
        "deduction_count": len(deductions),
        "total_deduction_days": round(sum(float(d.deduction_days) for d in deductions), 3),
    }


# ──────────────────────────────────────────────
# Delete cycle attendance data
# ──────────────────────────────────────────────

@router.delete("/attendance")
def delete_cycle_attendance(
    cycle_start: str = Query(..., description="Cycle start YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _=Depends(_require_hr_or_admin),
):
    """Delete all attendance records and deductions for a given payroll cycle."""
    try:
        cs = datetime.date.fromisoformat(cycle_start)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    ce = _cycle_end(cs)
    cs_str = cs.strftime("%Y-%m-%d")
    ce_str = ce.strftime("%Y-%m-%d")

    ded_count = (
        db.query(AttendanceDeduction)
        .filter(AttendanceDeduction.payroll_cycle_start == cs_str)
        .delete(synchronize_session=False)
    )
    att_count = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.date >= cs_str,
            AttendanceRecord.date <= ce_str,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {
        "cycle_start": cs_str,
        "cycle_end": ce_str,
        "attendance_records_deleted": att_count,
        "deductions_deleted": ded_count,
    }


# ──────────────────────────────────────────────
# LOP Report
# ──────────────────────────────────────────────

@router.get("/lop-report", response_model=LOPReportOut)
def lop_report(
    cycle_start: str = Query(..., description="Cycle start date YYYY-MM-DD (must be the 20th)"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        cs = datetime.date.fromisoformat(cycle_start)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    ce = _cycle_end(cs)

    # Fetch all deductions for this cycle grouped by employee
    rows = (
        db.query(AttendanceDeduction)
        .filter_by(payroll_cycle_start=cycle_start)
        .order_by(AttendanceDeduction.employee_id, AttendanceDeduction.date)
        .all()
    )

    # Group by employee
    emp_deductions: dict[int, list[AttendanceDeduction]] = {}
    for row in rows:
        emp_deductions.setdefault(row.employee_id, []).append(row)

    # Load employee info
    employee_ids = list(emp_deductions.keys())
    emps: dict[int, Employee] = {
        e.id: e
        for e in db.query(Employee).filter(Employee.id.in_(employee_ids)).all()
    }

    result_employees = []
    for emp_id, deds in emp_deductions.items():
        emp = emps.get(emp_id)
        name = f"{emp.first_name} {emp.last_name}" if emp else f"Employee #{emp_id}"
        code = emp.employee_code if emp else None
        total = round(sum(float(d.deduction_days) for d in deds), 3)
        result_employees.append(
            EmployeeLOPOut(
                employee_id=emp_id,
                employee_name=name,
                employee_code=code,
                total_deduction_days=total,
                deductions=[
                    DeductionItemOut(
                        id=d.id,
                        date=d.date,
                        deduction_type=d.deduction_type.value,
                        deduction_days=float(d.deduction_days),
                        reason=d.reason,
                    )
                    for d in deds
                ],
            )
        )

    return LOPReportOut(
        cycle_start=cycle_start,
        cycle_end=ce.strftime("%Y-%m-%d"),
        employees=result_employees,
    )


# ──────────────────────────────────────────────
# HR Manual Deduction Override
# ──────────────────────────────────────────────

@router.post("/deduction/override", response_model=DeductionItemOut)
def override_deduction(
    payload: DeductionOverrideRequest,
    db: Session = Depends(get_db),
    _=Depends(_require_hr_or_admin),
):
    """HR / Super Admin sets a manual deduction for an employee on a specific day.

    Existing system-calculated rows for that day are marked superseded (kept for
    audit) and a new MANUAL_OVERRIDE row becomes the effective deduction.
    """
    emp = db.query(Employee).filter_by(id=payload.employee_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")

    # Mark any existing system rows as superseded via reason annotation
    existing = (
        db.query(AttendanceDeduction)
        .filter_by(
            employee_id=payload.employee_id,
            payroll_cycle_start=payload.cycle_start,
            date=payload.date,
        )
        .all()
    )
    for row in existing:
        if not row.is_manual_override:
            row.reason = f"[superseded by HR override] {row.reason or ''}"
        else:
            # Remove previous manual override so there's only one active
            db.delete(row)
    db.flush()

    override = AttendanceDeduction(
        employee_id=payload.employee_id,
        payroll_cycle_start=payload.cycle_start,
        date=payload.date,
        deduction_type=DeductionType.MANUAL_OVERRIDE,
        deduction_days=payload.deduction_days,
        reason=payload.reason,
        is_manual_override=True,
    )
    db.add(override)
    db.commit()
    db.refresh(override)
    return override


@router.delete("/deduction/override")
def revert_override(
    payload: DeductionOverrideDelete,
    db: Session = Depends(get_db),
    _=Depends(_require_hr_or_admin),
):
    """Remove the manual override for a day — restores the system-calculated rows."""
    # Delete the manual override row
    db.query(AttendanceDeduction).filter_by(
        employee_id=payload.employee_id,
        payroll_cycle_start=payload.cycle_start,
        date=payload.date,
        is_manual_override=True,
    ).delete()

    # Restore superseded rows by stripping the annotation prefix
    restored = (
        db.query(AttendanceDeduction)
        .filter_by(
            employee_id=payload.employee_id,
            payroll_cycle_start=payload.cycle_start,
            date=payload.date,
        )
        .all()
    )
    prefix = "[superseded by HR override] "
    for row in restored:
        if row.reason and row.reason.startswith(prefix):
            row.reason = row.reason[len(prefix):] or None

    db.commit()
    return {"message": "Manual override removed; system deductions restored."}


# ──────────────────────────────────────────────
# Full Attendance + OT Report
# ──────────────────────────────────────────────

@router.get("/attendance-report", response_model=AttendanceReportOut)
def attendance_report(
    cycle_start: str = Query(..., description="Cycle start YYYY-MM-DD (must be the 21st)"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        cs = datetime.date.fromisoformat(cycle_start)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    ce = _cycle_end(cs)
    policy = _get_or_create_policy(db)
    cycle_start_str = cs.strftime("%Y-%m-%d")
    cycle_end_str = ce.strftime("%Y-%m-%d")

    # Holidays in cycle
    holidays_map: dict[str, str] = {
        h.holiday_date.strftime("%Y-%m-%d"): h.name
        for h in db.query(Holiday).filter(
            Holiday.holiday_date >= cs,
            Holiday.holiday_date <= ce,
            Holiday.is_active == True,
        ).all()
    }

    # All shifts indexed by id and name
    all_shifts_by_id: dict[int, Shift] = {s.id: s for s in db.query(Shift).filter_by(is_active=True).all()}
    all_shifts_by_name: dict[str, Shift] = {s.name: s for s in all_shifts_by_id.values()}

    # All active employees (not just those who punched in — fully absent employees must appear too)
    employees: dict[int, Employee] = {
        e.id: e
        for e in db.query(Employee).filter(
            Employee.employee_status.in_(["active", "probation", "notice_period"]),
            Employee.is_active == True,
        ).all()
    }

    if not employees:
        return AttendanceReportOut(
            cycle_start=cycle_start_str,
            cycle_end=cycle_end_str,
            all_dates=[d.strftime("%Y-%m-%d") for d in _cycle_dates(cs)],
            employees=[],
        )

    all_emp_ids = set(employees.keys())

    # Attendance records keyed by (emp_id, date)
    att_map: dict[tuple[int, str], AttendanceRecord] = {}
    for r in db.query(AttendanceRecord).filter(
        AttendanceRecord.employee_id.in_(all_emp_ids),
        AttendanceRecord.date >= cycle_start_str,
        AttendanceRecord.date <= cycle_end_str,
    ).all():
        att_map[(r.employee_id, r.date)] = r

    # Deductions keyed by (emp_id, date)
    ded_map: dict[tuple[int, str], list[AttendanceDeduction]] = {}
    for d in db.query(AttendanceDeduction).filter(
        AttendanceDeduction.employee_id.in_(all_emp_ids),
        AttendanceDeduction.payroll_cycle_start == cycle_start_str,
    ).all():
        ded_map.setdefault((d.employee_id, d.date), []).append(d)

    # Leave applications spanning the cycle
    leave_map: dict[tuple[int, str], LeaveApplication] = {}
    for app in db.query(LeaveApplication).filter(
        LeaveApplication.employee_id.in_(all_emp_ids),
        LeaveApplication.from_date <= ce,
        LeaveApplication.to_date >= cs,
        LeaveApplication.status != LeaveStatus.CANCELLED,
    ).all():
        d = app.from_date
        while d <= app.to_date:
            ds = d.strftime("%Y-%m-%d")
            # Approved leave takes precedence over pending
            key = (app.employee_id, ds)
            existing = leave_map.get(key)
            if existing is None or app.status == LeaveStatus.APPROVED:
                leave_map[key] = app
            d += datetime.timedelta(days=1)

    all_dates = _cycle_dates(cs)
    result_employees: list[EmployeeAttendanceSummary] = []

    for emp_id in sorted(all_emp_ids):
        emp = employees.get(emp_id)
        if not emp:
            continue

        # Resolve this employee's shift thresholds (start, end, grace, cutoffs)
        s_start, s_end, _grace, _max_grace, _hd_late, _hd_early = _resolve_shift_thresholds(
            emp, all_shifts_by_name, policy, all_shifts_by_id
        )
        shift_start_mins = _to_minutes(s_start)
        shift_end_mins   = _to_minutes(s_end)
        shift_dur_mins   = shift_end_mins - shift_start_mins

        # Friendly label for the employee row header
        shift_obj = (
            all_shifts_by_id.get(emp.shift_id) if emp.shift_id else None
        ) or all_shifts_by_name.get(emp.shift or "")
        if shift_obj and shift_obj.start_time and shift_obj.end_time:
            shift_info = f"{shift_obj.name} ({shift_obj.start_time}–{shift_obj.end_time})"
        else:
            shift_info = f"Default ({s_start}–{s_end})"

        days_out: list[DayAttendanceOut] = []
        total_present = total_absent = total_wo = total_holidays = total_leave = 0
        total_ot_mins = 0.0
        total_ded_days = 0.0

        for d in all_dates:
            ds = d.strftime("%Y-%m-%d")
            is_weekend = d.weekday() == 6  # only Sunday is week off
            is_hol = ds in holidays_map
            att = att_map.get((emp_id, ds))
            all_day_deds = ded_map.get((emp_id, ds), [])
            # If an HR override exists, it is the sole effective deduction.
            # System rows for the same day are kept in DB for audit but not shown.
            manual_rows = [d for d in all_day_deds if d.is_manual_override]
            effective_deds = manual_rows if manual_rows else [
                d for d in all_day_deds if not d.reason or not d.reason.startswith("[superseded")
            ]
            ded_days = sum(float(x.deduction_days) for x in effective_deds)
            ded_reasons = [x.reason for x in effective_deds if x.reason]
            ded_ids = [x.id for x in effective_deds]
            has_override = bool(manual_rows)

            # Pre-compute both modes for the HR override UI.
            # penalty  = sum of system-calculated (non-overridden) rows already in DB.
            # actual_h = (late_mins + early_mins) / shift_duration — computed on-the-fly.
            system_rows = [
                d for d in all_day_deds
                if not d.is_manual_override
                and not (d.reason and d.reason.startswith("[superseded"))
            ]
            precomp_penalty = round(sum(float(x.deduction_days) for x in system_rows), 3)

            # Determine status
            if is_hol:
                status = "H"
                total_holidays += 1
            elif is_weekend or (att is not None and att.status in ("WO", "WOP")):
                status = "WO"
                total_wo += 1
            elif att is not None and att.status == "P":
                status = "P"
                total_present += 1
            else:
                leave = leave_map.get((emp_id, ds))
                if leave:
                    status = "LV"
                    total_leave += 1
                else:
                    status = "A"
                    total_absent += 1

            ot_minutes = 0
            late_by = 0
            early_by = 0

            if status == "P" and att:
                # Late arrival — against employee's own shift start
                if att.in_time:
                    try:
                        in_m = _to_minutes(att.in_time)
                        if in_m > shift_start_mins:
                            late_by = in_m - shift_start_mins
                    except Exception:
                        pass

                # Early leaving / OT — against employee's own shift end
                if att.out_time:
                    try:
                        out_m = _out_minutes(att.out_time)
                        diff = out_m - shift_end_mins
                        if diff >= 60:
                            # Stayed ≥1 h past shift end → OT
                            ot_minutes = diff
                            total_ot_mins += diff
                        elif diff < 0:
                            # Left before shift end
                            early_by = -diff
                    except Exception:
                        pass

            elif status in ("WO", "H") and att and att.in_time and att.out_time:
                # Working on WO / Holiday — entire punched duration is OT
                try:
                    in_m  = _to_minutes(att.in_time)
                    out_m = _out_minutes(att.out_time)
                    dur   = out_m - in_m
                    if dur > 0:
                        ot_minutes = dur
                        total_ot_mins += dur
                except Exception:
                    pass

            total_ded_days += ded_days

            # Actual-hours deduction = (late + early) proportional to shift duration
            precomp_actual_hours = 0.0
            if status == "P" and shift_dur_mins > 0 and (late_by + early_by) > 0:
                precomp_actual_hours = round((late_by + early_by) / shift_dur_mins, 3)

            days_out.append(DayAttendanceOut(
                date=ds,
                day_name=d.strftime("%a"),
                is_weekend=is_weekend,
                is_holiday=is_hol,
                holiday_name=holidays_map.get(ds),
                status=status,
                in_time=att.in_time if att else None,
                out_time=att.out_time if att else None,
                working_minutes=att.duration_minutes if att else None,
                late_by_minutes=late_by,
                early_by_minutes=early_by,
                ot_minutes=ot_minutes,
                deduction_days=round(ded_days, 3),
                deduction_reasons=ded_reasons,
                deduction_ids=ded_ids,
                has_manual_override=has_override,
                deduction_actual_hours=precomp_actual_hours,
                deduction_penalty=precomp_penalty,
            ))

        result_employees.append(EmployeeAttendanceSummary(
            employee_id=emp_id,
            employee_name=f"{emp.first_name} {emp.last_name}",
            employee_code=emp.employee_code,
            shift_info=shift_info,
            shift_duration_minutes=shift_dur_mins,
            days=days_out,
            total_present=total_present,
            total_absent=total_absent,
            total_wo=total_wo,
            total_holidays=total_holidays,
            total_leave=total_leave,
            total_ot_hours=round(total_ot_mins / 60, 2),
            total_deduction_days=round(total_ded_days, 3),
        ))

    return AttendanceReportOut(
        cycle_start=cycle_start_str,
        cycle_end=cycle_end_str,
        all_dates=[d.strftime("%Y-%m-%d") for d in all_dates],
        employees=result_employees,
    )
