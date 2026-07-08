"""add employee_salary_revisions table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-08 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'employee_salary_revisions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('effective_date', sa.Date(), nullable=False),
        sa.Column('ctc', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('basic', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('hra', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('allowances', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('revision_type', sa.Enum('joining', 'appraisal', 'promotion', 'correction', name='revisiontype'), nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_employee_salary_revisions_employee_id', 'employee_salary_revisions', ['employee_id'])


def downgrade() -> None:
    op.drop_index('ix_employee_salary_revisions_employee_id', table_name='employee_salary_revisions')
    op.drop_table('employee_salary_revisions')
    op.execute("DROP TYPE IF EXISTS revisiontype")
