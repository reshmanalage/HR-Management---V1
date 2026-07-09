"""
LOP (Leave-Without-Pay) & Penalty Calculation Service.

Payroll cycle: 21st of current month → 20th of following month.
All deductions are stored as AttendanceDeduction rows.
"""
import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.attendance import AttendanceRecord
from app.models.attendance_deduction import AttendanceDeduction, DeductionType
from app.models.attendance_regularization import (
    AttendanceRegularization,
    RegularizationType,
    RegularizationStatus,
)
from app.models.employee import Employee, EmployeeStatus
from app.models.grace_period_usage import GracePeriodUsage
from app.models.holiday import Holiday
from app.models.leave_application import LeaveApplication, LeaveStatus
from app.models.leave_type import LeaveType
from app.models.payroll_policy import PayrollPolicy
from app.models.shift import Shift


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _out_minutes(t: str) -> int:
    """Parse out_time from biometric (24h) to minutes-since-midnight.

    Biometric devices record the actual clock time. If an employee leaves
    after midnight the out_time will be a small value like '00:30' or '01:45'.
    Any out_time before 06:00 is assumed to be next-day (+1440 min) so that
    comparisons against shift_end and OT calculations are always correct.
    """
    m = _to_minutes(t)
    if m < 360:          # before 06:00 → past midnight
        m += 1440
    return m


def _cycle_end(cycle_start: datetime.date) -> datetime.date:
    m = cycle_start.month
    y = cycle_start.year
    nm, ny = (m + 1, y) if m < 12 else (1, y + 1)
    return datetime.date(ny, nm, 20)


def _cycle_dates(cycle_start: datetime.date) -> list[datetime.date]:
    end = _cycle_end(cycle_start)
    dates, cur = [], cycle_start
    while cur <= end:
        dates.append(cur)
        cur += datetime.timedelta(days=1)
    return dates


def _is_working_day(d: datetime.date, holidays: set[str]) -> bool:
    return d.weekday() != 6 and d.strftime("%Y-%m-%d") not in holidays


def _minutes_to_hhmm(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h:02d}:{m:02d}"


def _resolve_shift_thresholds(
    employee: Employee,
    shifts_by_name: dict[str, Shift],
    policy: PayrollPolicy,
    shifts_by_id: dict[int, Shift] | None = None,
) -> tuple[str, str, int, int, str, str]:
    """
    Returns (shift_start, shift_end, grace_period_minutes, max_grace_per_cycle,
             half_day_late_cutoff, half_day_early_cutoff).
    Resolution order: shift_id FK → shift name text → policy defaults.
    """
    shift = None
    if employee.shift_id and shifts_by_id:
        shift = shifts_by_id.get(employee.shift_id)
    if shift is None and employee.shift:
        shift = shifts_by_name.get(employee.shift)

    if shift and not shift.is_flexible and shift.start_time and shift.end_time:
        s_start = shift.start_time
        s_end   = shift.end_time
        # If the shift hasn't explicitly set a grace window, fall back to the policy value
        # so the "6 attempts within 10 minutes" rule always applies regardless of shift assignment.
        grace   = shift.grace_period_minutes if shift.grace_period_minutes else policy.grace_period_minutes
        # Midpoint of shift = start + duration/2
        start_m  = _to_minutes(s_start)
        end_m    = _to_minutes(s_end)
        midpoint = start_m + (end_m - start_m) // 2
        hd_late  = shift.half_day_late_cutoff  or _minutes_to_hhmm(midpoint)
        hd_early = shift.half_day_early_cutoff or _minutes_to_hhmm(midpoint)
    else:
        s_start  = policy.shift_start
        s_end    = policy.shift_end
        grace    = policy.grace_period_minutes
        hd_late  = policy.half_day_late_cutoff
        hd_early = policy.half_day_early_cutoff

    return s_start, s_end, grace, policy.max_grace_per_cycle, hd_late, hd_early


def _get_or_create_policy(db: Session) -> PayrollPolicy:
    policy = db.query(PayrollPolicy).filter_by(id=1).first()
    if not policy:
        policy = PayrollPolicy(id=1)
        db.add(policy)
        db.flush()
    return policy


# ──────────────────────────────────────────────
# Main calculation
# ──────────────────────────────────────────────

