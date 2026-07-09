"""
Payroll Calculation Engine — all 15 steps per the locked BRD.
All rules are driven by config objects loaded from the database.
No rates or thresholds are hardcoded here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from app.models.payroll_config import OTEmployeeType, PTGender, PayrollModule


# ── Input / Config DTOs ──────────────────────────────────────────────────────

@dataclass
class PFConfig:
    wage_pct: Decimal       # 0.8000
    wage_ceiling: Decimal   # 15000.00
    ee_rate: Decimal        # 0.1200
    er_rate: Decimal        # 0.1200


@dataclass
class ESICConfig:
    wage_ceiling: Decimal   # 21000.00
    ee_rate: Decimal        # 0.0075
    er_rate: Decimal        # 0.0325


@dataclass
class SalaryConfig:
    basic_pct: Decimal      # 0.5000
    hra_pct: Decimal        # 0.2000
    others_pct: Decimal     # 0.3000


@dataclass
class OTConfig:
    multiplier: Decimal     # 1.0 or 1.5
    break_minutes: int      # 31


@dataclass
class ModuleConfig:
    pf_enabled: bool
    esic_enabled: bool
    pt_enabled: bool
    ot_enabled: bool
    contract_deduction_rate: Optional[Decimal]  # 0.01 for contract modules


@dataclass
class PTSlab:
    min_gross: Decimal
    max_gross: Optional[Decimal]
    pt_amount: Decimal
    gender: str = "all"   # "male" | "female" | "all"


@dataclass
class EmployeeInputs:
    annual_ctc: Decimal
    gender: str                     # "male" | "female"
    payment_mode: str               # "bank" | "cash"
    pt_state: str                   # "Maharashtra"
    payroll_module: PayrollModule
    pf_applicable: bool
    esic_applicable: bool


@dataclass
class AttendanceInputs:
    total_days: int
    lop_days: Decimal
    ot_hours: Decimal
    duty_hours: Decimal             # per-day shift hours (e.g. 8.5)


@dataclass
class ManualInputs:
    reimbursement: Decimal = field(default_factory=Decimal)
    incentive: Decimal     = field(default_factory=Decimal)
    bonus: Decimal         = field(default_factory=Decimal)
    advance: Decimal       = field(default_factory=Decimal)
    other_deduction: Decimal       = field(default_factory=Decimal)
    extra_deduction_1: Decimal     = field(default_factory=Decimal)
    extra_deduction_2: Decimal     = field(default_factory=Decimal)

    def __post_init__(self):
        for f in ("reimbursement", "incentive", "bonus", "advance",
                  "other_deduction", "extra_deduction_1", "extra_deduction_2"):
            val = getattr(self, f)
            if not isinstance(val, Decimal):
                setattr(self, f, Decimal(str(val)))


@dataclass
class PayrollResult:
    """Mirrors every column in payroll_entries."""
    monthly_ctc: Decimal = Decimal(0)
    pf: Decimal          = Decimal(0)
    gross: Decimal       = Decimal(0)
    basic: Decimal       = Decimal(0)
    hra: Decimal         = Decimal(0)
    others: Decimal      = Decimal(0)
    per_day_salary: Decimal = Decimal(0)

    lop_days: Decimal    = Decimal(0)
    lop_amount: Decimal  = Decimal(0)
    actual_gross: Decimal = Decimal(0)
    actual_basic: Decimal = Decimal(0)
    actual_hra: Decimal  = Decimal(0)
    actual_others: Decimal = Decimal(0)

    duty_hours: Decimal  = Decimal(0)
    ot_hours: Decimal    = Decimal(0)
    ot_rate: Decimal     = Decimal(0)
    ot_multiplier: Decimal = Decimal(1)
    ot_amount: Decimal   = Decimal(0)

    reimbursement: Decimal = Decimal(0)
    incentive: Decimal     = Decimal(0)
    bonus: Decimal         = Decimal(0)
    total_earnings: Decimal = Decimal(0)

    actual_pf: Decimal   = Decimal(0)
    employer_pf: Decimal = Decimal(0)
    ee_esic: Decimal     = Decimal(0)
    er_esic: Decimal     = Decimal(0)
    pt: Decimal          = Decimal(0)

    advance: Decimal           = Decimal(0)
    other_deduction: Decimal   = Decimal(0)
    extra_deduction_1: Decimal = Decimal(0)
    extra_deduction_2: Decimal = Decimal(0)
    contract_deduction: Decimal = Decimal(0)
    total_deductions: Decimal  = Decimal(0)
    net_pay: Decimal           = Decimal(0)

    pf_applicable: bool  = False
    esic_applicable: bool = False
    esic_applicability_notes: str = ""


# ── Helpers ──────────────────────────────────────────────────────────────────

def _d(v) -> Decimal:
    return Decimal(str(v))


def _round2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _round0(v: Decimal) -> Decimal:
    return v.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _calc_pf(monthly_ctc: Decimal, lop_amount: Decimal, cfg: PFConfig) -> tuple[Decimal, Decimal]:
    """Returns (ee_pf, er_pf). lop_amount=0 for theoretical PF."""
    wage = (monthly_ctc - lop_amount) * cfg.wage_pct
    if wage >= cfg.wage_ceiling:
        ee = _round0(cfg.wage_ceiling * cfg.ee_rate)
        er = _round0(cfg.wage_ceiling * cfg.er_rate)
    else:
        ee = _round0(wage * cfg.ee_rate)
        er = _round0(wage * cfg.er_rate)
    return ee, er


def _lookup_pt(actual_gross: Decimal, gender: str, slabs: list[PTSlab]) -> Decimal:
    """Walk slabs sorted ascending by min_gross; return first matching pt_amount."""
    gender_lower = gender.lower()
    matched = Decimal(0)
    for slab in sorted(slabs, key=lambda s: s.min_gross):
        if slab.gender not in (gender_lower, "all"):
            continue
        if actual_gross > slab.min_gross:
            if slab.max_gross is None or actual_gross <= slab.max_gross:
                matched = slab.pt_amount
    return matched


# ── Main Engine ──────────────────────────────────────────────────────────────

def compute(
    emp: EmployeeInputs,
    att: AttendanceInputs,
    manual: ManualInputs,
    pf_cfg: PFConfig,
    esic_cfg: ESICConfig,
    sal_cfg: SalaryConfig,
    ot_cfg: OTConfig,
    mod_cfg: ModuleConfig,
    pt_slabs: list[PTSlab],
) -> PayrollResult:
    r = PayrollResult()

    # ── Step 1: Monthly CTC ───────────────────────────────────────────────
    r.monthly_ctc  = _round2(_d(emp.annual_ctc) / 12)
    r.pf_applicable  = emp.pf_applicable and mod_cfg.pf_enabled
    r.esic_applicable = emp.esic_applicable and mod_cfg.esic_enabled

    # ── Step 2: Theoretical PF ───────────────────────────────────────────
    if r.pf_applicable:
        r.pf, _ = _calc_pf(r.monthly_ctc, Decimal(0), pf_cfg)
    else:
        r.pf = Decimal(0)

    # ── Step 3: Gross & components ───────────────────────────────────────
    r.gross  = _round2(r.monthly_ctc - r.pf)
    r.basic  = _round2(r.gross * sal_cfg.basic_pct)
    r.hra    = _round2(r.gross * sal_cfg.hra_pct)
    r.others = _round2(r.gross * sal_cfg.others_pct)

    # ── Step 4: Per day salary ───────────────────────────────────────────
    total_days = _d(att.total_days)
    r.per_day_salary = r.gross / total_days if total_days else Decimal(0)

    # ── Step 5: LOP ──────────────────────────────────────────────────────
    r.lop_days   = _d(att.lop_days)
    r.lop_amount = _round2(r.per_day_salary * r.lop_days)
    r.actual_gross = _round2(r.gross - r.lop_amount)

    # ── Step 6: Actual components (payslip values) ────────────────────────
    r.actual_basic  = _round2(r.actual_gross * sal_cfg.basic_pct)
    r.actual_hra    = _round2(r.actual_gross * sal_cfg.hra_pct)
    r.actual_others = _round2(r.actual_gross * sal_cfg.others_pct)

    # ── Step 7: OT ───────────────────────────────────────────────────────
    r.duty_hours    = _d(att.duty_hours)
    r.ot_hours      = _d(att.ot_hours)
    r.ot_multiplier = _d(ot_cfg.multiplier)

    if mod_cfg.ot_enabled and r.duty_hours > 0:
        break_hrs = _d(ot_cfg.break_minutes) / 60
        effective_duty = r.duty_hours - break_hrs
        if effective_duty > 0:
            hourly_rate = r.per_day_salary / effective_duty
            r.ot_rate   = hourly_rate * r.ot_multiplier
            r.ot_amount = _round0(hourly_rate * r.ot_hours * r.ot_multiplier)
        else:
            r.ot_rate = r.ot_amount = Decimal(0)
    else:
        r.ot_rate = r.ot_amount = Decimal(0)

    # ── Step 8: Total Earnings ───────────────────────────────────────────
    r.reimbursement = manual.reimbursement
    r.incentive     = manual.incentive
    r.bonus         = manual.bonus
    r.total_earnings = _round2(
        r.actual_gross + r.ot_amount + r.reimbursement + r.incentive + r.bonus
    )

    # ── Step 9: Actual PF (after LOP) ────────────────────────────────────
    if r.pf_applicable:
        r.actual_pf, r.employer_pf = _calc_pf(r.monthly_ctc, r.lop_amount, pf_cfg)
    else:
        r.actual_pf = r.employer_pf = Decimal(0)

    # ── Step 10: ESIC ────────────────────────────────────────────────────
    esic_notes = ""
    if r.esic_applicable and r.monthly_ctc < esic_cfg.wage_ceiling:
        esic_base = r.actual_gross + r.ot_amount
        r.ee_esic = _round0(esic_base * esic_cfg.ee_rate)
        r.er_esic = _round0(esic_base * esic_cfg.er_rate)
    else:
        r.ee_esic = r.er_esic = Decimal(0)
        if r.monthly_ctc >= esic_cfg.wage_ceiling:
            esic_notes = f"CTC ₹{r.monthly_ctc} >= ceiling ₹{esic_cfg.wage_ceiling}"
    r.esic_applicability_notes = esic_notes

    # ── Step 11: PT ──────────────────────────────────────────────────────
    if mod_cfg.pt_enabled and emp.payment_mode != "cash":
        r.pt = _lookup_pt(r.actual_gross, emp.gender, pt_slabs)
    else:
        r.pt = Decimal(0)

    # ── Step 12: Manual deductions ───────────────────────────────────────
    r.advance           = manual.advance
    r.other_deduction   = manual.other_deduction
    r.extra_deduction_1 = manual.extra_deduction_1
    r.extra_deduction_2 = manual.extra_deduction_2

    # ── Step 12b: Contract Professional Deduction ────────────────────────
    if mod_cfg.contract_deduction_rate:
        manual_deds = (
            r.advance + r.other_deduction + r.extra_deduction_1 + r.extra_deduction_2
        )
        base = r.total_earnings - manual_deds
        r.contract_deduction = _round2(base * mod_cfg.contract_deduction_rate)
    else:
        r.contract_deduction = Decimal(0)

    # ── Step 13: Total Deductions ─────────────────────────────────────────
    r.total_deductions = _round2(
        r.actual_pf + r.ee_esic + r.pt + r.contract_deduction
        + r.advance + r.other_deduction + r.extra_deduction_1 + r.extra_deduction_2
    )

    # ── Step 14: Net Pay ─────────────────────────────────────────────────
    r.net_pay = _round2(r.total_earnings - r.total_deductions)

    return r
