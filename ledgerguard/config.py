import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Single source of truth for the current fictional policy version — fixtures,
# the decision engine, and the architecture page all read this instead of
# repeating the literal string.
POLICY_VERSION = "policy_2026.3"


def _default_database_url() -> str:
    for name in ("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"):
        value = os.environ.get(name)
        if value:
            return value
    return "postgresql+psycopg://ledgerguard:ledgerguard@localhost:5432/ledgerguard"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = Field(default_factory=_default_database_url)
    pdf_storage_dir: str = "data/pdfs"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"
    admin_token: str = "change-me"
    turnstile_secret_key: str = ""
    turnstile_site_key: str = ""
    rate_limit_per_hour: int = 20
    daily_spend_cap_usd: float = 5.0
    estimated_cost_per_invoice_usd: float = 0.02
    upload_sandbox_enabled: bool = False
    session_ttl_minutes: int = 30
    max_upload_bytes: int = 5 * 1024 * 1024
    max_pdf_pages: int = 4
    max_drain_iterations: int = 20
    cron_secret: str = ""
    # Serverless platforms can't run a persistent worker process, so setting
    # this runs the pipeline inline inside the request instead.
    inline_processing: bool = False

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url


@lru_cache
def settings() -> Settings:
    return Settings()
