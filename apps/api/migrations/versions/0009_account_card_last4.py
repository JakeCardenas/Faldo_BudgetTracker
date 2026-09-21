"""optional last four digits on accounts

People can label a card or bank account with its last four digits so it's easy to recognise. Only four digits are
ever stored; full card numbers, CVVs and PINs are never collected.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-22 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("card_last4", sa.String(length=4), nullable=True))
    op.create_check_constraint(op.f("ck_accounts_card_last4_digits"), "accounts", "card_last4 ~ '^[0-9]{4}$'")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_accounts_card_last4_digits"), "accounts", type_="check")
    op.drop_column("accounts", "card_last4")
