from __future__ import annotations

import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.routers.auth_router import get_current_user as _legacy_get_current_user
from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.attendance import AttendanceRecord
from app.models.attendance_deduction import AttendanceDeduction, DeductionType
from app.models.employee import Employee
from app.models.holiday import Holiday
from app.models.leave_application import LeaveApplication, LeaveStatus
from app.models.shift import Shift
from app.models.payroll_config import (
    PayrollModule, PayrollESICConfig, PayrollOTConfig,
    PayrollPFConfig, PayrollPTSlab, PayrollSalaryConfig,
)
from app.models.payroll_run import RunStatus
from app.models.payroll_entry import PayrollEntry
from app.schemas.payroll_schema import (
    AttendanceOut, AttendanceUpsert, AttendanceReportOut, ESICConfigOut,
    HoldRequest, DeductionItemOut, DeductionOverrideDelete, DeductionOverrideRequest,
    DayAttendanceOut, EmployeeAttendanceSummary,
    EmployeeLOPOut, LOPCalculateRequest, LOPReportOut,
    ManualInputOut, ManualInputUpsert, MarkPaidRequest,
    ModuleChangeRequest, ModuleHistoryOut, OTConfigOut, PFConfigOut,
    PayrollEntryOut, PayrollPolicyOut, PayrollPolicyUpdate,
    PayrollRunCreate, PayrollRunOut, PTSlabOut,
    RunSummaryOut, SalaryConfigOut, UnlockRequest,
)
from app.services import payroll_service as svc
from app.services.lop_calculation_service import (
    _cycle_dates, _cycle_end, _get_or_create_policy,
    _out_minutes, _resolve_shift_thresholds, _to_minutes,
    calculate_lop_bulk, calculate_lop_for_employee,
)

router = APIRouter(prefix="/payroll", tags=["payroll"])


def _require_hr_or_admin(current_user=Depends(_legacy_get_current_user)):
    is_super = any(r.role.name == "SUPER_ADMIN" for r in current_user.user_roles)
    has_admin_module = any(m.module == "admin" for m in current_user.module_access)
    if not (is_super or has_admin_module):
        raise HTTPException(403, "Super Admin or HR (admin module) access required")
    return current_user


# ── Legacy: Policy ────────────────────────────────────────────────────────────

@router.get("/policy", response_model=PayrollPolicyOut)
def get_policy(db: Session = Depends(get_db), _=Depends(_legacy_get_current_user)):
    return _get_or_create_policy(db)


@router.put("/policy", response_model=PayrollPolicyOut)
def update_policy(payload: PayrollPolicyUpdate, db: Session = Depends(get_db), _=Depends(_require_hr_or_admin)):
    policy = _get_or_create_policy(db)
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(policy, field, val)
    db.commit(); db.refresh(policy)
    return policy


# ── Legacy: Calculate LOP ─────────────────────────────────────────────────────

@router.post("/calculate-lop")
def calculate_lop(payload: LOPCalculateRequest, db: Session = Depends(get_db), _=Depends(_require_hr_or_admin)):
    results = calculate_lop_bulk(db, payload.cycle_start)
    total = sum(sum(float(d.deduction_days) for d in deds) for deds in results.values())
    return {"message": f"LOP calculation complete for cycle starting {payload.cycle_start}", "employees_processed": len(results), "total_deduction_days": round(total, 3)}


