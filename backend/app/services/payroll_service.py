"""
PayrollService — orchestrates runs, config loading, computation, and approval.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.employee import Employee, EmploymentType, EmployeeCategory, PaymentMode
from app.models.employee_statutory import EmployeeStatutory
from app.models.payroll_config import (
    OTEmployeeType, PayrollModule, PayrollESICConfig, PayrollModuleConfig,
    PayrollOTConfig, PayrollPFConfig, PayrollPTSlab, PayrollSalaryConfig,
)
from app.models.payroll_entry import (
    EmployeeModuleHistory, EntryApprovalStatus, PayrollAuditLog, PayrollEntry,
)
from app.models.attendance import AttendanceRecord
from app.models.attendance_deduction import AttendanceDeduction
from app.models.holiday import Holiday
from app.models.shift import Shift
from app.models.payroll_run import PayrollAttendance, PayrollManualInput, PayrollRun, RunStatus
from app.services import payroll_calculator as calc
from app.services.lop_calculation_service import (
    _cycle_dates, _cycle_end, _get_or_create_policy,
    _out_minutes, _resolve_shift_thresholds, _to_minutes,
)


# ── Module classification helpers ────────────────────────────────────────────

_PROBATION_MODULES = {PayrollModule.PROBATION_OFFICE, PayrollModule.PROBATION_WORKER}
_PERMANENT_MODULES = {PayrollModule.PERMANENT_OFFICE, PayrollModule.PERMANENT_WORKER}
_CONTRACT_MODULES  = {PayrollModule.CONTRACT_OFFICE,  PayrollModule.CONTRACT_WORKER}
_CONSULTANT_MODULES = {
    PayrollModule.CONSULTANT_OFFICE, PayrollModule.CONSULTANT_WORKER,
    PayrollModule.CONSULTANT_HK,     PayrollModule.CONSULTANT_SEC,
}
_CASH_MODULES = {PayrollModule.CASH_OFFICE, PayrollModule.CASH_WORKER}


def _ot_type_for_module(module: PayrollModule) -> OTEmployeeType:
    if "worker" in module.value or "housekeeping" in module.value:
        return OTEmployeeType.WORKER
    if "security" in module.value:
        return OTEmployeeType.SECURITY
    return OTEmployeeType.OFFICE_STAFF


# ── Config loaders ───────────────────────────────────────────────────────────

def _period_date(year: int, month: int) -> date:
    return date(year, month, 1)


def _load_pf_config(db: Session, as_of: date) -> PayrollPFConfig:
    row = db.scalar(
        select(PayrollPFConfig)
        .where(PayrollPFConfig.effective_from <= as_of)
        .where((PayrollPFConfig.effective_to == None) | (PayrollPFConfig.effective_to >= as_of))
        .order_by(PayrollPFConfig.effective_from.desc())
        .limit(1)
    )
    if not row:
        raise HTTPException(500, "PF configuration not found")
    return row


def _load_esic_config(db: Session, as_of: date) -> PayrollESICConfig:
    row = db.scalar(
        select(PayrollESICConfig)
        .where(PayrollESICConfig.effective_from <= as_of)
        .where((PayrollESICConfig.effective_to == None) | (PayrollESICConfig.effective_to >= as_of))
        .order_by(PayrollESICConfig.effective_from.desc())
        .limit(1)
    )
    if not row:
        raise HTTPException(500, "ESIC configuration not found")
    return row


def _load_salary_config(db: Session, as_of: date) -> PayrollSalaryConfig:
    row = db.scalar(
        select(PayrollSalaryConfig)
        .where(PayrollSalaryConfig.effective_from <= as_of)
        .where((PayrollSalaryConfig.effective_to == None) | (PayrollSalaryConfig.effective_to >= as_of))
        .order_by(PayrollSalaryConfig.effective_from.desc())
        .limit(1)
    )
    if not row:
        raise HTTPException(500, "Salary structure configuration not found")
    return row


def _load_ot_config(db: Session, as_of: date, ot_type: OTEmployeeType) -> PayrollOTConfig:
    row = db.scalar(
        select(PayrollOTConfig)
        .where(PayrollOTConfig.employee_type == ot_type)
        .where(PayrollOTConfig.effective_from <= as_of)
        .where((PayrollOTConfig.effective_to == None) | (PayrollOTConfig.effective_to >= as_of))
        .order_by(PayrollOTConfig.effective_from.desc())
        .limit(1)
    )
    if not row:
        raise HTTPException(500, f"OT configuration not found for {ot_type.value}")
    return row


def _load_module_config(db: Session, module: PayrollModule, as_of: date) -> PayrollModuleConfig:
    row = db.scalar(
        select(PayrollModuleConfig)
        .where(PayrollModuleConfig.payroll_module == module)
        .where(PayrollModuleConfig.effective_from <= as_of)
        .where((PayrollModuleConfig.effective_to == None) | (PayrollModuleConfig.effective_to >= as_of))
        .order_by(PayrollModuleConfig.effective_from.desc())
        .limit(1)
    )
    if not row:
        raise HTTPException(500, f"Module config not found for {module.value}")
    return row


def _load_pt_slabs(db: Session, state: str, as_of: date) -> list[PayrollPTSlab]:
    return list(db.scalars(
        select(PayrollPTSlab)
        .where(PayrollPTSlab.state == state)
        .where(PayrollPTSlab.effective_from <= as_of)
        .where((PayrollPTSlab.effective_to == None) | (PayrollPTSlab.effective_to >= as_of))
    ).all())


# ── Audit helper ─────────────────────────────────────────────────────────────

def _audit(
    db: Session, event_type: str, entity_type: str, entity_id: int,
    employee_id: Optional[int] = None, run_id: Optional[int] = None,
    previous: Optional[dict] = None, new: Optional[dict] = None,
    reason: Optional[str] = None, performed_by: Optional[int] = None,
):
    db.add(PayrollAuditLog(
        event_type=event_type, entity_type=entity_type, entity_id=entity_id,
        employee_id=employee_id, run_id=run_id,
        previous_value=previous, new_value=new,
        reason=reason, performed_by=performed_by,
    ))


# ── Run management ────────────────────────────────────────────────────────────

def create_run(
    db: Session, year: int, month: int, module: PayrollModule,
    total_days: int, working_days: int, created_by: int,
) -> PayrollRun:
    existing = db.scalar(
        select(PayrollRun).where(
            PayrollRun.period_year == year,
            PayrollRun.period_month == month,
            PayrollRun.payroll_module == module,
        )
    )
    if existing:
        raise HTTPException(409, f"Payroll run for {year}-{month:02d} / {module.value} already exists")
    run = PayrollRun(
        period_year=year, period_month=month, payroll_module=module,
        total_days=total_days, working_days=working_days,
        status=RunStatus.DRAFT, created_by=created_by,
    )
    db.add(run)
    db.flush()
    _audit(db, "payroll_generated", "run", run.id, run_id=run.id,
           new={"module": module.value, "period": f"{year}-{month:02d}"},
           performed_by=created_by)
    db.commit()
    db.refresh(run)
    return run


def list_runs(
    db: Session, year: Optional[int] = None, month: Optional[int] = None,
    module: Optional[PayrollModule] = None, status: Optional[RunStatus] = None,
) -> list[PayrollRun]:
    q = select(PayrollRun)
    if year:
        q = q.where(PayrollRun.period_year == year)
    if month:
        q = q.where(PayrollRun.period_month == month)
    if module:
        q = q.where(PayrollRun.payroll_module == module)
    if status:
        q = q.where(PayrollRun.status == status)
    return list(db.scalars(q.order_by(PayrollRun.period_year.desc(), PayrollRun.period_month.desc())).all())


def get_run(db: Session, run_id: int) -> PayrollRun:
    run = db.get(PayrollRun, run_id)
    if not run:
        raise HTTPException(404, "Payroll run not found")
    return run


def delete_run(db: Session, run_id: int, user_id: int) -> None:
    from sqlalchemy import text
    run = get_run(db, run_id)
    if run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Cannot delete a locked run — unlock it first")
    # Audit log rows reference run_id without ON DELETE CASCADE, so delete them first
    db.execute(text("DELETE FROM payroll_audit_log WHERE run_id = :rid"), {"rid": run_id})
    db.delete(run)
    db.commit()


def lock_run(db: Session, run_id: int, user_id: int) -> PayrollRun:
    run = get_run(db, run_id)
    if run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Run is already locked")
    # Ensure no entries are still pending or on_hold
    pending = db.scalar(
        select(PayrollEntry).where(
            PayrollEntry.run_id == run_id,
            PayrollEntry.approval_status.in_([EntryApprovalStatus.PENDING, EntryApprovalStatus.ON_HOLD]),
        )
    )
    if pending:
        raise HTTPException(400, "Cannot lock run: some entries are still pending or on hold")
    prev = run.status.value
    run.status = RunStatus.LOCKED
    run.locked_by = user_id
    run.locked_at = datetime.utcnow()
    _audit(db, "payroll_locked", "run", run_id, run_id=run_id,
           previous={"status": prev}, new={"status": "locked"}, performed_by=user_id)
    db.commit()
    db.refresh(run)
    return run


def unlock_run(db: Session, run_id: int, user_id: int, reason: str) -> PayrollRun:
    run = get_run(db, run_id)
    if run.status != RunStatus.LOCKED:
        raise HTTPException(400, "Run is not locked")
    run.status = RunStatus.APPROVED
    run.unlock_reason = reason
    _audit(db, "payroll_unlocked", "run", run_id, run_id=run_id,
           previous={"status": "locked"}, new={"status": "approved"},
           reason=reason, performed_by=user_id)
    db.commit()
    db.refresh(run)
    return run


# ── Attendance & Manual inputs ────────────────────────────────────────────────

def upsert_attendance(
    db: Session, run_id: int, employee_id: int,
    lop_days: float, ot_hours: float, duty_hours: float, user_id: int,
) -> PayrollAttendance:
    run = get_run(db, run_id)
    if run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Cannot modify attendance: run is locked")
    row = db.scalar(
        select(PayrollAttendance).where(
            PayrollAttendance.run_id == run_id,
            PayrollAttendance.employee_id == employee_id,
        )
    )
    if row:
        prev = {"lop_days": row.lop_days, "ot_hours": row.ot_hours, "duty_hours": row.duty_hours}
        row.lop_days = lop_days
        row.ot_hours = ot_hours
        row.duty_hours = duty_hours
        row.entered_by = user_id
        _audit(db, "attendance_changed", "entry", run_id,
               employee_id=employee_id, run_id=run_id,
               previous=prev, new={"lop_days": lop_days, "ot_hours": ot_hours, "duty_hours": duty_hours},
               performed_by=user_id)
    else:
        row = PayrollAttendance(
            run_id=run_id, employee_id=employee_id,
            lop_days=lop_days, ot_hours=ot_hours, duty_hours=duty_hours,
            entered_by=user_id,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def upsert_manual_inputs(
    db: Session, run_id: int, employee_id: int, data: dict, user_id: int,
) -> PayrollManualInput:
    run = get_run(db, run_id)
    if run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Cannot modify inputs: run is locked")
    row = db.scalar(
        select(PayrollManualInput).where(
            PayrollManualInput.run_id == run_id,
            PayrollManualInput.employee_id == employee_id,
        )
    )
    if row:
        prev = {k: getattr(row, k) for k in data}
        for k, v in data.items():
            setattr(row, k, v)
        row.entered_by = user_id
        _audit(db, "manual_input_changed", "entry", run_id,
               employee_id=employee_id, run_id=run_id,
               previous=prev, new=data, performed_by=user_id)
    else:
        row = PayrollManualInput(run_id=run_id, employee_id=employee_id,
                                 entered_by=user_id, **data)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── Attendance auto-derivation ───────────────────────────────────────────────

def derive_attendance_from_records(
    db: Session, run: PayrollRun, employees: list[Employee],
) -> dict[int, tuple[float, float]]:
    """
    Derive {employee_id: (lop_days, ot_hours)} from AttendanceDeduction and
    AttendanceRecord tables for the payroll cycle of the given run.

    Cycle: period_month M → cycle_start = 21st of M-1, cycle_end = 20th of M.
    Mirrors the attendance-report endpoint logic exactly.
    """
    from collections import defaultdict

    y, m = run.period_year, run.period_month
    cs = date(y - 1, 12, 21) if m == 1 else date(y, m - 1, 21)
    ce = _cycle_end(cs)
    cs_str = cs.strftime("%Y-%m-%d")
    ce_str = ce.strftime("%Y-%m-%d")

    emp_ids = [e.id for e in employees]
    emp_map = {e.id: e for e in employees}

    # ── LOP from AttendanceDeduction ──────────────────────────────────────────
    all_deds = db.scalars(
        select(AttendanceDeduction).where(
            AttendanceDeduction.employee_id.in_(emp_ids),
            AttendanceDeduction.payroll_cycle_start == cs_str,
        )
    ).all()

    lop: dict[int, float] = {eid: 0.0 for eid in emp_ids}
    ded_by_emp_day: dict = defaultdict(list)
    for d in all_deds:
        ded_by_emp_day[(d.employee_id, d.date)].append(d)
    for (emp_id, _date), deds in ded_by_emp_day.items():
        manual_rows = [x for x in deds if x.is_manual_override]
        effective = manual_rows if manual_rows else [
            x for x in deds if not x.reason or not x.reason.startswith("[superseded")
        ]
        lop[emp_id] += sum(float(x.deduction_days) for x in effective)

    # ── OT from AttendanceRecord ──────────────────────────────────────────────
    policy = _get_or_create_policy(db)
    shifts_q = db.query(Shift).filter_by(is_active=True).all()
    shifts_by_name = {s.name: s for s in shifts_q}
    shifts_by_id   = {s.id:   s for s in shifts_q}
    holidays_set: set[str] = {
        h.holiday_date.strftime("%Y-%m-%d")
        for h in db.query(Holiday).filter(
            Holiday.holiday_date >= cs,
            Holiday.holiday_date <= ce,
            Holiday.is_active == True,
        ).all()
    }
    att_records = db.scalars(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id.in_(emp_ids),
            AttendanceRecord.date >= cs_str,
            AttendanceRecord.date <= ce_str,
        )
    ).all()
    att_map: dict[tuple, AttendanceRecord] = {(r.employee_id, r.date): r for r in att_records}

    ot: dict[int, float] = {eid: 0.0 for eid in emp_ids}
    all_dates = _cycle_dates(cs)

    for emp_id in emp_ids:
        emp = emp_map[emp_id]
        _, s_end, *_ = _resolve_shift_thresholds(emp, shifts_by_name, policy, shifts_by_id)
        shift_end_mins = _to_minutes(s_end)
        total_ot_mins = 0.0
        for d in all_dates:
            ds = d.strftime("%Y-%m-%d")
            is_weekend = d.weekday() == 6
            is_hol = ds in holidays_set
            att = att_map.get((emp_id, ds))
            if not att:
                continue
            if is_hol:
                eff = "H"
            elif is_weekend or att.status in ("WO", "WOP"):
                eff = "WO"
            elif att.status == "P":
                eff = "P"
            else:
                continue
            if eff == "P" and att.out_time:
                try:
                    diff = _out_minutes(att.out_time) - shift_end_mins
                    if diff >= 60:
                        total_ot_mins += diff
                except Exception:
                    pass
            elif eff in ("WO", "H") and att.in_time and att.out_time:
                try:
                    dur = _out_minutes(att.out_time) - _to_minutes(att.in_time)
                    if dur > 0:
                        total_ot_mins += dur
                except Exception:
                    pass
        ot[emp_id] = round(total_ot_mins / 60, 2)

    return {eid: (round(lop[eid], 3), ot[eid]) for eid in emp_ids}


# ── Compute engine ───────────────────────────────────────────────────────────

def _employees_for_module(db: Session, module: PayrollModule) -> list[Employee]:
    """
    Return employees that belong to this payroll module based on their
    employment_type, employee_category, and payment_mode.
    """
    # Map module → filters
    type_map: dict[PayrollModule, tuple[EmploymentType | None, EmployeeCategory | None, PaymentMode | None]] = {
        PayrollModule.PROBATION_OFFICE:  (EmploymentType.PROBATION,  EmployeeCategory.OFFICE_STAFF, PaymentMode.BANK),
        PayrollModule.PROBATION_WORKER:  (EmploymentType.PROBATION,  EmployeeCategory.WORKER,       PaymentMode.BANK),
        PayrollModule.PERMANENT_OFFICE:  (EmploymentType.PERMANENT,  EmployeeCategory.OFFICE_STAFF, PaymentMode.BANK),
        PayrollModule.PERMANENT_WORKER:  (EmploymentType.PERMANENT,  EmployeeCategory.WORKER,       PaymentMode.BANK),
        PayrollModule.CONTRACT_OFFICE:   (EmploymentType.CONTRACT,   EmployeeCategory.OFFICE_STAFF, PaymentMode.BANK),
        PayrollModule.CONTRACT_WORKER:   (EmploymentType.CONTRACT,   EmployeeCategory.WORKER,       PaymentMode.BANK),
        PayrollModule.CONSULTANT_OFFICE: (EmploymentType.CONSULTANT, EmployeeCategory.OFFICE_STAFF, None),
        PayrollModule.CONSULTANT_WORKER: (EmploymentType.CONSULTANT, EmployeeCategory.WORKER,       None),
        PayrollModule.CONSULTANT_HK:     (EmploymentType.CONSULTANT, EmployeeCategory.HOUSEKEEPING, None),
        PayrollModule.CONSULTANT_SEC:    (EmploymentType.CONSULTANT, EmployeeCategory.SECURITY,     None),
        PayrollModule.CASH_OFFICE:       (None, EmployeeCategory.OFFICE_STAFF, PaymentMode.CASH),
        PayrollModule.CASH_WORKER:       (None, EmployeeCategory.WORKER,       PaymentMode.CASH),
    }
    from app.models.employee import EmployeeStatus
    emp_type, emp_cat, pay_mode = type_map[module]
    q = select(Employee).where(
        Employee.is_active == True,
        Employee.employee_status == EmployeeStatus.ACTIVE,
    )
    if emp_type:
        q = q.where(Employee.employment_type == emp_type)
    if emp_cat:
        q = q.where(Employee.employee_category == emp_cat)
    if pay_mode:
        q = q.where(Employee.payment_mode == pay_mode)
    return list(db.scalars(q).all())


def compute_run(db: Session, run_id: int, computed_by: int) -> list[PayrollEntry]:
    run = get_run(db, run_id)
    if run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Cannot recompute a locked run")
    as_of = _period_date(run.period_year, run.period_month)
    module = run.payroll_module

    # Load all configs once
    pf_row   = _load_pf_config(db, as_of)
    esic_row = _load_esic_config(db, as_of)
    sal_row  = _load_salary_config(db, as_of)
    mod_row  = _load_module_config(db, module, as_of)

    pf_cfg   = calc.PFConfig(
        wage_pct=Decimal(str(pf_row.wage_pct)),
        wage_ceiling=Decimal(str(pf_row.wage_ceiling)),
        ee_rate=Decimal(str(pf_row.ee_rate)),
        er_rate=Decimal(str(pf_row.er_rate)),
    )
    esic_cfg = calc.ESICConfig(
        wage_ceiling=Decimal(str(esic_row.wage_ceiling)),
        ee_rate=Decimal(str(esic_row.ee_rate)),
        er_rate=Decimal(str(esic_row.er_rate)),
    )
    sal_cfg  = calc.SalaryConfig(
        basic_pct=Decimal(str(sal_row.basic_pct)),
        hra_pct=Decimal(str(sal_row.hra_pct)),
        others_pct=Decimal(str(sal_row.others_pct)),
    )
    mod_cfg  = calc.ModuleConfig(
        pf_enabled=mod_row.pf_enabled,
        esic_enabled=mod_row.esic_enabled,
        pt_enabled=mod_row.pt_enabled,
        ot_enabled=mod_row.ot_enabled,
        contract_deduction_rate=Decimal(str(mod_row.contract_deduction_rate)) if mod_row.contract_deduction_rate else None,
    )

    employees = _employees_for_module(db, module)
    entries   = []

    # Pre-derive LOP/OT from attendance data for all employees in one batch.
    # Used as fallback when no manual PayrollAttendance row has been saved.
    derived_attendance = derive_attendance_from_records(db, run, employees)

    for emp in employees:
        if not emp.ctc:
            continue  # skip employees with no CTC set

        statutory = db.scalar(
            select(EmployeeStatutory).where(EmployeeStatutory.employee_id == emp.id)
        )
        pt_state = (statutory.pt_state if statutory and statutory.pt_state else "Maharashtra")
        pt_slabs = _load_pt_slabs(db, pt_state, as_of)

        # Determine PF/ESIC flags for this employee
        pf_applicable  = bool(statutory and statutory.uan_number and mod_row.pf_enabled)
        esic_applicable = bool(statutory and statutory.esic_ip_number and mod_row.esic_enabled)

        # OT config (per employee type)
        ot_type = _ot_type_for_module(module)
        ot_row  = _load_ot_config(db, as_of, ot_type)
        ot_cfg  = calc.OTConfig(
            multiplier=Decimal(str(ot_row.ot_multiplier)),
            break_minutes=ot_row.break_minutes,
        )

        # Attendance — manual row takes priority; fall back to auto-derived values
        att_row = db.scalar(
            select(PayrollAttendance).where(
                PayrollAttendance.run_id == run_id,
                PayrollAttendance.employee_id == emp.id,
            )
        )
        if att_row:
            lop_days   = Decimal(str(att_row.lop_days))
            ot_hours   = Decimal(str(att_row.ot_hours))
            duty_hours = Decimal(str(att_row.duty_hours))
        else:
            auto_lop, auto_ot = derived_attendance.get(emp.id, (0.0, 0.0))
            lop_days   = Decimal(str(auto_lop))
            ot_hours   = Decimal(str(auto_ot))
            duty_hours = Decimal("8.5")
        att = calc.AttendanceInputs(
            total_days=run.total_days,
            lop_days=lop_days,
            ot_hours=ot_hours,
            duty_hours=duty_hours,
        )

        # Manual inputs
        man_row = db.scalar(
            select(PayrollManualInput).where(
                PayrollManualInput.run_id == run_id,
                PayrollManualInput.employee_id == emp.id,
            )
        )
        manual = calc.ManualInputs(
            reimbursement=Decimal(str(man_row.reimbursement)) if man_row else Decimal(0),
            incentive=Decimal(str(man_row.incentive))         if man_row else Decimal(0),
            bonus=Decimal(str(man_row.bonus))                 if man_row else Decimal(0),
            advance=Decimal(str(man_row.advance))             if man_row else Decimal(0),
            other_deduction=Decimal(str(man_row.other_deduction)) if man_row else Decimal(0),
            extra_deduction_1=Decimal(str(man_row.extra_deduction_1)) if man_row else Decimal(0),
            extra_deduction_2=Decimal(str(man_row.extra_deduction_2)) if man_row else Decimal(0),
        )

        emp_inputs = calc.EmployeeInputs(
            annual_ctc=Decimal(str(emp.ctc)),
            gender=emp.gender.value if emp.gender else "male",
            payment_mode=emp.payment_mode.value if emp.payment_mode else "bank",
            pt_state=pt_state,
            payroll_module=module,
            pf_applicable=pf_applicable,
            esic_applicable=esic_applicable,
        )

        result = calc.compute(emp_inputs, att, manual, pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod_cfg, pt_slabs)

        # Build config snapshot for audit
        snapshot = {
            "pf": {"wage_pct": str(pf_cfg.wage_pct), "ee_rate": str(pf_cfg.ee_rate)},
            "esic": {"ee_rate": str(esic_cfg.ee_rate), "wage_ceiling": str(esic_cfg.wage_ceiling)},
            "salary": {"basic_pct": str(sal_cfg.basic_pct), "hra_pct": str(sal_cfg.hra_pct)},
            "ot": {"multiplier": str(ot_cfg.multiplier), "break_minutes": ot_cfg.break_minutes},
        }

        # Upsert entry
        entry = db.scalar(
            select(PayrollEntry).where(
                PayrollEntry.run_id == run_id,
                PayrollEntry.employee_id == emp.id,
            )
        )
        if entry:
            prev_status = entry.approval_status
        else:
            entry = PayrollEntry(run_id=run_id, employee_id=emp.id)
            db.add(entry)
            prev_status = None

        entry.payroll_module = module
        entry.monthly_ctc    = float(result.monthly_ctc)
        entry.pf             = float(result.pf)
        entry.gross          = float(result.gross)
        entry.basic          = float(result.basic)
        entry.hra            = float(result.hra)
        entry.others         = float(result.others)
        entry.per_day_salary = float(result.per_day_salary)
        entry.lop_days       = float(result.lop_days)
        entry.lop_amount     = float(result.lop_amount)
        entry.actual_gross   = float(result.actual_gross)
        entry.actual_basic   = float(result.actual_basic)
        entry.actual_hra     = float(result.actual_hra)
        entry.actual_others  = float(result.actual_others)
        entry.duty_hours     = float(result.duty_hours)
        entry.ot_hours       = float(result.ot_hours)
        entry.ot_rate        = float(result.ot_rate)
        entry.ot_multiplier  = float(result.ot_multiplier)
        entry.ot_amount      = float(result.ot_amount)
        entry.reimbursement  = float(result.reimbursement)
        entry.incentive      = float(result.incentive)
        entry.bonus          = float(result.bonus)
        entry.total_earnings = float(result.total_earnings)
        entry.actual_pf      = float(result.actual_pf)
        entry.employer_pf    = float(result.employer_pf)
        entry.ee_esic        = float(result.ee_esic)
        entry.er_esic        = float(result.er_esic)
        entry.pt             = float(result.pt)
        entry.advance            = float(result.advance)
        entry.other_deduction    = float(result.other_deduction)
        entry.extra_deduction_1  = float(result.extra_deduction_1)
        entry.extra_deduction_2  = float(result.extra_deduction_2)
        entry.contract_deduction = float(result.contract_deduction)
        entry.total_deductions   = float(result.total_deductions)
        entry.net_pay            = float(result.net_pay)
        entry.pf_applicable      = result.pf_applicable
        entry.esic_applicable    = result.esic_applicable
        entry.esic_applicability_notes = result.esic_applicability_notes
        entry.payment_mode       = emp_inputs.payment_mode
        entry.approval_status    = EntryApprovalStatus.PENDING
        entry.calculation_snapshot = snapshot
        entry.computed_at        = datetime.utcnow()
        entry.computed_by        = computed_by

        db.flush()
        entries.append(entry)

    run.status = RunStatus.PROCESSING
    _audit(db, "payroll_generated", "run", run_id, run_id=run_id,
           new={"employees_processed": len(entries)}, performed_by=computed_by)
    db.commit()
    return entries


# ── Entry-level approval ──────────────────────────────────────────────────────

def _get_entry(db: Session, entry_id: int) -> PayrollEntry:
    entry = db.get(PayrollEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Payroll entry not found")
    return entry


def _assert_not_locked(db: Session, run_id: int):
    run = db.get(PayrollRun, run_id)
    if run and run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Run is locked")


def approve_entry(db: Session, entry_id: int, user_id: int) -> PayrollEntry:
    entry = _get_entry(db, entry_id)
    _assert_not_locked(db, entry.run_id)
    prev = entry.approval_status.value
    entry.approval_status = EntryApprovalStatus.APPROVED
    entry.hold_reason = None
    _audit(db, "entry_approved", "entry", entry_id,
           employee_id=entry.employee_id, run_id=entry.run_id,
           previous={"status": prev}, new={"status": "approved"}, performed_by=user_id)
    db.commit()
    db.refresh(entry)
    return entry


def hold_entry(db: Session, entry_id: int, reason: str, user_id: int) -> PayrollEntry:
    entry = _get_entry(db, entry_id)
    _assert_not_locked(db, entry.run_id)
    prev = entry.approval_status.value
    entry.approval_status = EntryApprovalStatus.ON_HOLD
    entry.hold_reason = reason
    _audit(db, "entry_on_hold", "entry", entry_id,
           employee_id=entry.employee_id, run_id=entry.run_id,
           previous={"status": prev}, new={"status": "on_hold", "reason": reason},
           performed_by=user_id)
    db.commit()
    db.refresh(entry)
    return entry


def release_entry(db: Session, entry_id: int, user_id: int) -> PayrollEntry:
    entry = _get_entry(db, entry_id)
    _assert_not_locked(db, entry.run_id)
    if entry.approval_status != EntryApprovalStatus.ON_HOLD:
        raise HTTPException(400, "Entry is not on hold")
    prev = entry.approval_status.value
    entry.approval_status = EntryApprovalStatus.PENDING
    entry.hold_reason = None
    _audit(db, "entry_released", "entry", entry_id,
           employee_id=entry.employee_id, run_id=entry.run_id,
           previous={"status": prev}, new={"status": "pending"}, performed_by=user_id)
    db.commit()
    db.refresh(entry)
    return entry


def mark_paid(db: Session, entry_id: int, user_id: int, paid_at: datetime, remarks: str) -> PayrollEntry:
    entry = _get_entry(db, entry_id)
    if entry.approval_status != EntryApprovalStatus.APPROVED:
        raise HTTPException(400, "Entry must be approved before marking as paid")
    prev = entry.approval_status.value
    entry.approval_status = EntryApprovalStatus.PAID
    entry.paid_at = paid_at
    entry.paid_by = user_id
    entry.payment_remarks = remarks
    _audit(db, "entry_paid", "entry", entry_id,
           employee_id=entry.employee_id, run_id=entry.run_id,
           previous={"status": prev}, new={"status": "paid", "paid_at": str(paid_at)},
           performed_by=user_id)
    db.commit()
    db.refresh(entry)
    return entry


def approve_all(db: Session, run_id: int, user_id: int) -> int:
    run = get_run(db, run_id)
    if run.status == RunStatus.LOCKED:
        raise HTTPException(400, "Run is locked")
    entries = list(db.scalars(
        select(PayrollEntry).where(
            PayrollEntry.run_id == run_id,
            PayrollEntry.approval_status == EntryApprovalStatus.PENDING,
        )
    ).all())
    for entry in entries:
        entry.approval_status = EntryApprovalStatus.APPROVED
        _audit(db, "entry_approved", "entry", entry.id,
               employee_id=entry.employee_id, run_id=run_id,
               previous={"status": "pending"}, new={"status": "approved"}, performed_by=user_id)
    run.status = RunStatus.APPROVED
    run.approved_by = user_id
    run.approved_at = datetime.utcnow()
    _audit(db, "payroll_approved", "run", run_id, run_id=run_id,
           new={"approved_count": len(entries)}, performed_by=user_id)
    db.commit()
    return len(entries)


# ── Employee eligibility ──────────────────────────────────────────────────────

def check_eligibility(db: Session, employee_id: int) -> dict:
    emp = db.scalar(select(Employee).where(Employee.id == employee_id))
    if not emp:
        raise HTTPException(404, "Employee not found")

    result = {"employee_id": employee_id, "eligible": False, "issues": [], "suggested_module": None}

    if not emp.date_of_joining:
        result["issues"].append("Date of joining not set")
        return result

    today = date.today()
    months = (today.year - emp.date_of_joining.year) * 12 + (today.month - emp.date_of_joining.month)
    if months < 3:
        result["issues"].append(f"Only {months} months completed — 3 required")
        return result

    statutory = db.scalar(select(EmployeeStatutory).where(EmployeeStatutory.employee_id == employee_id))

    # UAN required for PF
    has_uan = bool(statutory and statutory.uan_number)
    if not has_uan:
        result["issues"].append("UAN number not set — required for Permanent payroll")
        result["suggested_module"] = "contract"
        return result

    # Monthly CTC check for ESIC
    monthly_ctc = (emp.ctc or 0) / 12
    if monthly_ctc < 21000:
        has_esic = bool(statutory and statutory.esic_ip_number)
        if not has_esic:
            result["issues"].append("Monthly CTC < ₹21,000 — ESIC number required for Permanent payroll")
            result["suggested_module"] = "contract"
            return result

    result["eligible"] = True
    cat = emp.employee_category
    result["suggested_module"] = (
        "permanent_worker" if cat and cat.value == "worker" else "permanent_office"
    )
    return result


def pending_transitions(db: Session) -> list[dict]:
    """Employees who have completed 3 months but are still on Probation."""
    today = date.today()
    cutoff = date(today.year if today.month > 3 else today.year - 1,
                  today.month - 3 if today.month > 3 else today.month + 9, today.day)
    emps = list(db.scalars(
        select(Employee).where(
            Employee.employment_type == EmploymentType.PROBATION,
            Employee.date_of_joining <= cutoff,
            Employee.is_active == True,
        )
    ).all())
    return [check_eligibility(db, e.id) for e in emps]


def change_module(
    db: Session, employee_id: int, to_module: str,
    effective_date: date, reason: str, user_id: int,
) -> EmployeeModuleHistory:
    emp = db.scalar(select(Employee).where(Employee.id == employee_id))
    if not emp:
        raise HTTPException(404, "Employee not found")

    # Update employment_type to match the target module
    module_to_type = {
        "probation_office": EmploymentType.PROBATION,
        "probation_worker": EmploymentType.PROBATION,
        "permanent_office": EmploymentType.PERMANENT,
        "permanent_worker": EmploymentType.PERMANENT,
        "contract_office": EmploymentType.CONTRACT,
        "contract_worker": EmploymentType.CONTRACT,
        "consultant_office": EmploymentType.CONSULTANT,
        "consultant_worker": EmploymentType.CONSULTANT,
        "consultant_housekeeping": EmploymentType.CONSULTANT,
        "consultant_security": EmploymentType.CONSULTANT,
    }
    new_type = module_to_type.get(to_module)
    from_module = emp.employment_type.value if emp.employment_type else None
    if new_type:
        emp.employment_type = new_type

    history = EmployeeModuleHistory(
        employee_id=employee_id, from_module=from_module,
        to_module=to_module, effective_date=effective_date,
        changed_by=user_id, change_reason=reason,
    )
    db.add(history)
    _audit(db, "module_transition", "employee", employee_id,
           employee_id=employee_id,
           previous={"module": from_module},
           new={"module": to_module, "effective_date": str(effective_date)},
           reason=reason, performed_by=user_id)
    db.commit()
    db.refresh(history)
    return history


# ── Run summary ───────────────────────────────────────────────────────────────

def run_summary(db: Session, run_id: int) -> dict:
    entries = list(db.scalars(
        select(PayrollEntry).where(PayrollEntry.run_id == run_id)
    ).all())
    if not entries:
        return {"run_id": run_id, "employee_count": 0}

    def _sum(field): return round(sum(getattr(e, field) or 0 for e in entries), 2)

    status_counts: dict[str, int] = {}
    for e in entries:
        k = e.approval_status.value
        status_counts[k] = status_counts.get(k, 0) + 1

    return {
        "run_id": run_id,
        "employee_count": len(entries),
        "total_gross": _sum("gross"),
        "total_actual_gross": _sum("actual_gross"),
        "total_ot_amount": _sum("ot_amount"),
        "total_earnings": _sum("total_earnings"),
        "total_pf": _sum("actual_pf"),
        "total_employer_pf": _sum("employer_pf"),
        "total_ee_esic": _sum("ee_esic"),
        "total_er_esic": _sum("er_esic"),
        "total_pt": _sum("pt"),
        "total_contract_deduction": _sum("contract_deduction"),
        "total_deductions": _sum("total_deductions"),
        "total_net_pay": _sum("net_pay"),
        "approval_status_counts": status_counts,
    }
