"""make_employee_last_name_nullable

Revision ID: 3554222f6556
Revises: c3d4e5f6a7b8
Create Date: 2026-07-09 15:38:56.459937

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '3554222f6556'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('employees', 'last_name',
                    existing_type=sa.String(length=100),
                    nullable=True)


def downgrade() -> None:
    op.alter_column('employees', 'last_name',
                    existing_type=sa.String(length=100),
                    nullable=False)
