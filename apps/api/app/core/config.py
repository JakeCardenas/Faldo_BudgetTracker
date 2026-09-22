import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import Field, SecretStr, computed_field, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ON_VERCEL = bool(os.environ.get("VERCEL"))


def _origin(value: str) -> str:
    value = value.strip().strip("'\"").strip()
    if "://" not in value:
        value = f"https://{value}"
    scheme, rest = value.split("://", 1)
    return f"{scheme.lower()}://{rest.split('/', 1)[0].lower()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore", env_ignore_empty=True)

    environment: Literal["development", "test", "production"] = "production" if ON_VERCEL else "development"

    database_url: str = "postgresql+asyncpg://faldo_app:faldo_app@localhost:5432/faldo"
    migration_database_url: str | None = None if ON_VERCEL else "postgresql+asyncpg://faldo:faldo@localhost:5432/faldo"
    db_pool: Literal["queue", "null"] = "null" if ON_VERCEL else "queue"
    db_pgbouncer: bool = False

    public_app_url: str = "http://localhost:3000"
    session_cookie_name: str = "faldo_session"
    session_ttl_days: int = 30
    cookie_secure: bool = ON_VERCEL
    allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])
    trust_proxy_headers: bool = ON_VERCEL

    # "auto" picks Claude when an Anthropic key is set, then OpenAI, then the local development provider.
    ai_provider: Literal["auto", "anthropic", "openai", "local"] = "auto"
    anthropic_api_key: SecretStr | None = None
    anthropic_chat_model: str = "claude-sonnet-5"
    anthropic_fast_model: str = "claude-haiku-4-5-20251001"
    anthropic_vision_model: str = "claude-sonnet-5"
    openai_api_key: SecretStr | None = None
    openai_chat_model: str = "gpt-5-mini"
    openai_fast_model: str = "gpt-5-nano"
    openai_vision_model: str = "gpt-5-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    storage_backend: Literal["local", "database"] = "database" if ON_VERCEL else "local"
    receipt_storage_dir: Path = Path("var/receipts")
    receipt_max_bytes: int = 8 * 1024 * 1024

    job_mode: Literal["worker", "inline"] = "inline" if ON_VERCEL else "worker"
    run_worker_in_api: bool = True
    worker_poll_seconds: float = 1.0
    inline_job_limit: int = 25
    cron_secret: SecretStr | None = None

    rate_limit_backend: Literal["memory", "database"] = "database" if ON_VERCEL else "memory"
    assistant_messages_per_hour: int = 60
    capture_requests_per_hour: int = 120
    receipt_uploads_per_day: int = 40
    login_attempts_per_15_min: int = 10

    email_provider: Literal["auto", "resend", "log"] = "auto"
    resend_api_key: SecretStr | None = None
    email_from: str = "Faldo <no-reply@faldo.app>"
    password_reset_ttl_minutes: int = 30

    @model_validator(mode="before")
    @classmethod
    def split_origins(cls, data: dict) -> dict:
        raw = data.get("allowed_origins") or data.get("ALLOWED_ORIGINS")
        if isinstance(raw, str):
            value = raw.strip()
            if value.startswith("["):
                import json

                parsed = json.loads(value)
            else:
                parsed = [part.strip() for part in value.split(",") if part.strip()]
            data["allowed_origins"] = [_origin(origin) for origin in parsed]
        for key in ("public_app_url", "PUBLIC_APP_URL"):
            if isinstance(data.get(key), str) and data[key].strip():
                data[key] = _origin(data[key])
        return data

    @model_validator(mode="after")
    def production_checks(self) -> Self:
        if self.environment == "production" and self.public_app_url not in self.allowed_origins:
            self.allowed_origins = [*self.allowed_origins, self.public_app_url]
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_ai_provider(self) -> Literal["anthropic", "openai", "local"]:
        if self.ai_provider == "auto":
            if self.anthropic_api_key and self.anthropic_api_key.get_secret_value():
                return "anthropic"
            return "openai" if self.openai_api_key and self.openai_api_key.get_secret_value() else "local"
        return self.ai_provider

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_embedding_provider(self) -> Literal["openai", "local"]:
        """Anthropic has no embeddings, so search uses OpenAI's when a key is set and local hashing otherwise."""
        if self.ai_provider == "local":
            return "local"
        return "openai" if self.openai_api_key and self.openai_api_key.get_secret_value() else "local"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_email_provider(self) -> Literal["resend", "log"]:
        if self.email_provider == "auto":
            return "resend" if self.resend_api_key and self.resend_api_key.get_secret_value() else "log"
        return self.email_provider

    @property
    def effective_migration_url(self) -> str:
        return self.migration_database_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
