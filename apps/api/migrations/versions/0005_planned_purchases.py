"""planned purchases

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-21 18:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "planned_purchases",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("category_id", sa.UUID(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("priority", sa.String(length=10), server_default="medium", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("pause_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=12), server_default="planned", nullable=False),
        sa.Column("bought_transaction_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name=op.f("ck_planned_purchases_amount_positive")),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high')", name=op.f("ck_planned_purchases_priority_value")),
        sa.CheckConstraint("status IN ('planned', 'bought', 'dropped')", name=op.f("ck_planned_purchases_status_value")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_planned_purchases_user_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name=op.f("fk_planned_purchases_category_id_categories"),
                                ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["bought_transaction_id"], ["transactions.id"],
                                name=op.f("fk_planned_purchases_bought_transaction_id_transactions"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_planned_purchases")),
    )
    op.create_index(op.f("ix_planned_purchases_user_id"), "planned_purchases", ["user_id"], unique=False)
    op.execute("ALTER TABLE planned_purchases ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE planned_purchases FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY planned_purchases_owner ON planned_purchases "
        "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) "
        "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)"
    )
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON planned_purchases TO faldo_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS planned_purchases_owner ON planned_purchases")
    op.drop_index(op.f("ix_planned_purchases_user_id"), table_name="planned_purchases")
    op.drop_table("planned_purchases")
