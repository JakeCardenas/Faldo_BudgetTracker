import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.dialects.postgresql import ARRAY, CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPk, str_enum
from app.models.enums import Frequency


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(80))
    # When this account proved it controls its email: an emailed link opened while signed in, a password reset, or a
    # Google or Apple sign-in with that verified address. Null means whoever registered it may not own the inbox.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OAuthIdentity(UUIDPk, Timestamps, Base):
    """A Google or Apple account that signs in as this user: the service's own id for the person (`subject`), which
    stays the same when they change their email there. Looked up before anyone is signed in, like users."""

    __tablename__ = "oauth_identities"
    __table_args__ = (UniqueConstraint("provider", "subject"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(CITEXT)


class UserSettings(Timestamps, Base):
    __tablename__ = "user_settings"
    __table_args__ = (CheckConstraint("ai_consent IN ('unset', 'allowed', 'declined')", name="ai_consent_choice"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    currency: Mapped[str] = mapped_column(String(3), default="PHP", server_default="PHP")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Manila", server_default="Asia/Manila")
    pay_frequency: Mapped[Frequency | None] = mapped_column(str_enum(Frequency, "pay_frequency"))
    pay_days: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list, server_default="{}")
    monthly_income_minor: Mapped[int | None] = mapped_column(BigInteger)
    safe_to_spend_buffer_minor: Mapped[int] = mapped_column(BigInteger, default=100_000, server_default="100000")
    default_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL", use_alter=True)
    )
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    theme: Mapped[str] = mapped_column(String(10), default="system", server_default="system")
    mascot_outfit: Mapped[str] = mapped_column(String(40), default="classic", server_default="classic")
    quick_actions: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    completed_lessons: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    # Sending data to an outside AI service (see ai/consent.py): unset until the person chooses; which services they
    # allowed, so a newly configured one asks again.
    ai_consent: Mapped[str] = mapped_column(String(10), default="unset", server_default="unset")
    ai_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_consent_providers: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")


class Session(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "Remember me" was ticked: a lasting cookie and a long idle window, rather than one that ends with the browser.
    remember: Mapped[bool] = mapped_column(Boolean, server_default=true(), default=True)
    # When this session last proved who it is (signing in, or re-entering the password): sensitive actions need it recent.
    reauthenticated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
