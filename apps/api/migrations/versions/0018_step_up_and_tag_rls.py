"""recent sign-in for sensitive actions, and row-level security on transaction tags

sessions.reauthenticated_at records when this session last proved who it is (signing in, or re-entering the password).
Deleting the account and downloading all data need that to be recent. Existing sessions start without it, so they're
asked once.

transaction_tags had no row-level security of its own. A link now only exists for, and is only visible to, the person
who owns both its transaction and its tag (both of those tables already enforce ownership, so the checks below only see
the person's own rows).

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-30 20:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("reauthenticated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE transaction_tags FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY transaction_tags_owner ON transaction_tags "
        "USING (EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_id)) "
        "WITH CHECK (EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_id) "
        "AND EXISTS (SELECT 1 FROM tags g WHERE g.id = tag_id))"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS transaction_tags_owner ON transaction_tags")
    op.execute("ALTER TABLE transaction_tags NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE transaction_tags DISABLE ROW LEVEL SECURITY")
    op.drop_column("sessions", "reauthenticated_at")
