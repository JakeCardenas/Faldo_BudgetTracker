"""goal starting amounts and one-time expected income

A goal's starting amount is money saved before the goal existed, not a monthly contribution. Recurring items gain a
"once" frequency for expected one-off money (a client payment, a bonus) that isn't relied on until it arrives.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-22 09:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = ("weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly")
NEW = (*OLD, "once")
CHECKS = (("recurring_payments", "frequency", "ck_recurring_payments_recurring_frequency"),
          ("user_settings", "pay_frequency", "ck_user_settings_pay_frequency"))


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    op.add_column("goal_contributions", sa.Column("is_initial", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute("UPDATE goal_contributions SET is_initial = true WHERE note = 'Starting amount'")
    for table, column, name in CHECKS:
        op.drop_constraint(op.f(name), table, type_="check")
        op.create_check_constraint(op.f(name), table, _in(column, NEW))


def downgrade() -> None:
    op.execute("UPDATE recurring_payments SET frequency = 'monthly', is_active = false WHERE frequency = 'once'")
    op.execute("UPDATE user_settings SET pay_frequency = NULL WHERE pay_frequency = 'once'")
    for table, column, name in CHECKS:
        op.drop_constraint(op.f(name), table, type_="check")
        op.create_check_constraint(op.f(name), table, _in(column, OLD))
    op.drop_column("goal_contributions", "is_initial")
