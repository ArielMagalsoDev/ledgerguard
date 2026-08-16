"""Lazy Anthropic client. Module-load-time construction would break
`import ledgerguard.main` with no .env present, so the client is built on
first use, not at import time."""

from anthropic import Anthropic

from .config import settings

_client: Anthropic | None = None


def get_anthropic() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings().anthropic_api_key)
    return _client


def llm_enabled() -> bool:
    return bool(settings().anthropic_api_key)
