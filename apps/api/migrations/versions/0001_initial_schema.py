"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-14 13:52:46.565702
"""
from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USER_SCOPED_TABLES = [
    "user_settings",
    "accounts",
    "categories",
    "merchants",
    "tags",
    "transactions",
    "transaction_items",
    "budgets",
    "budget_categories",
    "savings_goals",
    "goal_contributions",
    "recurring_payments",
    "debts",
    "debt_payments",
    "financial_notes",
    "receipts",
    "embeddings",
    "ai_insights",
    "ai_conversations",
    "ai_messages",
]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.create_table('users',
    sa.Column('email', postgresql.CITEXT(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=True),
    sa.Column('display_name', sa.String(length=80), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    op.create_table('accounts',
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('type', sa.Enum('cash', 'bank', 'e_wallet', 'credit_card', 'savings', 'custom', name='account_type', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('custom_type', sa.String(length=40), nullable=True),
    sa.Column('institution', sa.String(length=60), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('opening_balance_minor', sa.BigInteger(), nullable=False),
    sa.Column('is_spendable', sa.Boolean(), nullable=False),
    sa.Column('credit_limit_minor', sa.BigInteger(), nullable=True),
    sa.Column('color', sa.String(length=16), nullable=True),
    sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f('ck_accounts_currency_code')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_accounts_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_accounts')),
    sa.UniqueConstraint('user_id', 'name', name=op.f('uq_accounts_user_id'))
    )
    op.create_index(op.f('ix_accounts_user_id'), 'accounts', ['user_id'], unique=False)
    op.create_table('ai_conversations',
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_ai_conversations_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_conversations'))
    )
    op.create_index(op.f('ix_ai_conversations_user_id'), 'ai_conversations', ['user_id'], unique=False)
    op.create_table('ai_insights',
    sa.Column('type', sa.String(length=40), nullable=False),
    sa.Column('severity', sa.Enum('positive', 'info', 'warning', 'critical', name='insight_severity', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('facts', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('evidence', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('dedupe_key', sa.String(length=160), nullable=False),
    sa.Column('period_key', sa.String(length=16), nullable=False),
    sa.Column('status', sa.Enum('active', 'dismissed', name='insight_status', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_ai_insights_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_insights')),
    sa.UniqueConstraint('user_id', 'dedupe_key', name=op.f('uq_ai_insights_user_id'))
    )
    op.create_index(op.f('ix_ai_insights_user_id'), 'ai_insights', ['user_id'], unique=False)
    op.create_table('budgets',
    sa.Column('month', sa.Date(), nullable=False),
    sa.Column('total_limit_minor', sa.BigInteger(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('extract(day from month) = 1', name=op.f('ck_budgets_month_start')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_budgets_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_budgets')),
    sa.UniqueConstraint('user_id', 'month', name=op.f('uq_budgets_user_id'))
    )
    op.create_index(op.f('ix_budgets_user_id'), 'budgets', ['user_id'], unique=False)
    op.create_table('categories',
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('kind', sa.Enum('expense', 'income', name='category_kind', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('parent_id', sa.UUID(), nullable=True),
    sa.Column('icon', sa.String(length=40), nullable=True),
    sa.Column('color', sa.String(length=16), nullable=True),
    sa.Column('is_essential', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['parent_id'], ['categories.id'], name=op.f('fk_categories_parent_id_categories'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_categories_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_categories')),
    sa.UniqueConstraint('user_id', 'parent_id', 'name', 'kind', name=op.f('uq_categories_user_id'))
    )
    op.create_index(op.f('ix_categories_parent_id'), 'categories', ['parent_id'], unique=False)
    op.create_index(op.f('ix_categories_user_id'), 'categories', ['user_id'], unique=False)
    op.create_table('debts',
    sa.Column('direction', sa.Enum('i_owe', 'owed_to_me', name='debt_direction', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('counterparty', sa.String(length=80), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('due_on', sa.Date(), nullable=True),
    sa.Column('status', sa.Enum('open', 'settled', 'cancelled', name='debt_status', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('started_on', sa.Date(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name=op.f('ck_debts_amount_positive')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_debts_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_debts'))
    )
    op.create_index(op.f('ix_debts_user_id'), 'debts', ['user_id'], unique=False)
    op.create_table('embeddings',
    sa.Column('entity_type', sa.String(length=32), nullable=False),
    sa.Column('entity_id', sa.UUID(), nullable=False),
    sa.Column('provenance', sa.String(length=16), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('content_hash', sa.String(length=64), nullable=False),
    sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=1536), nullable=False),
    sa.Column('embedding_model', sa.String(length=64), nullable=False),
    sa.Column('search_tsv', postgresql.TSVECTOR(), sa.Computed("to_tsvector('simple', content)", persisted=True), nullable=False),
    sa.Column('occurred_on', sa.Date(), nullable=True),
    sa.Column('category_id', sa.UUID(), nullable=True),
    sa.Column('account_id', sa.UUID(), nullable=True),
    sa.Column('amount_minor', sa.BigInteger(), nullable=True),
    sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_embeddings_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_embeddings')),
    sa.UniqueConstraint('user_id', 'entity_type', 'entity_id', name=op.f('uq_embeddings_user_id'))
    )
    op.create_index('ix_embeddings_content_trgm', 'embeddings', ['content'], unique=False, postgresql_using='gin', postgresql_ops={'content': 'gin_trgm_ops'})
    op.create_index('ix_embeddings_search_tsv', 'embeddings', ['search_tsv'], unique=False, postgresql_using='gin')
    op.create_index(op.f('ix_embeddings_user_id'), 'embeddings', ['user_id'], unique=False)
    op.create_index('ix_embeddings_user_type_date', 'embeddings', ['user_id', 'entity_type', 'occurred_on'], unique=False)
    op.create_table('jobs',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('dedupe_key', sa.String(length=160), nullable=True),
    sa.Column('status', sa.Enum('queued', 'running', 'done', 'failed', name='job_status', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('run_after', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_error', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_jobs_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_jobs'))
    )
    op.create_index('ix_jobs_status_run_after', 'jobs', ['status', 'run_after'], unique=False)
    op.create_table('sessions',
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('user_agent', sa.String(length=255), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('token_hash', name=op.f('pk_sessions'))
    )
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)
    op.create_table('tags',
    sa.Column('name', sa.String(length=40), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_tags_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tags')),
    sa.UniqueConstraint('user_id', 'name', name=op.f('uq_tags_user_id'))
    )
    op.create_index(op.f('ix_tags_user_id'), 'tags', ['user_id'], unique=False)
    op.create_table('user_settings',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('currency', sa.String(length=3), server_default='PHP', nullable=False),
    sa.Column('timezone', sa.String(length=64), server_default='Asia/Manila', nullable=False),
    sa.Column('pay_frequency', sa.Enum('weekly', 'biweekly', 'semi_monthly', 'monthly', 'quarterly', 'yearly', name='pay_frequency', native_enum=False, create_constraint=True, length=32), nullable=True),
    sa.Column('pay_days', postgresql.ARRAY(sa.Integer()), server_default='{}', nullable=False),
    sa.Column('monthly_income_minor', sa.BigInteger(), nullable=True),
    sa.Column('safe_to_spend_buffer_minor', sa.BigInteger(), server_default='100000', nullable=False),
    sa.Column('default_account_id', sa.UUID(), nullable=True),
    sa.Column('onboarding_completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['default_account_id'], ['accounts.id'], name=op.f('fk_user_settings_default_account_id_accounts'), ondelete='SET NULL', use_alter=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_user_settings_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', name=op.f('pk_user_settings'))
    )
    op.create_table('ai_messages',
    sa.Column('conversation_id', sa.UUID(), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('blocks', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('sources', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('tool_calls', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('follow_ups', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('provider', sa.String(length=40), nullable=True),
    sa.Column('validation', sa.String(length=16), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['conversation_id'], ['ai_conversations.id'], name=op.f('fk_ai_messages_conversation_id_ai_conversations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_ai_messages_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_messages'))
    )
    op.create_index(op.f('ix_ai_messages_conversation_id'), 'ai_messages', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_ai_messages_user_id'), 'ai_messages', ['user_id'], unique=False)
    op.create_table('budget_categories',
    sa.Column('budget_id', sa.UUID(), nullable=False),
    sa.Column('category_id', sa.UUID(), nullable=False),
    sa.Column('limit_minor', sa.BigInteger(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('limit_minor > 0', name=op.f('ck_budget_categories_limit_positive')),
    sa.ForeignKeyConstraint(['budget_id'], ['budgets.id'], name=op.f('fk_budget_categories_budget_id_budgets'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('fk_budget_categories_category_id_categories'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_budget_categories_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_budget_categories')),
    sa.UniqueConstraint('budget_id', 'category_id', name=op.f('uq_budget_categories_budget_id'))
    )
    op.create_index(op.f('ix_budget_categories_budget_id'), 'budget_categories', ['budget_id'], unique=False)
    op.create_index(op.f('ix_budget_categories_user_id'), 'budget_categories', ['user_id'], unique=False)
    op.create_table('debt_payments',
    sa.Column('debt_id', sa.UUID(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('paid_on', sa.Date(), nullable=False),
    sa.Column('note', sa.String(length=200), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name=op.f('ck_debt_payments_amount_positive')),
    sa.ForeignKeyConstraint(['debt_id'], ['debts.id'], name=op.f('fk_debt_payments_debt_id_debts'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_debt_payments_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_debt_payments'))
    )
    op.create_index(op.f('ix_debt_payments_debt_id'), 'debt_payments', ['debt_id'], unique=False)
    op.create_index(op.f('ix_debt_payments_user_id'), 'debt_payments', ['user_id'], unique=False)
    op.create_table('merchants',
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('normalized_name', sa.String(length=80), nullable=False),
    sa.Column('default_category_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['default_category_id'], ['categories.id'], name=op.f('fk_merchants_default_category_id_categories'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_merchants_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_merchants')),
    sa.UniqueConstraint('user_id', 'normalized_name', name=op.f('uq_merchants_user_id'))
    )
    op.create_index('ix_merchants_name_trgm', 'merchants', ['normalized_name'], unique=False, postgresql_using='gin', postgresql_ops={'normalized_name': 'gin_trgm_ops'})
    op.create_index(op.f('ix_merchants_user_id'), 'merchants', ['user_id'], unique=False)
    op.create_table('savings_goals',
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('emoji', sa.String(length=16), nullable=True),
    sa.Column('target_minor', sa.BigInteger(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('target_date', sa.Date(), nullable=True),
    sa.Column('monthly_contribution_minor', sa.BigInteger(), nullable=True),
    sa.Column('linked_account_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.Enum('active', 'paused', 'completed', 'archived', name='goal_status', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('monthly_contribution_minor IS NULL OR monthly_contribution_minor >= 0', name=op.f('ck_savings_goals_monthly_non_negative')),
    sa.CheckConstraint('target_minor > 0', name=op.f('ck_savings_goals_target_positive')),
    sa.ForeignKeyConstraint(['linked_account_id'], ['accounts.id'], name=op.f('fk_savings_goals_linked_account_id_accounts'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_savings_goals_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_savings_goals'))
    )
    op.create_index(op.f('ix_savings_goals_user_id'), 'savings_goals', ['user_id'], unique=False)
    op.create_table('financial_notes',
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('related_goal_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['related_goal_id'], ['savings_goals.id'], name=op.f('fk_financial_notes_related_goal_id_savings_goals'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_financial_notes_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_financial_notes'))
    )
    op.create_index(op.f('ix_financial_notes_user_id'), 'financial_notes', ['user_id'], unique=False)
    op.create_table('recurring_payments',
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('kind', sa.Enum('bill', 'subscription', 'rent', 'loan', 'insurance', 'income', 'other', name='recurring_kind', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('is_amount_variable', sa.Boolean(), nullable=False),
    sa.Column('frequency', sa.Enum('weekly', 'biweekly', 'semi_monthly', 'monthly', 'quarterly', 'yearly', name='recurring_frequency', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('interval_count', sa.Integer(), nullable=False),
    sa.Column('next_due_on', sa.Date(), nullable=False),
    sa.Column('end_on', sa.Date(), nullable=True),
    sa.Column('account_id', sa.UUID(), nullable=True),
    sa.Column('category_id', sa.UUID(), nullable=True),
    sa.Column('merchant_id', sa.UUID(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name=op.f('ck_recurring_payments_amount_positive')),
    sa.CheckConstraint('interval_count >= 1', name=op.f('ck_recurring_payments_interval_positive')),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], name=op.f('fk_recurring_payments_account_id_accounts'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('fk_recurring_payments_category_id_categories'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['merchant_id'], ['merchants.id'], name=op.f('fk_recurring_payments_merchant_id_merchants'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_recurring_payments_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recurring_payments'))
    )
    op.create_index(op.f('ix_recurring_payments_user_id'), 'recurring_payments', ['user_id'], unique=False)
    op.create_table('transactions',
    sa.Column('type', sa.Enum('income', 'expense', 'transfer', name='transaction_type', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('occurred_on', sa.Date(), nullable=False),
    sa.Column('account_id', sa.UUID(), nullable=False),
    sa.Column('to_account_id', sa.UUID(), nullable=True),
    sa.Column('merchant_id', sa.UUID(), nullable=True),
    sa.Column('category_id', sa.UUID(), nullable=True),
    sa.Column('subcategory_id', sa.UUID(), nullable=True),
    sa.Column('payment_method', sa.String(length=40), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('source', sa.Enum('manual', 'natural_language', 'receipt', 'recurring', 'seed', name='transaction_source', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('recurring_payment_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(type = 'transfer') = (to_account_id IS NOT NULL)", name=op.f('ck_transactions_transfer_destination')),
    sa.CheckConstraint('amount_minor > 0', name=op.f('ck_transactions_amount_positive')),
    sa.CheckConstraint('to_account_id IS NULL OR to_account_id <> account_id', name=op.f('ck_transactions_transfer_distinct')),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], name=op.f('fk_transactions_account_id_accounts')),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('fk_transactions_category_id_categories'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['merchant_id'], ['merchants.id'], name=op.f('fk_transactions_merchant_id_merchants'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['recurring_payment_id'], ['recurring_payments.id'], name=op.f('fk_transactions_recurring_payment_id_recurring_payments'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['subcategory_id'], ['categories.id'], name=op.f('fk_transactions_subcategory_id_categories'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['to_account_id'], ['accounts.id'], name=op.f('fk_transactions_to_account_id_accounts')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_transactions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_transactions'))
    )
    op.create_index(op.f('ix_transactions_merchant_id'), 'transactions', ['merchant_id'], unique=False)
    op.create_index('ix_transactions_user_account_date', 'transactions', ['user_id', 'account_id', 'occurred_on'], unique=False)
    op.create_index('ix_transactions_user_category_date', 'transactions', ['user_id', 'category_id', 'occurred_on'], unique=False)
    op.create_index('ix_transactions_user_date', 'transactions', ['user_id', 'occurred_on'], unique=False)
    op.create_index(op.f('ix_transactions_user_id'), 'transactions', ['user_id'], unique=False)
    op.create_table('goal_contributions',
    sa.Column('goal_id', sa.UUID(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('occurred_on', sa.Date(), nullable=False),
    sa.Column('transaction_id', sa.UUID(), nullable=True),
    sa.Column('note', sa.String(length=200), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor <> 0', name=op.f('ck_goal_contributions_amount_nonzero')),
    sa.ForeignKeyConstraint(['goal_id'], ['savings_goals.id'], name=op.f('fk_goal_contributions_goal_id_savings_goals'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], name=op.f('fk_goal_contributions_transaction_id_transactions'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_goal_contributions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_goal_contributions'))
    )
    op.create_index(op.f('ix_goal_contributions_goal_id'), 'goal_contributions', ['goal_id'], unique=False)
    op.create_index(op.f('ix_goal_contributions_user_id'), 'goal_contributions', ['user_id'], unique=False)
    op.create_table('receipts',
    sa.Column('storage_key', sa.String(length=255), nullable=True),
    sa.Column('mime_type', sa.String(length=40), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('status', sa.Enum('processing', 'needs_review', 'confirmed', 'failed', 'unavailable', 'discarded', name='receipt_status', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('provider', sa.String(length=40), nullable=True),
    sa.Column('extraction', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('validation_issues', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('error', sa.String(length=300), nullable=True),
    sa.Column('transaction_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], name=op.f('fk_receipts_transaction_id_transactions'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_receipts_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_receipts'))
    )
    op.create_index(op.f('ix_receipts_sha256'), 'receipts', ['sha256'], unique=False)
    op.create_index(op.f('ix_receipts_user_id'), 'receipts', ['user_id'], unique=False)
    op.create_table('transaction_items',
    sa.Column('transaction_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=10, scale=3), nullable=False),
    sa.Column('unit_amount_minor', sa.BigInteger(), nullable=True),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.CheckConstraint('amount_minor >= 0', name=op.f('ck_transaction_items_amount_non_negative')),
    sa.CheckConstraint('quantity > 0', name=op.f('ck_transaction_items_quantity_positive')),
    sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], name=op.f('fk_transaction_items_transaction_id_transactions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_transaction_items_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_transaction_items'))
    )
    op.create_index('ix_transaction_items_name_trgm', 'transaction_items', ['name'], unique=False, postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.create_index(op.f('ix_transaction_items_transaction_id'), 'transaction_items', ['transaction_id'], unique=False)
    op.create_index(op.f('ix_transaction_items_user_id'), 'transaction_items', ['user_id'], unique=False)
    op.create_table('transaction_tags',
    sa.Column('transaction_id', sa.UUID(), nullable=False),
    sa.Column('tag_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], name=op.f('fk_transaction_tags_tag_id_tags'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], name=op.f('fk_transaction_tags_transaction_id_transactions'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('transaction_id', 'tag_id', name=op.f('pk_transaction_tags'))
    )

    for table in USER_SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_owner ON {table} "
            "USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) "
            "WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)"
        )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faldo_app') THEN
            GRANT USAGE ON SCHEMA public TO faldo_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO faldo_app;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO faldo_app;
          END IF;
        END $$;
        """
    )

