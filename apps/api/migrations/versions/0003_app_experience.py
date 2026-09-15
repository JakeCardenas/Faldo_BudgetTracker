"""app experience settings and account ordering

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-15 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("theme", sa.String(10), nullable=False, server_default="system"))
    op.add_column("user_settings", sa.Column("mascot_outfit", sa.String(40), nullable=False, server_default="classic"))
    op.add_column("user_settings", sa.Column("home_background", sa.String(40), nullable=False, server_default="meadow"))
    op.add_column("user_settings", sa.Column("quick_actions", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"))
    op.add_column("user_settings", sa.Column("completed_lessons", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"))
    op.add_column("accounts", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.execute("""
        UPDATE accounts a SET sort_order = ranked.position
        FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at) - 1 AS position FROM accounts) ranked
        WHERE a.id = ranked.id
    """)


def downgrade() -> None:
    op.drop_column("accounts", "sort_order")
    for column in ("completed_lessons", "quick_actions", "home_background", "mascot_outfit", "theme"):
        op.drop_column("user_settings", column)