@router.post("/calculate-lop/{employee_id}")
def calculate_lop_single(employee_id: int, payload: LOPCalculateRequest, db: Session = Depends(get_db), _=Depends(_require_hr_or_admin)):
    emp = db.query(Employee).filter_by(id=employee_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    deductions = calculate_lop_for_employee(db, employee_id, payload.cycle_start, overwrite=True)
    db.commit()
    return {"message": f"LOP recalculated for {emp.first_name} {emp.last_name}", "deduction_count": len(deductions), "total_deduction_days": round(sum(float(d.deduction_days) for d in deductions), 3)}


# ── Legacy: LOP Report ────────────────────────────────────────────────────────

@router.get("/lop-report", response_model=LOPReportOut)
def lop_report(cycle_start: str = Query(...), db: Session = Depends(get_db), _=Depends(_legacy_get_current_user)):
    try:
        cs = datetime.date.fromisoformat(cycle_start)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
    ce = _cycle_end(cs)
    rows = db.query(AttendanceDeduction).filter_by(payroll_cycle_start=cycle_start).order_by(AttendanceDeduction.employee_id, AttendanceDeduction.date).all()
    emp_deductions: dict[int, list] = {}
    for row in rows:
        emp_deductions.setdefault(row.employee_id, []).append(row)
    emps = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(list(emp_deductions.keys()))).all()}
    result = []
    for emp_id, deds in emp_deductions.items():
        emp = emps.get(emp_id)
        name = f"{emp.first_name} {emp.last_name}" if emp else f"Employee #{emp_id}"
        result.append(EmployeeLOPOut(employee_id=emp_id, employee_name=name, employee_code=emp.employee_code if emp else None, total_deduction_days=round(sum(float(d.deduction_days) for d in deds), 3), deductions=[DeductionItemOut(id=d.id, date=d.date, deduction_type=d.deduction_type.value, deduction_days=float(d.deduction_days), reason=d.reason) for d in deds]))
    return LOPReportOut(cycle_start=cycle_start, cycle_end=ce.strftime("%Y-%m-%d"), employees=result)


# ── Legacy: Deduction Overrides ───────────────────────────────────────────────

@router.post("/deduction/override", response_model=DeductionItemOut)
def override_deduction(payload: DeductionOverrideRequest, db: Session = Depends(get_db), _=Depends(_require_hr_or_admin)):
    if not db.query(Employee).filter_by(id=payload.employee_id).first():
        raise HTTPException(404, "Employee not found")
    existing = db.query(AttendanceDeduction).filter_by(employee_id=payload.employee_id, payroll_cycle_start=payload.cycle_start, date=payload.date).all()
    for row in existing:
        if not row.is_manual_override:
            row.reason = f"[superseded by HR override] {row.reason or ''}"
        else:
            db.delete(row)
    db.flush()
    override = AttendanceDeduction(employee_id=payload.employee_id, payroll_cycle_start=payload.cycle_start, date=payload.date, deduction_type=DeductionType.MANUAL_OVERRIDE, deduction_days=payload.deduction_days, reason=payload.reason, is_manual_override=True)
    db.add(override); db.commit(); db.refresh(override)
    return override


@router.delete("/deduction/override")
def revert_override(payload: DeductionOverrideDelete, db: Session = Depends(get_db), _=Depends(_require_hr_or_admin)):
    db.query(AttendanceDeduction).filter_by(employee_id=payload.employee_id, payroll_cycle_start=payload.cycle_start, date=payload.date, is_manual_override=True).delete()
    prefix = "[superseded by HR override] "
    for row in db.query(AttendanceDeduction).filter_by(employee_id=payload.employee_id, payroll_cycle_start=payload.cycle_start, date=payload.date).all():
        if row.reason and row.reason.startswith(prefix):
            row.reason = row.reason[len(prefix):] or None
    db.commit()
    return {"message": "Manual override removed; system deductions restored."}


# ── Legacy: Delete cycle attendance ──────────────────────────────────────────

@router.delete("/attendance")
def delete_cycle_attendance(cycle_start: str = Query(...), db: Session = Depends(get_db), _=Depends(_require_hr_or_admin)):
    try:
        cs = datetime.date.fromisoformat(cycle_start)
        ce = _cycle_end(cs)
    except ValueError:
        raise HTTPException(400, "Invalid date")
    cs_str = cs.strftime("%Y-%m-%d"); ce_str = ce.strftime("%Y-%m-%d")
    deds_del = db.query(AttendanceDeduction).filter_by(payroll_cycle_start=cs_str).delete()
    att_del  = db.query(AttendanceRecord).filter(AttendanceRecord.date >= cs_str, AttendanceRecord.date <= ce_str).delete()
    db.commit()
    return {"attendance_records_deleted": att_del, "deductions_deleted": deds_del}


