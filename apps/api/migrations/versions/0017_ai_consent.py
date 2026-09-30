"""AI consent

Each person's choice about sending their data to an outside AI service, and which services they agreed to, so a newly
configured service asks again. Everyone starts undecided: nothing is sent outside until they allow it.

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-30 18:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("ai_consent", sa.String(length=10), server_default="unset", nullable=False))
    op.add_column("user_settings", sa.Column("ai_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_settings", sa.Column("ai_consent_providers", postgresql.ARRAY(sa.Text()), server_default="{}",
                                             nullable=False))
    op.create_check_constraint(op.f("ck_user_settings_ai_consent_choice"), "user_settings",
                               "ai_consent IN ('unset', 'allowed', 'declined')")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_user_settings_ai_consent_choice"), "user_settings", type_="check")
    op.drop_column("user_settings", "ai_consent_providers")
    op.drop_column("user_settings", "ai_consent_at")
    op.drop_column("user_settings", "ai_consent")
