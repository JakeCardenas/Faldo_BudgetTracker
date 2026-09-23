from functools import lru_cache

from app.ai.providers.base import EmbeddingProvider, LLMProvider
from app.ai.providers.local_embeddings import LocalHashEmbeddings
from app.core.config import get_settings


@lru_cache
def _provider(name: str) -> LLMProvider:
    settings = get_settings()
    if name == "anthropic":
        from app.ai.providers.anthropic_provider import AnthropicProvider

        return AnthropicProvider(settings)
    if name == "gemini":
        from app.ai.providers.compatible_provider import CompatibleProvider

        return CompatibleProvider.gemini(settings)
    if name == "openai":
        from app.ai.providers.openai_provider import OpenAIProvider

        return OpenAIProvider(settings)
    from app.ai.providers.local_provider import LocalDevelopmentProvider

    return LocalDevelopmentProvider()


def _resting(provider: LLMProvider) -> bool:
    """A provider that just refused for a lasting reason (no credits, a bad key, a used-up free limit) sits out a while."""
    check = getattr(provider, "is_resting", None)
    return bool(check and check())


def get_llm() -> LLMProvider:
    """The best provider that's available right now."""
    for name in get_settings().ai_provider_chain:
        provider = _provider(name)
        if not _resting(provider):
            return provider
    return _provider("local")


def next_llm(after: str) -> LLMProvider:
    """The provider to try when `after` fails: the next available one in the chain, ending with the local rules."""
    chain = get_settings().ai_provider_chain
    start = chain.index(after) + 1 if after in chain else 0
    for name in chain[start:]:
        provider = _provider(name)
        if not _resting(provider):
            return provider
    return _provider("local")


@lru_cache
def get_embeddings() -> EmbeddingProvider:
    settings = get_settings()
    if settings.resolved_embedding_provider == "openai":
        from app.ai.providers.openai_provider import OpenAIEmbeddings

        return OpenAIEmbeddings(settings)
    return LocalHashEmbeddings()