# ── Legacy: Full Attendance + OT Report ──────────────────────────────────────

@router.get("/attendance-report", response_model=AttendanceReportOut)
def attendance_report(cycle_start: str = Query(...), db: Session = Depends(get_db), _=Depends(_legacy_get_current_user)):
    try:
        cs = datetime.date.fromisoformat(cycle_start)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
    ce = _cycle_end(cs)
    policy = _get_or_create_policy(db)
    cs_str = cs.strftime("%Y-%m-%d"); ce_str = ce.strftime("%Y-%m-%d")
    holidays_map = {h.holiday_date.strftime("%Y-%m-%d"): h.name for h in db.query(Holiday).filter(Holiday.holiday_date >= cs, Holiday.holiday_date <= ce, Holiday.is_active == True).all()}
    all_shifts_by_id = {s.id: s for s in db.query(Shift).filter_by(is_active=True).all()}
    all_shifts_by_name = {s.name: s for s in all_shifts_by_id.values()}
    employees = {e.id: e for e in db.query(Employee).filter(Employee.employee_status.in_(["active", "probation", "notice_period"]), Employee.is_active == True).all()}
    if not employees:
        return AttendanceReportOut(cycle_start=cs_str, cycle_end=ce_str, all_dates=[d.strftime("%Y-%m-%d") for d in _cycle_dates(cs)], employees=[])
    all_emp_ids = set(employees.keys())
    att_map = {(r.employee_id, r.date): r for r in db.query(AttendanceRecord).filter(AttendanceRecord.employee_id.in_(all_emp_ids), AttendanceRecord.date >= cs_str, AttendanceRecord.date <= ce_str).all()}
    ded_map: dict = {}
    for d in db.query(AttendanceDeduction).filter(AttendanceDeduction.employee_id.in_(all_emp_ids), AttendanceDeduction.payroll_cycle_start == cs_str).all():
        ded_map.setdefault((d.employee_id, d.date), []).append(d)
    leave_map: dict = {}
    for app in db.query(LeaveApplication).filter(LeaveApplication.employee_id.in_(all_emp_ids), LeaveApplication.from_date <= ce, LeaveApplication.to_date >= cs, LeaveApplication.status != LeaveStatus.CANCELLED).all():
        d = app.from_date
        while d <= app.to_date:
            ds = d.strftime("%Y-%m-%d"); key = (app.employee_id, ds); existing = leave_map.get(key)
            if existing is None or app.status == LeaveStatus.APPROVED: leave_map[key] = app
            d += datetime.timedelta(days=1)
    all_dates = _cycle_dates(cs); result_employees = []
    for emp_id in sorted(all_emp_ids):
        emp = employees.get(emp_id)
        if not emp: continue
        s_start, s_end, _grace, _max_grace, _hd_late, _hd_early = _resolve_shift_thresholds(emp, all_shifts_by_name, policy, all_shifts_by_id)
        shift_start_mins = _to_minutes(s_start); shift_end_mins = _to_minutes(s_end); shift_dur_mins = shift_end_mins - shift_start_mins
        shift_obj = (all_shifts_by_id.get(emp.shift_id) if emp.shift_id else None) or all_shifts_by_name.get(emp.shift or "")
        shift_info = f"{shift_obj.name} ({shift_obj.start_time}–{shift_obj.end_time})" if shift_obj and shift_obj.start_time and shift_obj.end_time else f"Default ({s_start}–{s_end})"
        days_out = []; total_present = total_absent = total_wo = total_holidays = total_leave = 0; total_ot_mins = 0.0; total_ded_days = 0.0
        for d in all_dates:
            ds = d.strftime("%Y-%m-%d"); is_weekend = d.weekday() == 6; is_hol = ds in holidays_map
            att = att_map.get((emp_id, ds)); all_day_deds = ded_map.get((emp_id, ds), [])
            manual_rows = [x for x in all_day_deds if x.is_manual_override]
            effective_deds = manual_rows if manual_rows else [x for x in all_day_deds if not x.reason or not x.reason.startswith("[superseded")]
            ded_days = sum(float(x.deduction_days) for x in effective_deds); ded_reasons = [x.reason for x in effective_deds if x.reason]; ded_ids = [x.id for x in effective_deds]; has_override = bool(manual_rows)
            system_rows = [x for x in all_day_deds if not x.is_manual_override and not (x.reason and x.reason.startswith("[superseded"))]
            precomp_penalty = round(sum(float(x.deduction_days) for x in system_rows), 3)
            if is_hol: status = "H"; total_holidays += 1
            elif is_weekend or (att is not None and att.status in ("WO", "WOP")): status = "WO"; total_wo += 1
            elif att is not None and att.status == "P": status = "P"; total_present += 1
            else:
                leave = leave_map.get((emp_id, ds))
                if leave: status = "LV"; total_leave += 1
                else: status = "A"; total_absent += 1
            ot_minutes = 0; late_by = 0; early_by = 0
            if status == "P" and att:
                if att.in_time:
                    try:
                        in_m = _to_minutes(att.in_time)
                        if in_m > shift_start_mins: late_by = in_m - shift_start_mins
                    except Exception: pass
                if att.out_time:
                    try:
                        out_m = _out_minutes(att.out_time); diff = out_m - shift_end_mins
                        if diff >= 60: ot_minutes = diff; total_ot_mins += diff
                        elif diff < 0: early_by = -diff
                    except Exception: pass
            elif status in ("WO", "H") and att and att.in_time and att.out_time:
                try:
                    in_m = _to_minutes(att.in_time); out_m = _out_minutes(att.out_time); dur = out_m - in_m
                    if dur > 0: ot_minutes = dur; total_ot_mins += dur
                except Exception: pass
            total_ded_days += ded_days
            precomp_actual_hours = round((late_by + early_by) / shift_dur_mins, 3) if status == "P" and shift_dur_mins > 0 and (late_by + early_by) > 0 else 0.0
            days_out.append(DayAttendanceOut(date=ds, day_name=d.strftime("%a"), is_weekend=is_weekend, is_holiday=is_hol, holiday_name=holidays_map.get(ds), status=status, in_time=att.in_time if att else None, out_time=att.out_time if att else None, working_minutes=att.duration_minutes if att else None, late_by_minutes=late_by, early_by_minutes=early_by, ot_minutes=ot_minutes, deduction_days=round(ded_days, 3), deduction_reasons=ded_reasons, deduction_ids=ded_ids, has_manual_override=has_override, deduction_actual_hours=precomp_actual_hours, deduction_penalty=precomp_penalty))
        result_employees.append(EmployeeAttendanceSummary(employee_id=emp_id, employee_name=f"{emp.first_name} {emp.last_name}", employee_code=emp.employee_code, shift_info=shift_info, shift_duration_minutes=shift_dur_mins, days=days_out, total_present=total_present, total_absent=total_absent, total_wo=total_wo, total_holidays=total_holidays, total_leave=total_leave, total_ot_hours=round(total_ot_mins / 60, 2), total_deduction_days=round(total_ded_days, 3)))
    return AttendanceReportOut(cycle_start=cs_str, cycle_end=ce_str, all_dates=[d.strftime("%Y-%m-%d") for d in all_dates], employees=result_employees)


