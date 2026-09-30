"""email verification

A password account only counts as owning its email once the person signed into it opens a link sent there, or resets
the password through one (which also proves they read that inbox). Google or Apple accounts prove it themselves. Until
then, a Google or Apple sign-in for that email claims the account: every earlier session and link is revoked and the
unconfirmed password is turned off, so whoever registered the address first can't keep access to what the real owner
records.

Accounts that sign in only with Google or Apple count as confirmed from when they were linked. Accounts that also have
a password stay unconfirmed: the next Google or Apple sign-in with the same verified email secures them the same way.

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-30 16:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("""
        UPDATE users u
        SET email_verified_at = linked.first_link
        FROM (
            SELECT o.user_id, min(o.created_at) AS first_link
            FROM oauth_identities o
            JOIN users x ON x.id = o.user_id AND o.email = x.email
            GROUP BY o.user_id
        ) linked
        WHERE u.id = linked.user_id AND u.password_hash IS NULL
    """)


def downgrade() -> None:
    op.drop_column("users", "email_verified_at")
