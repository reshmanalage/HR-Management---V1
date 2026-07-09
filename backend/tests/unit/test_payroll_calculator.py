"""
Unit tests for the payroll calculation engine (payroll_calculator.py).
All tests are pure Python — no database required.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.payroll_config import PayrollModule
from app.services.payroll_calculator import (
    AttendanceInputs,
    ESICConfig,
    EmployeeInputs,
    ManualInputs,
    ModuleConfig,
    OTConfig,
    PFConfig,
    PTSlab,
    PayrollResult,
    SalaryConfig,
    _calc_pf,
    _lookup_pt,
    compute,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def pf_cfg():
    return PFConfig(
        wage_pct=Decimal("0.80"),
        wage_ceiling=Decimal("15000"),
        ee_rate=Decimal("0.12"),
        er_rate=Decimal("0.12"),
    )


@pytest.fixture
def esic_cfg():
    return ESICConfig(
        wage_ceiling=Decimal("21000"),
        ee_rate=Decimal("0.0075"),
        er_rate=Decimal("0.0325"),
    )


@pytest.fixture
def sal_cfg():
    return SalaryConfig(
        basic_pct=Decimal("0.50"),
        hra_pct=Decimal("0.20"),
        others_pct=Decimal("0.30"),
    )


@pytest.fixture
def ot_cfg_worker():
    """Worker OT: 1.5× multiplier, 31-min break."""
    return OTConfig(multiplier=Decimal("1.5"), break_minutes=31)


@pytest.fixture
def ot_cfg_office():
    """Office staff OT: 1.0× multiplier, 31-min break."""
    return OTConfig(multiplier=Decimal("1.0"), break_minutes=31)


@pytest.fixture
def pt_slabs_maharashtra():
    """Maharashtra PT slabs (male / female)."""
    return [
        # male
        PTSlab(min_gross=Decimal("0"),     max_gross=Decimal("7500"),  pt_amount=Decimal("0"),   gender="male"),
        PTSlab(min_gross=Decimal("7500"),  max_gross=Decimal("10000"), pt_amount=Decimal("175"), gender="male"),
        PTSlab(min_gross=Decimal("10000"), max_gross=None,             pt_amount=Decimal("200"), gender="male"),
        # female (only > 25k)
        PTSlab(min_gross=Decimal("0"),     max_gross=Decimal("25000"), pt_amount=Decimal("0"),   gender="female"),
        PTSlab(min_gross=Decimal("25000"), max_gross=None,             pt_amount=Decimal("200"), gender="female"),
    ]


def _no_pt_slabs():
    return []


def _no_manual():
    return ManualInputs()


def _std_att(lop=0, ot_hours=0, duty_hours=8.5, total_days=30):
    return AttendanceInputs(
        total_days=total_days,
        lop_days=Decimal(str(lop)),
        ot_hours=Decimal(str(ot_hours)),
        duty_hours=Decimal(str(duty_hours)),
    )


# ── Helper: build module config ───────────────────────────────────────────────

def _mod(pf=False, esic=False, pt=False, ot=False, contract_rate=None):
    return ModuleConfig(
        pf_enabled=pf,
        esic_enabled=esic,
        pt_enabled=pt,
        ot_enabled=ot,
        contract_deduction_rate=Decimal(str(contract_rate)) if contract_rate else None,
    )


def _emp(annual_ctc, module=PayrollModule.PERMANENT_OFFICE,
         gender="male", payment_mode="bank",
         pf_applicable=True, esic_applicable=True):
    return EmployeeInputs(
        annual_ctc=Decimal(str(annual_ctc)),
        gender=gender,
        payment_mode=payment_mode,
        pt_state="Maharashtra",
        payroll_module=module,
        pf_applicable=pf_applicable,
        esic_applicable=esic_applicable,
    )


# ══════════════════════════════════════════════════════════════════════════════
# 1. PF helper tests
# ══════════════════════════════════════════════════════════════════════════════

class TestCalcPF:
    def test_wage_below_ceiling(self, pf_cfg):
        """PF computed on actual wage when pf_wage < 15,000."""
        # annual = 180000 → monthly = 15000 → pf_wage = 15000 * 0.80 = 12000
        monthly = Decimal("15000")
        ee, er = _calc_pf(monthly, Decimal("0"), pf_cfg)
        expected = round(12000 * 0.12)  # 1440
        assert int(ee) == expected
        assert int(er) == expected

    def test_wage_exactly_at_ceiling(self, pf_cfg):
        """PF is capped when pf_wage == ceiling (₹15,000)."""
        # need monthly such that monthly * 0.80 == 15000 → monthly = 18750
        monthly = Decimal("18750")
        ee, er = _calc_pf(monthly, Decimal("0"), pf_cfg)
        assert int(ee) == 1800  # 15000 * 0.12

    def test_wage_above_ceiling_capped(self, pf_cfg):
        """PF stays at ₹1,800 when pf_wage > ₹15,000."""
        monthly = Decimal("30000")
        ee, er = _calc_pf(monthly, Decimal("0"), pf_cfg)
        assert int(ee) == 1800
        assert int(er) == 1800

    def test_lop_reduces_pf_wage(self, pf_cfg):
        """LOP deduction correctly reduces PF wage."""
        monthly = Decimal("30000")
        # gross/total = 30000/30 = 1000/day; 5 LOP = 5000
        lop_amount = Decimal("5000")
        ee, er = _calc_pf(monthly, lop_amount, pf_cfg)
        # wage = (30000 - 5000) * 0.80 = 20000 → still capped at 15000
        assert int(ee) == 1800

    def test_heavy_lop_reduces_pf_below_ceiling(self, pf_cfg):
        """Heavy LOP can push PF wage below the ceiling."""
        monthly = Decimal("25000")
        # if lop = 15000, wage = (25000-15000)*0.80 = 8000 → ee = 960
        lop_amount = Decimal("15000")
        ee, er = _calc_pf(monthly, lop_amount, pf_cfg)
        assert int(ee) == 960


# ══════════════════════════════════════════════════════════════════════════════
# 2. PT lookup tests
# ══════════════════════════════════════════════════════════════════════════════

class TestLookupPT:
    def test_male_below_7500(self, pt_slabs_maharashtra):
        assert _lookup_pt(Decimal("5000"), "male", pt_slabs_maharashtra) == Decimal("0")

    def test_male_exactly_7500_returns_0(self, pt_slabs_maharashtra):
        # slab is > 7500, so 7500 should not trigger 175
        assert _lookup_pt(Decimal("7500"), "male", pt_slabs_maharashtra) == Decimal("0")

    def test_male_between_7500_10000(self, pt_slabs_maharashtra):
        assert _lookup_pt(Decimal("8000"), "male", pt_slabs_maharashtra) == Decimal("175")

    def test_male_above_10000(self, pt_slabs_maharashtra):
        assert _lookup_pt(Decimal("12000"), "male", pt_slabs_maharashtra) == Decimal("200")

    def test_female_below_25000(self, pt_slabs_maharashtra):
        assert _lookup_pt(Decimal("20000"), "female", pt_slabs_maharashtra) == Decimal("0")

    def test_female_above_25000(self, pt_slabs_maharashtra):
        assert _lookup_pt(Decimal("30000"), "female", pt_slabs_maharashtra) == Decimal("200")

    def test_empty_slabs_returns_zero(self):
        assert _lookup_pt(Decimal("50000"), "male", []) == Decimal("0")

    def test_case_insensitive_gender(self, pt_slabs_maharashtra):
        assert _lookup_pt(Decimal("12000"), "Male", pt_slabs_maharashtra) == Decimal("200")


# ══════════════════════════════════════════════════════════════════════════════
# 3. Permanent Office — full payroll
# ══════════════════════════════════════════════════════════════════════════════

class TestPermanentOffice:
    """Permanent staff: PF + ESIC + PT enabled, OT disabled."""

    def _result(self, annual_ctc, lop=0, ot_hours=0,
                pf_cfg=None, esic_cfg=None, sal_cfg=None,
                ot_cfg=None, pt_slabs=None,
                pf_applicable=True, esic_applicable=True,
                gender="male", **kwargs):
        # fixtures aren't available as method args; build defaults here
        pf_cfg  = pf_cfg  or PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = esic_cfg or ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg = sal_cfg or SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg  = ot_cfg  or OTConfig(Decimal("1.0"), 31)
        pt_slabs = pt_slabs or [
            PTSlab(Decimal("0"), Decimal("7500"), Decimal("0"), "male"),
            PTSlab(Decimal("7500"), Decimal("10000"), Decimal("175"), "male"),
            PTSlab(Decimal("10000"), None, Decimal("200"), "male"),
            PTSlab(Decimal("0"), Decimal("25000"), Decimal("0"), "female"),
            PTSlab(Decimal("25000"), None, Decimal("200"), "female"),
        ]
        mod = _mod(pf=True, esic=True, pt=True, ot=False)
        emp = _emp(annual_ctc, pf_applicable=pf_applicable, esic_applicable=esic_applicable,
                   gender=gender)
        att = _std_att(lop=lop, ot_hours=ot_hours)
        return compute(emp, att, _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, pt_slabs)

    def test_monthly_ctc(self):
        r = self._result(300000)
        assert r.monthly_ctc == Decimal("25000.00")

    def test_pf_capped_at_1800_for_high_ctc(self):
        """Annual CTC 360000 → monthly 30000 → pf_wage 24000 → PF ₹1800."""
        r = self._result(360000)
        assert r.pf == Decimal("1800")
        assert r.actual_pf == Decimal("1800")
        assert r.employer_pf == Decimal("1800")

    def test_gross_is_ctc_minus_pf(self):
        r = self._result(360000)
        assert r.gross == r.monthly_ctc - r.pf

    def test_salary_split(self):
        r = self._result(360000)
        assert r.basic  == (r.gross * Decimal("0.50")).quantize(Decimal("0.01"))
        assert r.hra    == (r.gross * Decimal("0.20")).quantize(Decimal("0.01"))
        assert r.others == (r.gross * Decimal("0.30")).quantize(Decimal("0.01"))

    def test_no_lop_actual_equals_gross(self):
        r = self._result(360000, lop=0)
        assert r.lop_amount == Decimal("0")
        assert r.actual_gross == r.gross

    def test_lop_reduces_actual_gross(self):
        r = self._result(360000, lop=5)
        # gross = 28200 (30000 - 1800), per_day = 28200/30 = 940
        # lop_amount = 940 * 5 = 4700
        assert r.lop_days == Decimal("5")
        assert r.lop_amount > Decimal("0")
        assert r.actual_gross == r.gross - r.lop_amount

    def test_esic_not_applicable_when_ctc_above_21000(self):
        """Monthly CTC 25000 → above ESIC ceiling → no ESIC."""
        r = self._result(300000)
        assert r.ee_esic == Decimal("0")
        assert r.er_esic == Decimal("0")
        assert "ceiling" in r.esic_applicability_notes.lower()

    def test_esic_applies_when_ctc_below_21000(self):
        """Annual 216000 → monthly 18000 → below ₹21000 ceiling."""
        r = self._result(216000, esic_applicable=True)
        assert r.ee_esic > Decimal("0")
        assert r.er_esic > Decimal("0")

    def test_esic_amounts(self):
        """ESIC: ee = round0(actual_gross * 0.0075), er = round0(actual_gross * 0.0325)."""
        r = self._result(216000)
        # monthly_ctc = 18000, pf = round0(18000*0.80*0.12) = round0(1728) = 1728
        # gross = 18000 - 1728 = 16272, actual_gross (no LOP) = 16272
        expected_ee = round(float(r.actual_gross) * 0.0075)
        expected_er = round(float(r.actual_gross) * 0.0325)
        assert int(r.ee_esic) == expected_ee
        assert int(r.er_esic) == expected_er

    def test_pt_applies_above_10000(self):
        r = self._result(216000)
        # actual_gross > 10000 → PT = 200 for male
        assert r.pt == Decimal("200")

    def test_pt_zero_for_female_below_25000(self):
        r = self._result(216000, gender="female")
        # actual_gross ~16272 < 25000 → PT = 0 for female
        assert r.pt == Decimal("0")

    def test_no_ot_for_permanent_office(self):
        r = self._result(360000, ot_hours=5)
        assert r.ot_amount == Decimal("0")

    def test_total_deductions_formula(self):
        r = self._result(216000)
        expected = r.actual_pf + r.ee_esic + r.pt + r.contract_deduction
        assert r.total_deductions == expected

    def test_net_pay_formula(self):
        r = self._result(216000)
        assert r.net_pay == r.total_earnings - r.total_deductions


# ══════════════════════════════════════════════════════════════════════════════
# 4. Probation — no PF, no ESIC, PT applies, OT applies
# ══════════════════════════════════════════════════════════════════════════════

class TestProbationOffice:
    def _result(self, annual_ctc, lop=0, ot_hours=0, duty_hours=8.5):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        pt_slabs = [
            PTSlab(Decimal("0"), Decimal("7500"), Decimal("0"), "male"),
            PTSlab(Decimal("7500"), Decimal("10000"), Decimal("175"), "male"),
            PTSlab(Decimal("10000"), None, Decimal("200"), "male"),
        ]
        mod = _mod(pf=False, esic=False, pt=True, ot=True)
        emp = _emp(annual_ctc, module=PayrollModule.PROBATION_OFFICE,
                   pf_applicable=False, esic_applicable=False)
        att = _std_att(lop=lop, ot_hours=ot_hours, duty_hours=duty_hours)
        return compute(emp, att, _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, pt_slabs)

    def test_no_pf_deduction(self):
        r = self._result(240000)
        assert r.pf == Decimal("0")
        assert r.actual_pf == Decimal("0")
        assert r.employer_pf == Decimal("0")

    def test_gross_equals_monthly_ctc_when_no_pf(self):
        r = self._result(240000)
        assert r.gross == r.monthly_ctc

    def test_no_esic(self):
        r = self._result(180000)
        assert r.ee_esic == Decimal("0")
        assert r.er_esic == Decimal("0")

    def test_ot_calculated_for_worker(self):
        """OT enabled: with 8.5h duty and 31m break, effective = 7.983h."""
        r = self._result(240000, ot_hours=2, duty_hours=8.5)
        assert r.ot_amount > Decimal("0")

    def test_ot_formula(self):
        """Verify OT = round0(per_day_salary / effective_duty * ot_hours * multiplier)."""
        r = self._result(240000, ot_hours=3, duty_hours=8.5)
        # effective_duty = 8.5 - 31/60 = 7.9833...
        effective_duty = Decimal("8.5") - Decimal("31") / Decimal("60")
        hourly = r.per_day_salary / effective_duty
        expected_ot = round(float(hourly) * 3 * 1.0)  # multiplier 1.0
        assert int(r.ot_amount) == expected_ot

    def test_pt_applies_above_10000(self):
        r = self._result(240000)
        # monthly_ctc = 20000, gross = 20000 (no PF), per_day = 20000/30
        # actual_gross = 20000 (no LOP) > 10000 → PT = 200
        assert r.pt == Decimal("200")


# ══════════════════════════════════════════════════════════════════════════════
# 5. Permanent Worker — PF + ESIC + PT + OT (1.5×)
# ══════════════════════════════════════════════════════════════════════════════

class TestPermanentWorker:
    def _result(self, annual_ctc, lop=0, ot_hours=0):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.5"), 31)
        pt_slabs = [
            PTSlab(Decimal("0"), Decimal("7500"), Decimal("0"), "male"),
            PTSlab(Decimal("7500"), Decimal("10000"), Decimal("175"), "male"),
            PTSlab(Decimal("10000"), None, Decimal("200"), "male"),
        ]
        mod = _mod(pf=True, esic=True, pt=True, ot=True)
        emp = _emp(annual_ctc, module=PayrollModule.PERMANENT_WORKER)
        att = _std_att(lop=lop, ot_hours=ot_hours, duty_hours=8.5)
        return compute(emp, att, _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, pt_slabs)

    def test_worker_ot_is_1_5x(self):
        r = self._result(216000, ot_hours=4)
        assert r.ot_multiplier == Decimal("1.5")
        assert r.ot_amount > Decimal("0")

    def test_worker_ot_formula(self):
        r = self._result(216000, ot_hours=4)
        effective_duty = Decimal("8.5") - Decimal("31") / Decimal("60")
        hourly = r.per_day_salary / effective_duty
        expected = round(float(hourly) * 4 * 1.5)
        assert int(r.ot_amount) == expected

    def test_esic_base_includes_ot(self):
        """ESIC is computed on actual_gross + ot_amount."""
        r = self._result(216000, ot_hours=4)
        esic_base = r.actual_gross + r.ot_amount
        expected_ee = round(float(esic_base) * 0.0075)
        assert int(r.ee_esic) == expected_ee


# ══════════════════════════════════════════════════════════════════════════════
# 6. Contract Office — 1% Contract Professional Deduction
# ══════════════════════════════════════════════════════════════════════════════

class TestContractOffice:
    def _result(self, annual_ctc, lop=0, ot_hours=0,
                advance=0, other_ded=0, extra1=0, extra2=0):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        mod = _mod(pf=False, esic=False, pt=False, ot=True, contract_rate=Decimal("0.01"))
        emp = _emp(annual_ctc, module=PayrollModule.CONTRACT_OFFICE,
                   pf_applicable=False, esic_applicable=False)
        att = _std_att(lop=lop, ot_hours=ot_hours)
        manual = ManualInputs(advance=Decimal(str(advance)),
                              other_deduction=Decimal(str(other_ded)),
                              extra_deduction_1=Decimal(str(extra1)),
                              extra_deduction_2=Decimal(str(extra2)))
        return compute(emp, att, manual, pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])

    def test_no_pf_no_esic_no_pt(self):
        r = self._result(300000)
        assert r.pf == Decimal("0")
        assert r.ee_esic == Decimal("0")
        assert r.pt == Decimal("0")

    def test_contract_deduction_formula(self):
        """Contract deduction = 1% of (total_earnings - manual_deductions)."""
        r = self._result(300000)
        base = r.total_earnings  # no manual deductions
        expected = (base * Decimal("0.01")).quantize(Decimal("0.01"))
        assert r.contract_deduction == expected

    def test_contract_deduction_excludes_manual_deductions(self):
        """Advance and other_deduction are excluded from the 1% base."""
        r = self._result(300000, advance=5000, other_ded=1000)
        base = r.total_earnings - Decimal("5000") - Decimal("1000")
        expected = (base * Decimal("0.01")).quantize(Decimal("0.01"))
        assert r.contract_deduction == expected

    def test_contract_deduction_avoids_circular_dependency(self):
        """Contract deduction does NOT deduct itself before computing the base."""
        r_simple = self._result(300000)
        r_with_advance = self._result(300000, advance=1000)
        # with advance, the base should be total_earnings - 1000
        assert r_with_advance.contract_deduction < r_simple.contract_deduction

    def test_total_deductions_includes_contract(self):
        r = self._result(300000, advance=2000)
        assert r.contract_deduction > Decimal("0")
        expected_total = r.contract_deduction + r.advance
        assert r.total_deductions == expected_total

    def test_net_pay(self):
        r = self._result(300000)
        assert r.net_pay == r.total_earnings - r.total_deductions


# ══════════════════════════════════════════════════════════════════════════════
# 7. Consultant — no deductions, no OT
# ══════════════════════════════════════════════════════════════════════════════

class TestConsultant:
    def _result(self, annual_ctc, ot_hours=0):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        mod = _mod(pf=False, esic=False, pt=False, ot=False, contract_rate=None)
        emp = _emp(annual_ctc, module=PayrollModule.CONSULTANT_OFFICE,
                   pf_applicable=False, esic_applicable=False)
        att = _std_att(ot_hours=ot_hours)
        return compute(emp, att, _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])

    def test_all_statutory_deductions_zero(self):
        r = self._result(600000)
        assert r.pf == Decimal("0")
        assert r.ee_esic == Decimal("0")
        assert r.pt == Decimal("0")
        assert r.contract_deduction == Decimal("0")

    def test_no_ot_even_if_hours_entered(self):
        r = self._result(600000, ot_hours=10)
        assert r.ot_amount == Decimal("0")

    def test_net_pay_equals_actual_gross(self):
        r = self._result(600000)
        # no deductions → net_pay = actual_gross (= total_earnings with no manual additions)
        assert r.net_pay == r.actual_gross


# ══════════════════════════════════════════════════════════════════════════════
# 8. Cash module — no statutory deductions, OT applies
# ══════════════════════════════════════════════════════════════════════════════

class TestCashWorker:
    def _result(self, annual_ctc, ot_hours=0):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.5"), 31)
        mod = _mod(pf=False, esic=False, pt=False, ot=True)
        emp = _emp(annual_ctc, module=PayrollModule.CASH_WORKER,
                   payment_mode="cash", pf_applicable=False, esic_applicable=False)
        att = _std_att(ot_hours=ot_hours)
        return compute(emp, att, _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])

    def test_no_statutory_deductions(self):
        r = self._result(150000)
        assert r.pf == Decimal("0")
        assert r.ee_esic == Decimal("0")
        assert r.pt == Decimal("0")

    def test_ot_calculated(self):
        r = self._result(150000, ot_hours=3)
        assert r.ot_amount > Decimal("0")

    def test_net_equals_total_earnings(self):
        r = self._result(150000)
        assert r.net_pay == r.total_earnings


# ══════════════════════════════════════════════════════════════════════════════
# 9. Edge cases
# ══════════════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    def _permanent_result(self, annual_ctc, lop=0, ot_hours=0,
                          reimbursement=0, incentive=0, bonus=0):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.5"), 31)
        pt_slabs = [
            PTSlab(Decimal("0"), Decimal("7500"), Decimal("0"), "male"),
            PTSlab(Decimal("7500"), Decimal("10000"), Decimal("175"), "male"),
            PTSlab(Decimal("10000"), None, Decimal("200"), "male"),
        ]
        mod = _mod(pf=True, esic=True, pt=True, ot=True)
        emp = _emp(annual_ctc, module=PayrollModule.PERMANENT_WORKER)
        att = _std_att(lop=lop, ot_hours=ot_hours)
        manual = ManualInputs(
            reimbursement=Decimal(str(reimbursement)),
            incentive=Decimal(str(incentive)),
            bonus=Decimal(str(bonus)),
        )
        return compute(emp, att, manual, pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, pt_slabs)

    def test_full_lop_30_days(self):
        """Full month LOP → actual_gross = 0, but PF still computed on monthly_ctc."""
        r = self._permanent_result(216000, lop=30)
        assert r.actual_gross == Decimal("0")
        # ESIC base = 0 → ee_esic = 0
        assert r.ee_esic == Decimal("0")
        # PT on actual_gross = 0 → 0
        assert r.pt == Decimal("0")

    def test_zero_ot_hours(self):
        r = self._permanent_result(216000, ot_hours=0)
        assert r.ot_amount == Decimal("0")

    def test_esic_not_applicable_flag(self):
        """Employee flagged as esic_applicable=False → no ESIC even if CTC < ceiling."""
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        mod = _mod(pf=True, esic=True, pt=True, ot=False)
        emp = _emp(216000, pf_applicable=True, esic_applicable=False)
        r = compute(emp, _std_att(), _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])
        assert r.ee_esic == Decimal("0")
        assert r.er_esic == Decimal("0")

    def test_reimbursement_increases_total_earnings(self):
        r = self._permanent_result(216000, reimbursement=2000)
        assert r.reimbursement == Decimal("2000")
        assert r.total_earnings == r.actual_gross + r.ot_amount + Decimal("2000")

    def test_bonus_increases_total_earnings(self):
        r = self._permanent_result(216000, bonus=5000)
        assert r.total_earnings >= r.actual_gross + Decimal("5000")

    def test_pf_not_applicable_flag(self):
        """Employee flagged pf_applicable=False → PF is zero even in PF-enabled module."""
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        mod = _mod(pf=True, esic=False, pt=False, ot=False)
        emp = _emp(300000, pf_applicable=False, esic_applicable=False)
        r = compute(emp, _std_att(), _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])
        assert r.pf == Decimal("0")
        assert r.gross == r.monthly_ctc

    def test_manual_inputs_default_to_zero(self):
        """ManualInputs with no args should not raise and should all be Decimal(0)."""
        m = ManualInputs()
        for attr in ("reimbursement", "incentive", "bonus", "advance",
                     "other_deduction", "extra_deduction_1", "extra_deduction_2"):
            assert getattr(m, attr) == Decimal("0")

    def test_manual_inputs_from_floats(self):
        """ManualInputs should coerce float values to Decimal."""
        m = ManualInputs(reimbursement=1500.50, advance=200.0)
        assert isinstance(m.reimbursement, Decimal)
        assert m.reimbursement == Decimal("1500.5")

    def test_total_earnings_includes_all_additions(self):
        r = self._permanent_result(216000, reimbursement=1000, incentive=500, bonus=2000, ot_hours=2)
        expected = r.actual_gross + r.ot_amount + Decimal("1000") + Decimal("500") + Decimal("2000")
        assert r.total_earnings == expected.quantize(Decimal("0.01"))

    def test_net_pay_non_negative_for_full_lop_with_no_deductions(self):
        """Net pay should not go negative when the module has no deductions."""
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        mod = _mod(pf=False, esic=False, pt=False, ot=False)
        emp = _emp(216000, pf_applicable=False, esic_applicable=False)
        r = compute(emp, _std_att(lop=30), _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])
        assert r.net_pay >= Decimal("0")

    def test_28_day_february(self):
        """Calculation adapts to 28-day months correctly."""
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        mod = _mod(pf=True, esic=True, pt=False, ot=False)
        emp = _emp(216000)
        att = _std_att(total_days=28)
        r = compute(emp, att, _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])
        # per_day_salary should use 28 as denominator
        expected_per_day = r.gross / Decimal("28")
        assert abs(r.per_day_salary - expected_per_day) < Decimal("0.01")


# ══════════════════════════════════════════════════════════════════════════════
# 10. Return type sanity
# ══════════════════════════════════════════════════════════════════════════════

class TestReturnTypeSanity:
    def test_all_decimal_fields_are_decimal(self):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.5"), 31)
        mod = _mod(pf=True, esic=True, pt=True, ot=True)
        emp = _emp(216000)
        r = compute(emp, _std_att(ot_hours=2), _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])
        decimal_fields = [
            "monthly_ctc", "pf", "gross", "basic", "hra", "others", "per_day_salary",
            "lop_days", "lop_amount", "actual_gross", "actual_basic", "actual_hra", "actual_others",
            "duty_hours", "ot_hours", "ot_rate", "ot_multiplier", "ot_amount",
            "reimbursement", "incentive", "bonus", "total_earnings",
            "actual_pf", "employer_pf", "ee_esic", "er_esic", "pt",
            "advance", "other_deduction", "extra_deduction_1", "extra_deduction_2",
            "contract_deduction", "total_deductions", "net_pay",
        ]
        for f in decimal_fields:
            assert isinstance(getattr(r, f), Decimal), f"{f} is not Decimal"

    def test_result_is_payroll_result_instance(self):
        pf_cfg   = PFConfig(Decimal("0.80"), Decimal("15000"), Decimal("0.12"), Decimal("0.12"))
        esic_cfg = ESICConfig(Decimal("21000"), Decimal("0.0075"), Decimal("0.0325"))
        sal_cfg  = SalaryConfig(Decimal("0.50"), Decimal("0.20"), Decimal("0.30"))
        ot_cfg   = OTConfig(Decimal("1.0"), 31)
        mod = _mod()
        emp = _emp(216000, pf_applicable=False, esic_applicable=False)
        r = compute(emp, _std_att(), _no_manual(), pf_cfg, esic_cfg, sal_cfg, ot_cfg, mod, [])
        assert isinstance(r, PayrollResult)