# ── Runs ──────────────────────────────────────────────────────────────────────

@router.post("/runs", response_model=PayrollRunOut, status_code=201)
def create_run(body: PayrollRunCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.create_run(
        db, body.period_year, body.period_month, body.payroll_module,
        body.total_days, body.working_days, user.id,
    )


@router.get("/runs", response_model=list[PayrollRunOut])
def list_runs(
    year: Optional[int] = None, month: Optional[int] = None,
    module: Optional[PayrollModule] = None, status: Optional[RunStatus] = None,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    return svc.list_runs(db, year, month, module, status)


@router.get("/runs/{run_id}", response_model=PayrollRunOut)
def get_run(run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.get_run(db, run_id)


@router.post("/runs/{run_id}/compute", response_model=dict)
def compute_run(run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    entries = svc.compute_run(db, run_id, user.id)
    return {"computed": len(entries)}


@router.post("/runs/{run_id}/approve-all", response_model=dict)
def approve_all(run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    count = svc.approve_all(db, run_id, user.id)
    return {"approved": count}


@router.post("/runs/{run_id}/lock", response_model=PayrollRunOut)
def lock_run(run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.lock_run(db, run_id, user.id)


@router.post("/runs/{run_id}/unlock", response_model=PayrollRunOut)
def unlock_run(run_id: int, body: UnlockRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.unlock_run(db, run_id, user.id, body.reason)


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    svc.delete_run(db, run_id, user.id)


@router.get("/runs/{run_id}/summary", response_model=RunSummaryOut)
def run_summary(run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.run_summary(db, run_id)


@router.post("/runs/{run_id}/load-attendance", response_model=dict)
def load_attendance_from_report(
    run_id: int, db: Session = Depends(get_db), user=Depends(get_current_user),
):
    """
    Upsert PayrollAttendance rows from attendance/deduction records for this run's cycle.
    Existing rows are overwritten so HR can re-load after biometric corrections.
    """
    from app.models.payroll_run import RunStatus

    run = svc.get_run(db, run_id)
    if run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Cannot modify attendance: run is locked")

    employees_list = svc._employees_for_module(db, run.payroll_module)
    if not employees_list:
        return {"loaded": 0}

    derived = svc.derive_attendance_from_records(db, run, employees_list)

    y, m = run.period_year, run.period_month
    cs = datetime.date(y - 1, 12, 21) if m == 1 else datetime.date(y, m - 1, 21)
    ce = _cycle_end(cs)

    loaded = 0
    for emp in employees_list:
        lop, ot = derived.get(emp.id, (0.0, 0.0))
        row = db.scalar(
            select(PayrollAttendance).where(
                PayrollAttendance.run_id == run_id,
                PayrollAttendance.employee_id == emp.id,
            )
        )
        if row:
            row.lop_days   = lop
            row.ot_hours   = ot
            row.entered_by = user.id
        else:
            row = PayrollAttendance(
                run_id=run_id, employee_id=emp.id,
                lop_days=lop, ot_hours=ot, duty_hours=8.5,
                entered_by=user.id,
            )
            db.add(row)
        loaded += 1

    db.commit()
    return {"loaded": loaded, "cycle_start": cs.strftime("%Y-%m-%d"), "cycle_end": ce.strftime("%Y-%m-%d")}


# ── Entries ───────────────────────────────────────────────────────────────────

@router.get("/runs/{run_id}/entries", response_model=list[PayrollEntryOut])
def list_entries(
    run_id: int, status: Optional[str] = None,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    q = (
        select(PayrollEntry)
        .options(selectinload(PayrollEntry.employee))
        .where(PayrollEntry.run_id == run_id)
    )
    if status:
        q = q.where(PayrollEntry.approval_status == status)
    return list(db.scalars(q).all())


@router.get("/runs/{run_id}/entries/{employee_id}", response_model=PayrollEntryOut)
def get_entry_for_employee(
    run_id: int, employee_id: int,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    entry = db.scalar(
        select(PayrollEntry)
        .options(selectinload(PayrollEntry.employee))
        .where(PayrollEntry.run_id == run_id, PayrollEntry.employee_id == employee_id)
    )
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry


@router.get("/entries/{entry_id}", response_model=PayrollEntryOut)
def get_entry(entry_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    entry = db.scalar(
        select(PayrollEntry)
        .options(selectinload(PayrollEntry.employee))
        .where(PayrollEntry.id == entry_id)
    )
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry


@router.post("/entries/{entry_id}/approve", response_model=PayrollEntryOut)
def approve_entry(entry_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.approve_entry(db, entry_id, user.id)


@router.post("/entries/{entry_id}/hold", response_model=PayrollEntryOut)
def hold_entry(entry_id: int, body: HoldRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.hold_entry(db, entry_id, body.reason, user.id)


@router.post("/entries/{entry_id}/release", response_model=PayrollEntryOut)
def release_entry(entry_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.release_entry(db, entry_id, user.id)


@router.post("/entries/{entry_id}/mark-paid", response_model=PayrollEntryOut)
def mark_paid(entry_id: int, body: MarkPaidRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.mark_paid(db, entry_id, user.id, body.paid_at, body.remarks)


# ── Attendance ────────────────────────────────────────────────────────────────

@router.patch("/runs/{run_id}/attendance/{employee_id}", response_model=AttendanceOut)
def upsert_attendance(
    run_id: int, employee_id: int, body: AttendanceUpsert,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    return svc.upsert_attendance(
        db, run_id, employee_id, body.lop_days, body.ot_hours, body.duty_hours, user.id,
    )


# ── Manual Inputs ─────────────────────────────────────────────────────────────

@router.patch("/runs/{run_id}/manual-inputs/{employee_id}", response_model=ManualInputOut)
def upsert_manual_inputs(
    run_id: int, employee_id: int, body: ManualInputUpsert,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    return svc.upsert_manual_inputs(db, run_id, employee_id, body.model_dump(), user.id)


# ── Employee transitions ──────────────────────────────────────────────────────

@router.get("/employees/pending-transitions", response_model=list[dict])
def pending_transitions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.pending_transitions(db)


@router.get("/employees/{employee_id}/eligibility", response_model=dict)
def check_eligibility(employee_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return svc.check_eligibility(db, employee_id)


@router.post("/employees/{employee_id}/change-module", response_model=ModuleHistoryOut)
def change_module(
    employee_id: int, body: ModuleChangeRequest,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    return svc.change_module(
        db, employee_id, body.to_module.value, body.effective_date, body.reason, user.id,
    )


# ── Configuration ─────────────────────────────────────────────────────────────

@router.get("/config/pf", response_model=list[PFConfigOut])
def get_pf_config(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return list(db.scalars(select(PayrollPFConfig).order_by(PayrollPFConfig.effective_from.desc())).all())


@router.get("/config/esic", response_model=list[ESICConfigOut])
def get_esic_config(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return list(db.scalars(select(PayrollESICConfig).order_by(PayrollESICConfig.effective_from.desc())).all())


@router.get("/config/salary-structure", response_model=list[SalaryConfigOut])
def get_salary_config(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return list(db.scalars(select(PayrollSalaryConfig).order_by(PayrollSalaryConfig.effective_from.desc())).all())


@router.get("/config/ot", response_model=list[OTConfigOut])
def get_ot_config(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return list(db.scalars(select(PayrollOTConfig).order_by(PayrollOTConfig.employee_type)).all())


@router.get("/config/pt-slabs", response_model=list[PTSlabOut])
def get_pt_slabs(
    state: str = Query("Maharashtra"),
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    return list(db.scalars(
        select(PayrollPTSlab)
        .where(PayrollPTSlab.state == state)
        .order_by(PayrollPTSlab.gender, PayrollPTSlab.min_gross)
    ).all())
