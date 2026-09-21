"""money plans

One plan per user: how each income is given a job (bills, needs, Joy Money, savings, buffer).

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-22 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "money_plans",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("income_minor", sa.BigInteger(), nullable=True),
        sa.Column("savings_minor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("joy_minor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("buffer_minor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("needs_minor", sa.BigInteger(), nullable=True),
        sa.Column("template", sa.String(length=20), server_default="custom", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("income_minor IS NULL OR income_minor > 0", name=op.f("ck_money_plans_income_positive")),
        sa.CheckConstraint("savings_minor >= 0 AND joy_minor >= 0 AND buffer_minor >= 0 AND (needs_minor IS NULL OR needs_minor >= 0)",
                           name=op.f("ck_money_plans_amounts_non_negative")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_money_plans_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_money_plans")),
    )
    op.execute("ALTER TABLE money_plans ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE money_plans FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY money_plans_owner ON money_plans "
        "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) "
        "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)"
    )
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON money_plans TO faldo_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS money_plans_owner ON money_plans")
    op.drop_table("money_plans")
