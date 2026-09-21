"""statement imports

Imported statement lines become ordinary transactions tagged with the batch they came from (so an import can be undone)
and an external reference that makes importing the same statement twice harmless.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-22 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_SOURCES = ("manual", "natural_language", "receipt", "recurring", "seed")
NEW_SOURCES = (*OLD_SOURCES, "import")


def _in(values: tuple[str, ...]) -> str:
    return "source IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("source", sa.String(length=20), server_default="csv", nullable=False),
        sa.Column("file_name", sa.String(length=200), nullable=True),
        sa.Column("imported_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("skipped_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_import_batches_user_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], name=op.f("fk_import_batches_account_id_accounts"),
                                ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_import_batches")),
    )
    op.create_index(op.f("ix_import_batches_user_id"), "import_batches", ["user_id"], unique=False)
    op.execute("ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE import_batches FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY import_batches_owner ON import_batches "
        "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) "
        "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)"
    )
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON import_batches TO faldo_app;
          END IF;
        END $$;
    """)

    op.add_column("transactions", sa.Column("external_ref", sa.String(length=120), nullable=True))
    op.add_column("transactions", sa.Column("import_batch_id", sa.UUID(), nullable=True))
    op.create_foreign_key(op.f("fk_transactions_import_batch_id_import_batches"), "transactions", "import_batches",
                          ["import_batch_id"], ["id"], ondelete="SET NULL")
    op.create_index(op.f("ix_transactions_import_batch_id"), "transactions", ["import_batch_id"], unique=False)
    op.create_index("uq_transactions_account_external_ref", "transactions", ["user_id", "account_id", "external_ref"],
                    unique=True, postgresql_where=sa.text("external_ref IS NOT NULL"))
    op.drop_constraint(op.f("ck_transactions_transaction_source"), "transactions", type_="check")
    op.create_check_constraint(op.f("ck_transactions_transaction_source"), "transactions", _in(NEW_SOURCES))


def downgrade() -> None:
    op.execute("UPDATE transactions SET source = 'manual' WHERE source = 'import'")
    op.drop_constraint(op.f("ck_transactions_transaction_source"), "transactions", type_="check")
    op.create_check_constraint(op.f("ck_transactions_transaction_source"), "transactions", _in(OLD_SOURCES))
    op.drop_index("uq_transactions_account_external_ref", table_name="transactions")
    op.drop_index(op.f("ix_transactions_import_batch_id"), table_name="transactions")
    op.drop_constraint(op.f("fk_transactions_import_batch_id_import_batches"), "transactions", type_="foreignkey")
    op.drop_column("transactions", "import_batch_id")
    op.drop_column("transactions", "external_ref")
    op.execute("DROP POLICY IF EXISTS import_batches_owner ON import_batches")
    op.drop_index(op.f("ix_import_batches_user_id"), table_name="import_batches")
    op.drop_table("import_batches")
