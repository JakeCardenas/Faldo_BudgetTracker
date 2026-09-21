"""money owed movements

Money lent, borrowed and repaid moves through accounts as its own transaction types (debt_out / debt_in), so
balances stay right without counting as income or spending. A split keeps a link to the original purchase.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-21 16:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_TYPES = ("income", "expense", "transfer")
NEW_TYPES = (*OLD_TYPES, "debt_in", "debt_out")


def _type_check(values: tuple[str, ...]) -> str:
    return "type IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_transactions_transaction_type"), "transactions", type_="check")
    op.create_check_constraint(op.f("ck_transactions_transaction_type"), "transactions", _type_check(NEW_TYPES))

    op.add_column("transactions", sa.Column("debt_id", sa.UUID(), nullable=True))
    op.create_foreign_key(op.f("fk_transactions_debt_id_debts"), "transactions", "debts", ["debt_id"], ["id"],
                          ondelete="CASCADE")
    op.create_index(op.f("ix_transactions_debt_id"), "transactions", ["debt_id"], unique=False)
    op.create_check_constraint(op.f("ck_transactions_debt_movement_linked"), "transactions",
                               "type NOT IN ('debt_in', 'debt_out') OR debt_id IS NOT NULL")

    op.add_column("debts", sa.Column("source_transaction_id", sa.UUID(), nullable=True))
    op.create_foreign_key(op.f("fk_debts_source_transaction_id_transactions"), "debts", "transactions",
                          ["source_transaction_id"], ["id"], ondelete="SET NULL")

    op.add_column("debt_payments", sa.Column("transaction_id", sa.UUID(), nullable=True))
    op.create_foreign_key(op.f("fk_debt_payments_transaction_id_transactions"), "debt_payments", "transactions",
                          ["transaction_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint(op.f("fk_debt_payments_transaction_id_transactions"), "debt_payments", type_="foreignkey")
    op.drop_column("debt_payments", "transaction_id")
    op.drop_constraint(op.f("fk_debts_source_transaction_id_transactions"), "debts", type_="foreignkey")
    op.drop_column("debts", "source_transaction_id")
    op.execute("DELETE FROM transactions WHERE type IN ('debt_in', 'debt_out')")
    op.drop_constraint(op.f("ck_transactions_debt_movement_linked"), "transactions", type_="check")
    op.drop_index(op.f("ix_transactions_debt_id"), table_name="transactions")
    op.drop_constraint(op.f("fk_transactions_debt_id_debts"), "transactions", type_="foreignkey")
    op.drop_column("transactions", "debt_id")
    op.drop_constraint(op.f("ck_transactions_transaction_type"), "transactions", type_="check")
    op.create_check_constraint(op.f("ck_transactions_transaction_type"), "transactions", _type_check(OLD_TYPES))
