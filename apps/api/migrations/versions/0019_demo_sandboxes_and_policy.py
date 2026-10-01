"""Demo sandboxes and policy acceptance

A demo sandbox is an ordinary user with its own seeded data and an end time; past it the account stops working and is
deleted (services/demo.py). Policy acceptance records which version of the Privacy notice and Terms a person agreed to,
and when, once the operator sets an approved version (POLICY_VERSION). Existing accounts start with neither.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-01 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("demo_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_demo_expires_at", "users", ["demo_expires_at"], unique=False,
                    postgresql_where=sa.text("demo_expires_at IS NOT NULL"))
    op.add_column("users", sa.Column("policy_version", sa.String(length=40), nullable=True))
    op.add_column("users", sa.Column("policy_accepted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "policy_accepted_at")
    op.drop_column("users", "policy_version")
    op.drop_index("ix_users_demo_expires_at", table_name="users", postgresql_where=sa.text("demo_expires_at IS NOT NULL"))
    op.drop_column("users", "demo_expires_at")
