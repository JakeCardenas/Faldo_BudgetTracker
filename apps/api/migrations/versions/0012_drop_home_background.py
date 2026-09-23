"""drop the Home background choice

Home has one look again (Faldo's green band with bamboo), so the saved background choice goes. Faldo's poses stay.

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-23 20:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("user_settings", "home_background")


def downgrade() -> None:
    op.add_column("user_settings", sa.Column("home_background", sa.String(40), nullable=False, server_default="meadow"))
