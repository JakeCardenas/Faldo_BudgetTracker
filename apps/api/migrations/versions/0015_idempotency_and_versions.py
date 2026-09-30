"""idempotency keys and transaction versions

Writes that a retry could repeat (creating a transaction, confirming capture drafts or a receipt, uploading a receipt)
record the Idempotency-Key they were sent with and the answer they gave, so the same request again replays that answer
instead of writing twice. Transactions gain a version that goes up with every edit, so an edit made from an older copy
is refused instead of silently overwriting a newer one. Existing transactions start at version 1.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-30 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False))

    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("operation", sa.String(length=40), nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=True),
        sa.Column("response_body", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_idempotency_keys_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_idempotency_keys")),
        sa.UniqueConstraint("user_id", "operation", "key", name="uq_idempotency_keys_user_operation_key"),
    )
    op.create_index(op.f("ix_idempotency_keys_user_id"), "idempotency_keys", ["user_id"], unique=False)
    op.create_index("ix_idempotency_keys_user_created", "idempotency_keys", ["user_id", "created_at"], unique=False)
    op.execute("ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY idempotency_keys_owner ON idempotency_keys "
        "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) "
        "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)"
    )
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO faldo_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS idempotency_keys_owner ON idempotency_keys")
    op.drop_index("ix_idempotency_keys_user_created", table_name="idempotency_keys")
    op.drop_index(op.f("ix_idempotency_keys_user_id"), table_name="idempotency_keys")
    op.drop_table("idempotency_keys")
    op.drop_column("transactions", "version")
