"""serverless auth and storage

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-14 20:35:09.209872
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USER_SCOPED_TABLES = [
    "user_settings",
    "accounts",
    "categories",
    "merchants",
    "tags",
    "transactions",
    "transaction_items",
    "budgets",
    "budget_categories",
    "savings_goals",
    "goal_contributions",
    "recurring_payments",
    "debts",
    "debt_payments",
    "financial_notes",
    "receipts",
    "embeddings",
    "ai_insights",
    "ai_conversations",
    "ai_messages",
    "stored_files",
]

APP_ROLE_GRANTS = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO faldo_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO faldo_app;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.create_table(
        "rate_limit_hits",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key", "window_start", name=op.f("pk_rate_limit_hits")),
    )
    op.create_index(op.f("ix_rate_limit_hits_expires_at"), "rate_limit_hits", ["expires_at"], unique=False)

    op.create_table(
        "auth_tokens",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_auth_tokens_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_auth_tokens")),
    )
    op.create_index(op.f("ix_auth_tokens_user_id"), "auth_tokens", ["user_id"], unique=False)

    op.create_table(
        "stored_files",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_stored_files_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_stored_files")),
    )
    op.create_index(op.f("ix_stored_files_user_id"), "stored_files", ["user_id"], unique=False)
    op.execute("ALTER TABLE stored_files ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY stored_files_owner ON stored_files "
        "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) "
        "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)"
    )

    op.add_column("recurring_payments", sa.Column("anchor_day", sa.Integer(), nullable=True))
    op.execute("UPDATE recurring_payments SET anchor_day = EXTRACT(DAY FROM next_due_on)::int WHERE frequency IN ('monthly', 'quarterly', 'yearly')")

    op.drop_constraint("fk_transactions_account_id_accounts", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transactions_to_account_id_accounts", "transactions", type_="foreignkey")
    op.create_foreign_key("fk_transactions_account_id_accounts", "transactions", "accounts", ["account_id"], ["id"])
    op.create_foreign_key("fk_transactions_to_account_id_accounts", "transactions", "accounts", ["to_account_id"], ["id"])
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_settings_default_account_id_accounts') THEN "
        "ALTER TABLE user_settings ADD CONSTRAINT fk_user_settings_default_account_id_accounts "
        "FOREIGN KEY (default_account_id) REFERENCES accounts(id) ON DELETE SET NULL; "
        "END IF; END $$;"
    )

    for table in USER_SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(APP_ROLE_GRANTS)


def downgrade() -> None:
    for table in USER_SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS fk_user_settings_default_account_id_accounts")
    op.drop_column("recurring_payments", "anchor_day")
    op.execute("DROP POLICY IF EXISTS stored_files_owner ON stored_files")
    op.drop_index(op.f("ix_stored_files_user_id"), table_name="stored_files")
    op.drop_table("stored_files")
    op.drop_index(op.f("ix_auth_tokens_user_id"), table_name="auth_tokens")
    op.drop_table("auth_tokens")
    op.drop_index(op.f("ix_rate_limit_hits_expires_at"), table_name="rate_limit_hits")
    op.drop_table("rate_limit_hits")