def calculate_lop_for_employee(
    db: Session,
    employee_id: int,
    cycle_start: datetime.date,
    overwrite: bool = True,
    _shifts_by_name: dict | None = None,
    _shifts_by_id: dict | None = None,
) -> list[AttendanceDeduction]:
    policy = _get_or_create_policy(db)
    cycle_start_str = cycle_start.strftime("%Y-%m-%d")
    cycle_end = _cycle_end(cycle_start)
    cycle_end_str = cycle_end.strftime("%Y-%m-%d")

    # Resolve shift thresholds for this employee
    if _shifts_by_name is None:
        all_shifts = db.query(Shift).filter_by(is_active=True).all()
        _shifts_by_name = {s.name: s for s in all_shifts}
        _shifts_by_id   = {s.id: s   for s in all_shifts}
    emp = db.query(Employee).filter_by(id=employee_id).first()
    s_start, s_end, shift_grace, max_grace, hd_late, hd_early = _resolve_shift_thresholds(
        emp, _shifts_by_name, policy, _shifts_by_id
    ) if emp else (
        policy.shift_start, policy.shift_end,
        policy.grace_period_minutes, policy.max_grace_per_cycle,
        policy.half_day_late_cutoff, policy.half_day_early_cutoff,
    )

    # Holidays in cycle
    holidays: set[str] = {
        h.holiday_date.strftime("%Y-%m-%d")
        for h in db.query(Holiday).filter(
            Holiday.holiday_date >= cycle_start,
            Holiday.holiday_date <= cycle_end,
        ).all()
    }

    working_days = [
        d for d in _cycle_dates(cycle_start) if _is_working_day(d, holidays)
    ]

    # Attendance records
    att_map: dict[str, AttendanceRecord] = {
        r.date: r
        for r in db.query(AttendanceRecord).filter(
            AttendanceRecord.employee_id == employee_id,
            AttendanceRecord.date >= cycle_start_str,
            AttendanceRecord.date <= cycle_end_str,
        ).all()
    }

    # Regularizations indexed by (date_str, type)
    reg_map: dict[tuple, AttendanceRegularization] = {
        (r.date, r.regularization_type): r
        for r in db.query(AttendanceRegularization).filter(
            AttendanceRegularization.employee_id == employee_id,
            AttendanceRegularization.date >= cycle_start_str,
            AttendanceRegularization.date <= cycle_end_str,
        ).all()
    }

    # Leave applications overlapping the cycle (any non-cancelled)
    leave_apps = db.query(LeaveApplication).filter(
        LeaveApplication.employee_id == employee_id,
        LeaveApplication.from_date <= cycle_end,
        LeaveApplication.to_date >= cycle_start,
        LeaveApplication.status != LeaveStatus.CANCELLED,
    ).all()

    # Build date → leave app map (approved takes priority)
    leave_map: dict[str, LeaveApplication] = {}
    for app in sorted(leave_apps, key=lambda x: x.status != LeaveStatus.APPROVED):
        d = app.from_date
        while d <= app.to_date:
            ds = d.strftime("%Y-%m-%d")
            if ds not in leave_map:
                leave_map[ds] = app
            d += datetime.timedelta(days=1)

    # Grace period usage tracker for this cycle
    grace = db.query(GracePeriodUsage).filter_by(
        employee_id=employee_id, payroll_cycle_start=cycle_start_str
    ).first()
    if not grace:
        grace = GracePeriodUsage(
            employee_id=employee_id,
            payroll_cycle_start=cycle_start_str,
            usage_count=0,
        )
        db.add(grace)
        db.flush()

    # Remove previous deductions for this employee+cycle
    if overwrite:
        db.query(AttendanceDeduction).filter_by(
            employee_id=employee_id,
            payroll_cycle_start=cycle_start_str,
        ).delete()
        grace.usage_count = 0

    # Shift thresholds (minutes since midnight)
    shift_start_mins = _to_minutes(s_start)
    shift_end_mins   = _to_minutes(s_end)
    shift_dur_mins   = shift_end_mins - shift_start_mins
    grace_end_mins   = shift_start_mins + shift_grace
    hd_late_mins     = _to_minutes(hd_late)
    hd_early_mins    = _to_minutes(hd_early)

    deductions: list[AttendanceDeduction] = []
    grace_count = grace.usage_count

    def add(date_str: str, dtype: DeductionType, days: float, reason: str):
        row = AttendanceDeduction(
            employee_id=employee_id,
            payroll_cycle_start=cycle_start_str,
            date=date_str,
            deduction_type=dtype,
            deduction_days=Decimal(str(round(days, 3))),
            reason=reason,
        )
        db.add(row)
        deductions.append(row)

    for work_date in working_days:
        ds = work_date.strftime("%Y-%m-%d")

        # Hard skip: Sundays, Saturdays, holidays, and any WO/WOP record
        # are never counted as LOP regardless of what the attendance data says.
        if work_date.weekday() == 6 or ds in holidays:
            continue

        att = att_map.get(ds)

        if att is not None and att.status in ("WO", "WOP"):
            continue

        is_absent  = att is None or att.status == "A"
        is_present = att is not None and att.status == "P"

        # ── Absent day ──
        if is_absent:
            leave = leave_map.get(ds)
            if leave is None:
                add(ds, DeductionType.ABSENCE, 1.0,
                    "Absent — no attendance record and no leave application")
            else:
                _process_leave(ds, leave, policy, add)
            continue

        if not is_present:
            continue

        actual_hours_mode = getattr(policy, "deduction_mode", "penalty") == "actual_hours"

        # ── Present: check late arrival ──
        if att.in_time:
            in_mins = _to_minutes(att.in_time)
            if in_mins > shift_start_mins:
                late_mins = in_mins - shift_start_mins
                frac = round(late_mins / shift_dur_mins, 3)

                if in_mins <= grace_end_mins:
                    # Within grace window — consume one grace credit
                    grace_count += 1
                    if grace_count > policy.max_grace_per_cycle:
                        add(ds, DeductionType.GRACE_EXCEEDED, 0.5,
                            f"Grace period used {grace_count}×"
                            f" (limit {policy.max_grace_per_cycle}),"
                            f" arrived {att.in_time}")

                elif actual_hours_mode:
                    # Actual-hours mode: proportional deduction, no fixed tiers.
                    # Any application (regularization) takes priority.
                    reg = reg_map.get((ds, RegularizationType.LATE_COMING)) or \
                          reg_map.get((ds, RegularizationType.HALF_DAY))
                    if reg and reg.status == RegularizationStatus.APPROVED:
                        add(ds, DeductionType.LATE_ARRIVAL, frac,
                            f"Late {att.in_time} — application approved ({frac}d actual)")
                    else:
                        add(ds, DeductionType.LATE_ARRIVAL, frac,
                            f"Late {att.in_time} — {late_mins} min ({frac}d actual hours)")

                elif in_mins <= hd_late_mins:
                    reg = reg_map.get((ds, RegularizationType.LATE_COMING))
                    if reg:
                        add(ds, DeductionType.LATE_ARRIVAL, frac,
                            f"Late arrival {att.in_time}"
                            f" — regularization {reg.status.value}")
                    else:
                        add(ds, DeductionType.LATE_ARRIVAL, 0.5,
                            f"Late arrival {att.in_time}"
                            f" — no regularization (0.5-day default)")

                else:
                    # After half-day late cutoff (penalty mode)
                    reg = reg_map.get((ds, RegularizationType.HALF_DAY))
                    if reg and reg.status == RegularizationStatus.APPROVED:
                        add(ds, DeductionType.LATE_ARRIVAL, frac,
                            f"Very late arrival {att.in_time}"
                            f" — half-day reg approved")
                    else:
                        add(ds, DeductionType.LATE_ARRIVAL, 1.0,
                            f"Arrived after {hd_late}"
                            f" ({att.in_time}) — no approved half-day reg")

        # ── Present: check early leaving ──
        if att.out_time:
            out_mins = _out_minutes(att.out_time)
            if out_mins < shift_end_mins:
                early_mins = shift_end_mins - out_mins
                frac = round(early_mins / shift_dur_mins, 3)

                if actual_hours_mode:
                    # Actual-hours mode: proportional deduction.
                    # Any application takes priority.
                    reg = reg_map.get((ds, RegularizationType.EARLY_GOING)) or \
                          reg_map.get((ds, RegularizationType.HALF_DAY))
                    if reg and reg.status == RegularizationStatus.APPROVED:
                        add(ds, DeductionType.EARLY_LEAVING, frac,
                            f"Early leaving {att.out_time} — application approved ({frac}d actual)")
                    else:
                        add(ds, DeductionType.EARLY_LEAVING, frac,
                            f"Early leaving {att.out_time} — {early_mins} min ({frac}d actual hours)")

                elif out_mins < hd_early_mins:
                    # Left before half-day early cutoff (penalty mode)
                    reg = reg_map.get((ds, RegularizationType.HALF_DAY))
                    if reg and reg.status == RegularizationStatus.APPROVED:
                        add(ds, DeductionType.EARLY_LEAVING, frac,
                            f"Early leaving {att.out_time}"
                            f" — half-day reg approved")
                    else:
                        add(ds, DeductionType.EARLY_LEAVING, 1.0,
                            f"Left before {hd_early}"
                            f" ({att.out_time}) — no approved half-day reg")
                else:
                    reg = reg_map.get((ds, RegularizationType.EARLY_GOING))
                    if reg:
                        add(ds, DeductionType.EARLY_LEAVING, frac,
                            f"Early leaving {att.out_time}"
                            f" — regularization {reg.status.value}")
                    else:
                        add(ds, DeductionType.EARLY_LEAVING, frac,
                            f"Early leaving {att.out_time} — no regularization")

    # Persist updated grace count
    grace.usage_count = grace_count
    db.flush()

    return deductions


