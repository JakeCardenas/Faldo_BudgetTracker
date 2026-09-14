import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("faldo.email")


async def send_email(to: str, subject: str, text: str, html: str) -> bool:
    settings = get_settings()
    if settings.resolved_email_provider == "log":
        if settings.environment != "production":
            print(f"[faldo] Email delivery is not configured. Development copy:\n{subject}\n{text}", flush=True)
        else:
            logger.warning("Email delivery is not configured; message '%s' was not sent.", subject)
        return False
    assert settings.resend_api_key is not None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key.get_secret_value()}"},
                json={"from": settings.email_from, "to": [to], "subject": subject, "text": text, "html": html},
            )
        if response.status_code >= 400:
            logger.warning("Email provider rejected message with status %s", response.status_code)
            return False
        return True
    except httpx.HTTPError as exc:
        logger.warning("Email delivery failed: %s", exc.__class__.__name__)
        return False
