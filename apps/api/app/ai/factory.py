from functools import lru_cache

from app.ai.providers.base import EmbeddingProvider, LLMProvider
from app.ai.providers.local_embeddings import LocalHashEmbeddings
from app.core.config import get_settings


@lru_cache
def get_llm() -> LLMProvider:
    settings = get_settings()
    if settings.resolved_ai_provider == "openai":
        from app.ai.providers.openai_provider import OpenAIProvider

        return OpenAIProvider(settings)
    from app.ai.providers.local_provider import LocalDevelopmentProvider

    return LocalDevelopmentProvider()


@lru_cache
def get_embeddings() -> EmbeddingProvider:
    settings = get_settings()
    if settings.resolved_ai_provider == "openai":
        from app.ai.providers.openai_provider import OpenAIEmbeddings

        return OpenAIEmbeddings(settings)
    return LocalHashEmbeddings()
