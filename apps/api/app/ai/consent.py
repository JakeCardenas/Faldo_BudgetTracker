"""Which outside AI services this Faldo sends data to, what they say they do with it, and each person's choice.

Nothing personal goes to an outside service until the person allows it for the services configured right now. If the
configuration later adds a service they didn't see, they're asked again. Until they allow it, or if they decline,
Faldo uses its own rules: basic chat answers, rules-only reading of typed entries, manual receipt entry and template
summaries. The choice is enforced here on the server, not only in the app.

The data-use statements quote each provider's own published terms (checked 2026-09-30, links in `source`); they are
facts to show people, not legal advice, and should be re-checked when a provider changes its terms.
"""

from typing import Any

from app.core.config import Settings, get_settings
from app.models.identity import UserSettings

PROVIDERS: dict[str, dict[str, str]] = {
    "gemini": {"name": "Google Gemini API", "company": "Google", "source": "https://ai.google.dev/gemini-api/terms"},
    "groq": {"name": "GroqCloud", "company": "Groq", "source": "https://console.groq.com/docs/your-data"},
    "anthropic": {"name": "Anthropic Claude API", "company": "Anthropic",
                  "source": "https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data"},
    "openai": {"name": "OpenAI API", "company": "OpenAI", "source": "https://platform.openai.com/docs/guides/your-data"},
}

GEMINI_FREE = ("On Gemini's free tier, Google uses what's sent and its answers to provide, improve and develop its "
               "products, and human reviewers may read them. Google asks that sensitive or personal information not be "
               "sent to its free tier.")
GEMINI_PAID = ("On Gemini's paid tier, Google doesn't use prompts or answers to improve its products; it keeps them for a "
               "limited time to detect abuse.")
DATA_USE = {
    "groq": "Groq says it doesn't keep what's sent for answering by default, except when needed to investigate "
            "failures or abuse.",
    "anthropic": "Anthropic says it deletes what's sent and its answers within 30 days, with exceptions such as enforcing "
                 "its usage policy or when the law requires.",
    "openai": "OpenAI says it keeps abuse-monitoring logs, which can include what's sent and its answers, for up to 30 "
              "days by default.",
}
WHAT_IS_SENT = ("Your message, a summary of your money (balances, account names, this month's spending, budgets, bills "
                "due and goals), what you asked Faldo to remember, short notes on earlier chats, and any photo or receipt "
                "you send.")


def external_providers(settings: Settings | None = None) -> list[str]:
    """Outside services this server may send data to, in the order it would use them."""
    return [name for name in (settings or get_settings()).ai_provider_chain if name != "local"]


def describe(settings: Settings | None = None) -> list[dict[str, str]]:
    settings = settings or get_settings()
    out = []
    for name in external_providers(settings):
        info = PROVIDERS.get(name, {"name": name, "company": name, "source": ""})
        use = (GEMINI_PAID if settings.gemini_paid_tier else GEMINI_FREE) if name == "gemini" else DATA_USE.get(name, "")
        out.append({"id": name, "name": info["name"], "company": info["company"], "data_use": use, "source": info["source"]})
    return out


def allows_external(user_settings: UserSettings, settings: Settings | None = None) -> bool:
    """The person allowed every outside service configured right now."""
    current = external_providers(settings)
    if not current or user_settings.ai_consent != "allowed":
        return False
    return set(current) <= set(user_settings.ai_consent_providers or [])


def needs_choice(user_settings: UserSettings, settings: Settings | None = None) -> bool:
    """Ask before anything is sent: there's an outside service they haven't said yes or no to."""
    current = external_providers(settings)
    if not current:
        return False
    if user_settings.ai_consent == "declined":
        return False
    return not allows_external(user_settings, settings)


def summary(user_settings: UserSettings) -> dict[str, Any]:
    return {"providers": describe(), "consent": user_settings.ai_consent, "needs_consent": needs_choice(user_settings),
            "allowed": allows_external(user_settings), "sends": WHAT_IS_SENT}


def permits(user_settings: UserSettings, provider: Any) -> bool:
    """Whether this provider may be sent this person's data: Faldo's own rules always, an outside service only if
    they allowed that service. Every place that calls a model checks this first."""
    if provider.is_development:
        return True
    return user_settings.ai_consent == "allowed" and provider.name in (user_settings.ai_consent_providers or [])


DECLINED_PHOTOS = ("You haven't allowed Faldo to send photos to an outside AI service, so it can't read this one. Your "
                   "image is saved; fill in the details below. You can change this in Settings, Your data.")
