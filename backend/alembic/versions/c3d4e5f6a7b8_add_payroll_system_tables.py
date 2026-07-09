"""add payroll system tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-09 10:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import JSON

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Config tables ─────────────────────────────────────────────────────────
    op.create_table(
        'payroll_pf_config',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('wage_pct',       sa.Numeric(5, 4),  nullable=False),
        sa.Column('wage_ceiling',   sa.Numeric(10, 2), nullable=False),
        sa.Column('ee_rate',        sa.Numeric(5, 4),  nullable=False),
        sa.Column('er_rate',        sa.Numeric(5, 4),  nullable=False),
        sa.Column('effective_from', sa.Date(),          nullable=False),
        sa.Column('effective_to',   sa.Date(),          nullable=True),
        sa.Column('created_at',     sa.DateTime(),      server_default=sa.func.now()),
        sa.UniqueConstraint('effective_from', name='uq_pf_effective_from'),
    )

    op.create_table(
        'payroll_esic_config',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('wage_ceiling',   sa.Numeric(10, 2), nullable=False),
        sa.Column('ee_rate',        sa.Numeric(5, 4),  nullable=False),
        sa.Column('er_rate',        sa.Numeric(5, 4),  nullable=False),
        sa.Column('effective_from', sa.Date(),          nullable=False),
        sa.Column('effective_to',   sa.Date(),          nullable=True),
        sa.Column('created_at',     sa.DateTime(),      server_default=sa.func.now()),
        sa.UniqueConstraint('effective_from', name='uq_esic_effective_from'),
    )

    op.create_table(
        'payroll_salary_config',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('basic_pct',      sa.Numeric(5, 4),  nullable=False),
        sa.Column('hra_pct',        sa.Numeric(5, 4),  nullable=False),
        sa.Column('others_pct',     sa.Numeric(5, 4),  nullable=False),
        sa.Column('effective_from', sa.Date(),          nullable=False),
        sa.Column('effective_to',   sa.Date(),          nullable=True),
        sa.Column('created_at',     sa.DateTime(),      server_default=sa.func.now()),
        sa.UniqueConstraint('effective_from', name='uq_sal_effective_from'),
    )

    op.create_table(
        'payroll_ot_config',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('employee_type',  sa.Enum('office_staff','worker','housekeeping','security',
                                            name='otemployeetype'), nullable=False),
        sa.Column('ot_multiplier',  sa.Numeric(4, 2),  nullable=False),
        sa.Column('break_minutes',  sa.SmallInteger(), nullable=False, server_default='31'),
        sa.Column('effective_from', sa.Date(),          nullable=False),
        sa.Column('effective_to',   sa.Date(),          nullable=True),
        sa.Column('created_at',     sa.DateTime(),      server_default=sa.func.now()),
        sa.UniqueConstraint('employee_type', 'effective_from', name='uq_ot_type_effective_from'),
    )

    op.create_table(
        'payroll_pt_slabs',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('state',          sa.String(50),     nullable=False),
        sa.Column('gender',         sa.Enum('male','female','all', name='ptgender'), nullable=False),
        sa.Column('min_gross',      sa.Numeric(12, 2), nullable=False),
        sa.Column('max_gross',      sa.Numeric(12, 2), nullable=True),
        sa.Column('pt_amount',      sa.Numeric(8, 2),  nullable=False),
        sa.Column('effective_from', sa.Date(),          nullable=False),
        sa.Column('effective_to',   sa.Date(),          nullable=True),
        sa.Column('created_at',     sa.DateTime(),      server_default=sa.func.now()),
        sa.UniqueConstraint('state','gender','min_gross','effective_from', name='uq_pt_slab'),
    )

    op.create_table(
        'payroll_module_config',
        sa.Column('id',                      sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('payroll_module',          sa.Enum(
            'probation_office','probation_worker',
            'permanent_office','permanent_worker',
            'contract_office','contract_worker',
            'consultant_office','consultant_worker',
            'consultant_housekeeping','consultant_security',
            'cash_office','cash_worker',
            name='payrollmodule'), nullable=False),
        sa.Column('pf_enabled',              sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('esic_enabled',            sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('pt_enabled',              sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('ot_enabled',              sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('contract_deduction_rate', sa.Numeric(5, 4), nullable=True),
        sa.Column('effective_from',          sa.Date(),    nullable=False),
        sa.Column('effective_to',            sa.Date(),    nullable=True),
        sa.Column('created_at',              sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('payroll_module','effective_from', name='uq_module_config'),
    )

    # ── Core tables ───────────────────────────────────────────────────────────
    op.create_table(
        'payroll_runs',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('period_year',    sa.SmallInteger(), nullable=False),
        sa.Column('period_month',   sa.SmallInteger(), nullable=False),
        sa.Column('payroll_module', sa.Enum(
            'probation_office','probation_worker',
            'permanent_office','permanent_worker',
            'contract_office','contract_worker',
            'consultant_office','consultant_worker',
            'consultant_housekeeping','consultant_security',
            'cash_office','cash_worker',
            name='payrollmodule'), nullable=False),
        sa.Column('total_days',     sa.SmallInteger(), nullable=False),
        sa.Column('working_days',   sa.SmallInteger(), nullable=False),
        sa.Column('status',         sa.Enum('draft','processing','approved','locked',
                                            name='runstatus'),
                  nullable=False, server_default='draft'),
        sa.Column('created_by',     sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('approved_by',    sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('approved_at',    sa.DateTime(), nullable=True),
        sa.Column('locked_by',      sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('locked_at',      sa.DateTime(), nullable=True),
        sa.Column('unlock_reason',  sa.Text(),     nullable=True),
        sa.Column('created_at',     sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('period_year','period_month','payroll_module', name='uq_payroll_run'),
    )

    op.create_table(
        'payroll_attendance',
        sa.Column('id',          sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('run_id',      sa.Integer(), sa.ForeignKey('payroll_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id',   ondelete='CASCADE'), nullable=False),
        sa.Column('lop_days',    sa.Numeric(5, 2),  nullable=False, server_default='0'),
        sa.Column('ot_hours',    sa.Numeric(7, 2),  nullable=False, server_default='0'),
        sa.Column('duty_hours',  sa.Numeric(7, 2),  nullable=False, server_default='0'),
        sa.Column('entered_by',  sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('updated_at',  sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('run_id','employee_id', name='uq_payroll_attendance'),
    )
    op.create_index('ix_payroll_attendance_run_id',      'payroll_attendance', ['run_id'])
    op.create_index('ix_payroll_attendance_employee_id', 'payroll_attendance', ['employee_id'])

    op.create_table(
        'payroll_manual_inputs',
        sa.Column('id',                sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('run_id',            sa.Integer(), sa.ForeignKey('payroll_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('employee_id',       sa.Integer(), sa.ForeignKey('employees.id',   ondelete='CASCADE'), nullable=False),
        sa.Column('reimbursement',     sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('incentive',         sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('bonus',             sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('advance',           sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('other_deduction',   sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('extra_deduction_1', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('extra_deduction_2', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('remarks',           sa.Text(),    nullable=True),
        sa.Column('entered_by',        sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('updated_at',        sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('run_id','employee_id', name='uq_payroll_manual_inputs'),
    )

    op.create_table(
        'payroll_entries',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('run_id',         sa.Integer(), sa.ForeignKey('payroll_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('employee_id',    sa.Integer(), sa.ForeignKey('employees.id',   ondelete='CASCADE'), nullable=False),
        sa.Column('payroll_module', sa.Enum(
            'probation_office','probation_worker',
            'permanent_office','permanent_worker',
            'contract_office','contract_worker',
            'consultant_office','consultant_worker',
            'consultant_housekeeping','consultant_security',
            'cash_office','cash_worker',
            name='payrollmodule'), nullable=False),

        # Steps 1-4
        sa.Column('monthly_ctc',    sa.Numeric(12, 2), nullable=False),
        sa.Column('pf',             sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('gross',          sa.Numeric(12, 2), nullable=False),
        sa.Column('basic',          sa.Numeric(12, 2), nullable=False),
        sa.Column('hra',            sa.Numeric(12, 2), nullable=False),
        sa.Column('others',         sa.Numeric(12, 2), nullable=False),
        sa.Column('per_day_salary', sa.Numeric(12, 4), nullable=False),

        # Steps 5-6
        sa.Column('lop_days',       sa.Numeric(5, 2),  nullable=False, server_default='0'),
        sa.Column('lop_amount',     sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('actual_gross',   sa.Numeric(12, 2), nullable=False),
        sa.Column('actual_basic',   sa.Numeric(12, 2), nullable=False),
        sa.Column('actual_hra',     sa.Numeric(12, 2), nullable=False),
        sa.Column('actual_others',  sa.Numeric(12, 2), nullable=False),

        # Step 7
        sa.Column('duty_hours',     sa.Numeric(7, 2),  nullable=False, server_default='0'),
        sa.Column('ot_hours',       sa.Numeric(7, 2),  nullable=False, server_default='0'),
        sa.Column('ot_rate',        sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.Column('ot_multiplier',  sa.Numeric(4, 2),  nullable=False, server_default='1'),
        sa.Column('ot_amount',      sa.Numeric(12, 2), nullable=False, server_default='0'),

        # Step 8
        sa.Column('reimbursement',  sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('incentive',      sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('bonus',          sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total_earnings', sa.Numeric(12, 2), nullable=False),

        # Steps 9-11
        sa.Column('actual_pf',      sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('employer_pf',    sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('ee_esic',        sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('er_esic',        sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('pt',             sa.Numeric(10, 2), nullable=False, server_default='0'),

        # Steps 12-14
        sa.Column('advance',             sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('other_deduction',     sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('extra_deduction_1',   sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('extra_deduction_2',   sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('contract_deduction',  sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('total_deductions',    sa.Numeric(12, 2), nullable=False),
        sa.Column('net_pay',             sa.Numeric(12, 2), nullable=False),

        # Flags
        sa.Column('pf_applicable',            sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('esic_applicable',           sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('esic_applicability_notes',  sa.Text(),    nullable=True),

        # Approval
        sa.Column('approval_status', sa.Enum('pending','approved','on_hold','paid',
                                             name='entryapprovalstatus'),
                  nullable=False, server_default='pending'),
        sa.Column('hold_reason',     sa.Text(),    nullable=True),
        sa.Column('payment_mode',    sa.String(10), nullable=False, server_default='bank'),
        sa.Column('paid_at',         sa.DateTime(), nullable=True),
        sa.Column('paid_by',         sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('payment_remarks', sa.Text(),    nullable=True),

        # Audit
        sa.Column('calculation_snapshot', JSON,         nullable=True),
        sa.Column('computed_at',          sa.DateTime(), server_default=sa.func.now()),
        sa.Column('computed_by',          sa.Integer(), sa.ForeignKey('users.id'), nullable=True),

        sa.UniqueConstraint('run_id','employee_id', name='uq_payroll_entry'),
    )
    op.create_index('ix_payroll_entries_run_id',      'payroll_entries', ['run_id'])
    op.create_index('ix_payroll_entries_employee_id', 'payroll_entries', ['employee_id'])

    op.create_table(
        'employee_module_history',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('employee_id',    sa.Integer(), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('from_module',    sa.String(30), nullable=True),
        sa.Column('to_module',      sa.String(30), nullable=False),
        sa.Column('effective_date', sa.Date(),     nullable=False),
        sa.Column('changed_by',     sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('change_reason',  sa.Text(),     nullable=True),
        sa.Column('created_at',     sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_employee_module_history_employee_id', 'employee_module_history', ['employee_id'])

    op.create_table(
        'payroll_audit_log',
        sa.Column('id',             sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('event_type',     sa.String(50),  nullable=False),
        sa.Column('entity_type',    sa.String(20),  nullable=False),
        sa.Column('entity_id',      sa.Integer(),   nullable=False),
        sa.Column('employee_id',    sa.Integer(), sa.ForeignKey('employees.id'), nullable=True),
        sa.Column('run_id',         sa.Integer(), sa.ForeignKey('payroll_runs.id'), nullable=True),
        sa.Column('previous_value', JSON,           nullable=True),
        sa.Column('new_value',      JSON,           nullable=True),
        sa.Column('reason',         sa.Text(),      nullable=True),
        sa.Column('performed_by',   sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('performed_at',   sa.DateTime(), server_default=sa.func.now()),
        sa.Column('ip_address',     sa.String(45),  nullable=True),
    )
    op.create_index('ix_payroll_audit_event_type',  'payroll_audit_log', ['event_type'])
    op.create_index('ix_payroll_audit_entity',      'payroll_audit_log', ['entity_type', 'entity_id'])
    op.create_index('ix_payroll_audit_employee_id', 'payroll_audit_log', ['employee_id'])
    op.create_index('ix_payroll_audit_run_id',      'payroll_audit_log', ['run_id'])
    op.create_index('ix_payroll_audit_performed_at','payroll_audit_log', ['performed_at'])

    op.create_table(
        'payroll_payslips',
        sa.Column('id',           sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('entry_id',     sa.Integer(), sa.ForeignKey('payroll_entries.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('generated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('generated_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('file_url',     sa.Text(),     nullable=True),
        sa.Column('file_key',     sa.String(500), nullable=True),
        sa.Column('emailed_at',   sa.DateTime(), nullable=True),
    )

    # ── Seed Phase 1 defaults ─────────────────────────────────────────────────
    from datetime import date as dt
    seed_date = '2024-04-01'

    op.bulk_insert(
        sa.table('payroll_pf_config',
            sa.column('wage_pct'),  sa.column('wage_ceiling'),
            sa.column('ee_rate'),   sa.column('er_rate'),
            sa.column('effective_from'),
        ),
        [{"wage_pct": 0.8000, "wage_ceiling": 15000.00,
          "ee_rate": 0.1200, "er_rate": 0.1200, "effective_from": seed_date}],
    )

    op.bulk_insert(
        sa.table('payroll_esic_config',
            sa.column('wage_ceiling'), sa.column('ee_rate'),
            sa.column('er_rate'),      sa.column('effective_from'),
        ),
        [{"wage_ceiling": 21000.00, "ee_rate": 0.0075, "er_rate": 0.0325, "effective_from": seed_date}],
    )

    op.bulk_insert(
        sa.table('payroll_salary_config',
            sa.column('basic_pct'), sa.column('hra_pct'),
            sa.column('others_pct'), sa.column('effective_from'),
        ),
        [{"basic_pct": 0.5000, "hra_pct": 0.2000, "others_pct": 0.3000, "effective_from": seed_date}],
    )

    op.bulk_insert(
        sa.table('payroll_ot_config',
            sa.column('employee_type'), sa.column('ot_multiplier'),
            sa.column('break_minutes'), sa.column('effective_from'),
        ),
        [
            {"employee_type": "office_staff",  "ot_multiplier": 1.0, "break_minutes": 31, "effective_from": seed_date},
            {"employee_type": "worker",         "ot_multiplier": 1.5, "break_minutes": 31, "effective_from": seed_date},
            {"employee_type": "housekeeping",   "ot_multiplier": 1.0, "break_minutes": 31, "effective_from": seed_date},
            {"employee_type": "security",       "ot_multiplier": 1.0, "break_minutes": 31, "effective_from": seed_date},
        ],
    )

    # Maharashtra PT slabs (male)
    op.bulk_insert(
        sa.table('payroll_pt_slabs',
            sa.column('state'), sa.column('gender'),
            sa.column('min_gross'), sa.column('max_gross'),
            sa.column('pt_amount'), sa.column('effective_from'),
        ),
        [
            {"state": "Maharashtra", "gender": "male", "min_gross": 0,     "max_gross": 7500,   "pt_amount": 0,   "effective_from": seed_date},
            {"state": "Maharashtra", "gender": "male", "min_gross": 7500,  "max_gross": 10000,  "pt_amount": 175, "effective_from": seed_date},
            {"state": "Maharashtra", "gender": "male", "min_gross": 10000, "max_gross": None,   "pt_amount": 200, "effective_from": seed_date},
            {"state": "Maharashtra", "gender": "female","min_gross": 0,    "max_gross": 25000,  "pt_amount": 0,   "effective_from": seed_date},
            {"state": "Maharashtra", "gender": "female","min_gross": 25000,"max_gross": None,   "pt_amount": 200, "effective_from": seed_date},
        ],
    )

    # Module config — one row per module
    module_rows = [
        # pf  esic   pt    ot    contract_rate
        ("probation_office",        False, False, True,  True,  None),
        ("probation_worker",        False, False, True,  True,  None),
        ("permanent_office",        True,  True,  True,  True,  None),
        ("permanent_worker",        True,  True,  True,  True,  None),
        ("contract_office",         False, False, False, True,  0.01),
        ("contract_worker",         False, False, False, True,  0.01),
        ("consultant_office",       False, False, False, False, None),
        ("consultant_worker",       False, False, False, False, None),
        ("consultant_housekeeping", False, False, False, False, None),
        ("consultant_security",     False, False, False, False, None),
        ("cash_office",             False, False, False, True,  None),
        ("cash_worker",             False, False, False, True,  None),
    ]
    op.bulk_insert(
        sa.table('payroll_module_config',
            sa.column('payroll_module'), sa.column('pf_enabled'),
            sa.column('esic_enabled'),   sa.column('pt_enabled'),
            sa.column('ot_enabled'),     sa.column('contract_deduction_rate'),
            sa.column('effective_from'),
        ),
        [
            {
                "payroll_module": m, "pf_enabled": pf, "esic_enabled": esic,
                "pt_enabled": pt, "ot_enabled": ot,
                "contract_deduction_rate": cr, "effective_from": seed_date,
            }
            for m, pf, esic, pt, ot, cr in module_rows
        ],
    )


def downgrade() -> None:
    op.drop_table('payroll_payslips')
    op.drop_table('payroll_audit_log')
    op.drop_table('employee_module_history')
    op.drop_table('payroll_entries')
    op.drop_table('payroll_manual_inputs')
    op.drop_table('payroll_attendance')
    op.drop_table('payroll_runs')
    op.drop_table('payroll_module_config')
    op.drop_table('payroll_pt_slabs')
    op.drop_table('payroll_ot_config')
    op.drop_table('payroll_salary_config')
    op.drop_table('payroll_esic_config')
    op.drop_table('payroll_pf_config')
    # MySQL drops enum types automatically with their tables
