"""Which address a request came from, for rate limits. Only headers a caller can't forge are believed.

- A caller-sent X-Forwarded-For is never trusted on its own. On Vercel (TRUST_PROXY_HEADERS, on there by default) the
  platform overwrites X-Forwarded-For and sets X-Vercel-Forwarded-For with the address that connected, and doesn't pass
  on outside values (https://vercel.com/docs/headers/request-headers), so those are safe to read there. Anywhere else,
  including local runs, forwarding headers are ignored.
- Requests that come through the web app's /api rewrite reach the API from Vercel's own network, so the address above
  would be Vercel's, shared by everyone. The web proxy (apps/web/src/proxy.ts) therefore passes the visitor's address in
  X-Faldo-Client-IP together with PROXY_SHARED_SECRET, and the API only believes that header when the secret matches.
  Someone calling the API directly can't produce the secret.
"""

import hmac
import ipaddress

from fastapi import Request

from app.core.config import get_settings

FORWARDED_IP = "x-faldo-client-ip"
PROXY_AUTH = "x-faldo-proxy-auth"


def _ip(value: str) -> str | None:
    value = value.split(",")[0].strip()
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def client_ip(request: Request) -> str:
    settings = get_settings()
    secret = settings.proxy_shared_secret.get_secret_value() if settings.proxy_shared_secret else ""
    if secret:
        given = request.headers.get(PROXY_AUTH, "")
        forwarded = _ip(request.headers.get(FORWARDED_IP, ""))
        if forwarded and given and hmac.compare_digest(given.encode(), secret.encode()):
            return forwarded
    if settings.trust_proxy_headers:
        for header in ("x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"):
            found = _ip(request.headers.get(header, ""))
            if found:
                return found
    return request.client.host if request.client else "unknown"
