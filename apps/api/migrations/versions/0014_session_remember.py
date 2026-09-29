"""remember me

Whether a sign-in chose "Remember me". Existing sessions were all long-lived, so they start out remembered.

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-29 19:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("remember", sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column("sessions", "remember")
