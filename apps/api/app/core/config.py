import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import Field, SecretStr, computed_field, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ON_VERCEL = bool(os.environ.get("VERCEL"))


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

    ai_provider: Literal["auto", "openai", "local"] = "auto"
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
            data["allowed_origins"] = [origin.rstrip("/") for origin in parsed]
        return data

    @model_validator(mode="after")
    def production_checks(self) -> Self:
        if self.environment == "production" and self.public_app_url.rstrip("/") not in self.allowed_origins:
            self.allowed_origins = [*self.allowed_origins, self.public_app_url.rstrip("/")]
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_ai_provider(self) -> Literal["openai", "local"]:
        if self.ai_provider == "auto":
            return "openai" if self.openai_api_key and self.openai_api_key.get_secret_value() else "local"
        return self.ai_provider

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
