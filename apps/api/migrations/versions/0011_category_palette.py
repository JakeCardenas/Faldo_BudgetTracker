"""one palette for category colours

The default categories move from a saturated rainbow to one palette (d3's Spectral, deepened where it runs pale), so
charts, rings and icons read as one set. Only categories still wearing their original default colour change; a colour
someone picked themselves is left alone. Subcategories follow their parent, as they were created with its colour.

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-23 18:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (kind, name, old colour, new colour)
PALETTE: list[tuple[str, str, str, str]] = [
    ("expense", "Food & Dining", "#C2410C", "#F0643D"),
    ("expense", "Groceries", "#15803D", "#6DBE7B"),
    ("expense", "Transportation", "#0369A1", "#3380BE"),
    ("expense", "Bills & Utilities", "#A16207", "#E3B63E"),
    ("expense", "Housing", "#4D7C0F", "#3FAE95"),
    ("expense", "Shopping", "#7C3AED", "#A8174D"),
    ("expense", "Subscriptions", "#BE185D", "#7B4F9E"),
    ("expense", "Entertainment", "#9333EA", "#5A5BAA"),
    ("expense", "Health", "#DC2626", "#D53E4F"),
    ("expense", "Personal Care", "#DB2777", "#E3739B"),
    ("expense", "Education", "#1D4ED8", "#2E97A8"),
    ("expense", "Travel", "#0E7490", "#A5C956"),
    ("expense", "Gifts & Family", "#B45309", "#F59B4C"),
    ("expense", "Fees & Charges", "#57534E", "#6E7A74"),
    ("expense", "Other", "#6B7280", "#A3ABA5"),
    ("income", "Salary", "#0B6B4B", "#6DBE7B"),
    ("income", "Freelance", "#15803D", "#3FAE95"),
    ("income", "Allowance", "#4D7C0F", "#A5C956"),
    ("income", "Gifts Received", "#B45309", "#F59B4C"),
    ("income", "Refunds", "#0369A1", "#3380BE"),
    ("income", "Other Income", "#6B7280", "#A3ABA5"),
]

# Categories force row-level security, which binds even the owner that runs migrations, so FORCE is lifted for this
# one table while every user's rows are recoloured, then put back.
RECOLOUR = sa.text("""
    UPDATE categories AS c SET color = :new
    WHERE c.kind = :kind AND upper(c.color) = :old
      AND (
        (c.parent_id IS NULL AND c.name = :name)
        OR c.parent_id IN (SELECT p.id FROM categories AS p WHERE p.parent_id IS NULL AND p.kind = :kind AND p.name = :name)
      )
""")


def _recolour(forward: bool) -> None:
    bind = op.get_bind()
    forced = bind.execute(sa.text("SELECT relforcerowsecurity FROM pg_class WHERE relname = 'categories'")).scalar()
    if forced:
        op.execute("ALTER TABLE categories NO FORCE ROW LEVEL SECURITY")
    for kind, name, old, new in PALETTE:
        before, after = (old, new) if forward else (new, old)
        bind.execute(RECOLOUR, {"kind": kind, "name": name, "old": before, "new": after})
    if forced:
        op.execute("ALTER TABLE categories FORCE ROW LEVEL SECURITY")


def upgrade() -> None:
    _recolour(forward=True)


def downgrade() -> None:
    _recolour(forward=False)
