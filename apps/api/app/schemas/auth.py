import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import EmailStr, Field, StringConstraints

from app.models.enums import Frequency
from app.schemas.common import ApiModel, CurrencyCode, Money, OutModel

Password = Annotated[str, StringConstraints(min_length=10, max_length=128)]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,39}$")]


class RegisterIn(ApiModel):
    email: EmailStr
    password: Password
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class LoginIn(ApiModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class SettingsOut(OutModel):
    currency: str
    timezone: str
    pay_frequency: Frequency | None
    pay_days: list[int]
    monthly_income_minor: int | None
    safe_to_spend_buffer_minor: int
    default_account_id: uuid.UUID | None
    onboarding_completed_at: datetime | None
    theme: str
    mascot_outfit: str
    home_background: str
    quick_actions: list[str]
    completed_lessons: list[str]


class SettingsUpdate(ApiModel):
    currency: CurrencyCode | None = None
    timezone: Annotated[str, StringConstraints(max_length=64)] | None = None
    pay_frequency: Frequency | None = None
    pay_days: list[Annotated[int, Field(ge=1, le=31)]] | None = Field(default=None, max_length=4)
    monthly_income_minor: Money | None = None
    safe_to_spend_buffer_minor: Money | None = None
    default_account_id: uuid.UUID | None = None
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    theme: Literal["system", "light", "dark"] | None = None
    mascot_outfit: Slug | None = None
    home_background: Slug | None = None
    quick_actions: list[Slug] | None = Field(default=None, max_length=12)
    completed_lessons: list[Slug] | None = Field(default=None, max_length=100)


class MeOut(OutModel):
    id: uuid.UUID
    email: str
    display_name: str
    settings: SettingsOut
    ai_provider: str


class ForgotPasswordIn(ApiModel):
    email: EmailStr


class ResetPasswordIn(ApiModel):
    token: Annotated[str, StringConstraints(min_length=20, max_length=200)]
    password: Password


class ChangePasswordIn(ApiModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Password


class SessionOut(OutModel):
    id: str
    created_at: datetime
    last_seen_at: datetime
    user_agent: str | None
    current: bool