def _process_leave(
    date_str: str,
    leave: LeaveApplication,
    policy: PayrollPolicy,
    add,
):
    """Determine deduction for one date covered by a leave application."""
    lt: LeaveType = leave.leave_type
    day_fraction = 0.5 if leave.is_half_day else 1.0
    is_approved  = leave.status == LeaveStatus.APPROVED

    # ── Emergency leave — actual day deduction (1×); not approved → 2× ──
    if lt.is_emergency:
        if not is_approved:
            add(date_str, DeductionType.LEAVE_DOUBLE, day_fraction * 2,
                "Emergency leave not approved — 2× deduction")
        else:
            add(date_str, DeductionType.LEAVE_LOP, day_fraction,
                "Emergency leave — actual day deduction (1× LOP)")
        return

    # ── Long leave ──
    if lt.is_long_leave:
        if not is_approved:
            add(date_str, DeductionType.LEAVE_DOUBLE, day_fraction * 2,
                "Long leave not approved — 2× deduction")
        else:
            add(date_str, DeductionType.LEAVE_LOP, day_fraction,
                "Long leave approved — 1× LOP")
        return

    # ── Paid leave ──
    if lt.is_paid:
        if not is_approved:
            add(date_str, DeductionType.LEAVE_LOP, day_fraction,
                "Paid leave not approved — 1× LOP")
            return
        total_days    = float(leave.days)
        req_advance   = 3 if total_days <= 2 else 7
        app_advance   = (leave.from_date - leave.applied_at.date()).days
        if app_advance < req_advance:
            add(date_str, DeductionType.LEAVE_DOUBLE, day_fraction * 2,
                f"Paid leave applied {app_advance}d in advance"
                f" (required {req_advance}d) — 2× deduction")
        # else: approved on time — leave balance covers it, no LOP
        return

    # ── Non-paid / Casual leave ──
    if not is_approved:
        add(date_str, DeductionType.LEAVE_DOUBLE, day_fraction * 2,
            "Non-paid leave not approved — 2× deduction")
        return
    if lt.advance_days > 0:
        app_advance = (leave.from_date - leave.applied_at.date()).days
        if app_advance < lt.advance_days:
            add(date_str, DeductionType.LEAVE_DOUBLE, day_fraction * 2,
                f"Casual/non-paid leave applied {app_advance}d in advance"
                f" (required {lt.advance_days}d) — 2× deduction")
            return
    add(date_str, DeductionType.LEAVE_LOP, day_fraction,
        "Non-paid/casual leave approved on time — 1× LOP")


def calculate_lop_bulk(
    db: Session,
    cycle_start: datetime.date,
) -> dict[int, list[AttendanceDeduction]]:
    """Run LOP calculation for all active employees in a payroll cycle."""
    employees = (
        db.query(Employee)
        .filter(Employee.employee_status == EmployeeStatus.ACTIVE)
        .all()
    )
    # Load all active shifts once so each employee calc doesn't re-query
    all_shifts = db.query(Shift).filter_by(is_active=True).all()
    shifts_by_name = {s.name: s for s in all_shifts}
    shifts_by_id   = {s.id: s   for s in all_shifts}
    results = {}
    for emp in employees:
        results[emp.id] = calculate_lop_for_employee(
            db, emp.id, cycle_start, overwrite=True,
            _shifts_by_name=shifts_by_name,
            _shifts_by_id=shifts_by_id,
        )
    db.commit()
    return results
