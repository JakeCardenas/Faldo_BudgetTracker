"""companion: challenges, conversation recall and phone check-ins

Challenges Faldo tracks with the user (owned rows, row-level security like every user table); a short summary on each
conversation so later chats can recall it; push subscriptions for the daily check-in, a system table like jobs because
the daily run reads every row; and app_keys, where the server keeps the web push signing key it makes on first use.

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-23 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _grant(table: str) -> None:
    op.execute(f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO faldo_app;
          END IF;
        END $$;
    """)


def upgrade() -> None:
    op.create_table(
        "challenges",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=80), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("category_id", sa.UUID(), nullable=True),
        sa.Column("goal_id", sa.UUID(), nullable=True),
        sa.Column("start_on", sa.Date(), nullable=False),
        sa.Column("end_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=8), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('ipon_daily', 'ipon_52', 'no_spend', 'spend_cap')", name=op.f("ck_challenges_kind_known")),
        sa.CheckConstraint("status IN ('active', 'ended')", name=op.f("ck_challenges_status_known")),
        sa.CheckConstraint("end_on >= start_on", name=op.f("ck_challenges_dates_ordered")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_challenges_user_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name=op.f("fk_challenges_category_id_categories"),
                                ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["goal_id"], ["savings_goals.id"], name=op.f("fk_challenges_goal_id_savings_goals"),
                                ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_challenges")),
    )
    op.create_index(op.f("ix_challenges_user_id"), "challenges", ["user_id"], unique=False)
    op.execute("ALTER TABLE challenges ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE challenges FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY challenges_owner ON challenges "
        "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) "
        "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)"
    )
    _grant("challenges")

    op.add_column("ai_conversations", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("ai_conversations", sa.Column("summarized_messages", sa.Integer(), server_default="0", nullable=False))

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=200), nullable=False),
        sa.Column("auth", sa.String(length=64), nullable=False),
        sa.Column("last_signal_key", sa.String(length=160), nullable=True),
        sa.Column("last_sent_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_push_subscriptions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_subscriptions")),
        sa.UniqueConstraint("endpoint", name=op.f("uq_push_subscriptions_endpoint")),
    )
    op.create_index(op.f("ix_push_subscriptions_user_id"), "push_subscriptions", ["user_id"], unique=False)
    _grant("push_subscriptions")

    op.create_table(
        "app_keys",
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("name", name=op.f("pk_app_keys")),
    )
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT SELECT, INSERT ON app_keys TO faldo_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_keys")
    op.drop_index(op.f("ix_push_subscriptions_user_id"), table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
    op.drop_column("ai_conversations", "summarized_messages")
    op.drop_column("ai_conversations", "summary")
    op.execute("DROP POLICY IF EXISTS challenges_owner ON challenges")
    op.drop_index(op.f("ix_challenges_user_id"), table_name="challenges")
    op.drop_table("challenges")
