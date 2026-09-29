"""sign in with Google or Apple

Which Google or Apple account signs in as which Faldo user, by the service's own id for the person. Read before anyone
is signed in (the way users is), so it has no row-level security; it holds only the link and the email it came with.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-29 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "oauth_identities",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_oauth_identities_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_oauth_identities")),
        sa.UniqueConstraint("provider", "subject", name=op.f("uq_oauth_identities_provider")),
    )
    op.create_index(op.f("ix_oauth_identities_user_id"), "oauth_identities", ["user_id"], unique=False)
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_identities TO faldo_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_index(op.f("ix_oauth_identities_user_id"), table_name="oauth_identities")
    op.drop_table("oauth_identities")
