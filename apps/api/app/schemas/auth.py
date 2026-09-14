import uuid
from datetime import datetime
from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints

from app.models.enums import Frequency
from app.schemas.common import ApiModel, CurrencyCode, Money, OutModel

Password = Annotated[str, StringConstraints(min_length=10, max_length=128)]


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


class SettingsUpdate(ApiModel):
    currency: CurrencyCode | None = None
    timezone: Annotated[str, StringConstraints(max_length=64)] | None = None
    pay_frequency: Frequency | None = None
    pay_days: list[Annotated[int, Field(ge=1, le=31)]] | None = Field(default=None, max_length=4)
    monthly_income_minor: Money | None = None
    safe_to_spend_buffer_minor: Money | None = None
    default_account_id: uuid.UUID | None = None
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None


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