def downgrade() -> None:
    for table in USER_SCOPED_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_owner ON {table}")
    op.drop_table('transaction_tags')
    op.drop_index(op.f('ix_transaction_items_user_id'), table_name='transaction_items')
    op.drop_index(op.f('ix_transaction_items_transaction_id'), table_name='transaction_items')
    op.drop_index('ix_transaction_items_name_trgm', table_name='transaction_items', postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.drop_table('transaction_items')
    op.drop_index(op.f('ix_receipts_user_id'), table_name='receipts')
    op.drop_index(op.f('ix_receipts_sha256'), table_name='receipts')
    op.drop_table('receipts')
    op.drop_index(op.f('ix_goal_contributions_user_id'), table_name='goal_contributions')
    op.drop_index(op.f('ix_goal_contributions_goal_id'), table_name='goal_contributions')
    op.drop_table('goal_contributions')
    op.drop_index(op.f('ix_transactions_user_id'), table_name='transactions')
    op.drop_index('ix_transactions_user_date', table_name='transactions')
    op.drop_index('ix_transactions_user_category_date', table_name='transactions')
    op.drop_index('ix_transactions_user_account_date', table_name='transactions')
    op.drop_index(op.f('ix_transactions_merchant_id'), table_name='transactions')
    op.drop_table('transactions')
    op.drop_index(op.f('ix_recurring_payments_user_id'), table_name='recurring_payments')
    op.drop_table('recurring_payments')
    op.drop_index(op.f('ix_financial_notes_user_id'), table_name='financial_notes')
    op.drop_table('financial_notes')
    op.drop_index(op.f('ix_savings_goals_user_id'), table_name='savings_goals')
    op.drop_table('savings_goals')
    op.drop_index(op.f('ix_merchants_user_id'), table_name='merchants')
    op.drop_index('ix_merchants_name_trgm', table_name='merchants', postgresql_using='gin', postgresql_ops={'normalized_name': 'gin_trgm_ops'})
    op.drop_table('merchants')
    op.drop_index(op.f('ix_debt_payments_user_id'), table_name='debt_payments')
    op.drop_index(op.f('ix_debt_payments_debt_id'), table_name='debt_payments')
    op.drop_table('debt_payments')
    op.drop_index(op.f('ix_budget_categories_user_id'), table_name='budget_categories')
    op.drop_index(op.f('ix_budget_categories_budget_id'), table_name='budget_categories')
    op.drop_table('budget_categories')
    op.drop_index(op.f('ix_ai_messages_user_id'), table_name='ai_messages')
    op.drop_index(op.f('ix_ai_messages_conversation_id'), table_name='ai_messages')
    op.drop_table('ai_messages')
    op.drop_table('user_settings')
    op.drop_index(op.f('ix_tags_user_id'), table_name='tags')
    op.drop_table('tags')
    op.drop_index(op.f('ix_sessions_user_id'), table_name='sessions')
    op.drop_table('sessions')
    op.drop_index('ix_jobs_status_run_after', table_name='jobs')
    op.drop_table('jobs')
    op.drop_index('ix_embeddings_user_type_date', table_name='embeddings')
    op.drop_index(op.f('ix_embeddings_user_id'), table_name='embeddings')
    op.drop_index('ix_embeddings_search_tsv', table_name='embeddings', postgresql_using='gin')
    op.drop_index('ix_embeddings_content_trgm', table_name='embeddings', postgresql_using='gin', postgresql_ops={'content': 'gin_trgm_ops'})
    op.drop_table('embeddings')
    op.drop_index(op.f('ix_debts_user_id'), table_name='debts')
    op.drop_table('debts')
    op.drop_index(op.f('ix_categories_user_id'), table_name='categories')
    op.drop_index(op.f('ix_categories_parent_id'), table_name='categories')
    op.drop_table('categories')
    op.drop_index(op.f('ix_budgets_user_id'), table_name='budgets')
    op.drop_table('budgets')
    op.drop_index(op.f('ix_ai_insights_user_id'), table_name='ai_insights')
    op.drop_table('ai_insights')
    op.drop_index(op.f('ix_ai_conversations_user_id'), table_name='ai_conversations')
    op.drop_table('ai_conversations')
    op.drop_index(op.f('ix_accounts_user_id'), table_name='accounts')
    op.drop_table('accounts')
    op.drop_table('users')
