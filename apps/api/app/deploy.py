import os
import re
import subprocess
import sys
from urllib.parse import urlsplit

from app.core.db import pasted_url


def outline(url: str) -> str:
    """Where an address points, never its password or anything that isn't clearly an address, for the build log."""
    text = pasted_url(url)
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError:
        parts, port = None, None
    if not (parts and parts.scheme.startswith("postgres") and parts.hostname and "://" in text):
        return f"not a database address: {len(text)} characters that don't start with postgresql:// (value not shown)"
    database = parts.path if re.fullmatch(r"/[\w.-]*", parts.path or "/") else "/…"
    return f"{parts.scheme}://{parts.username or '?'}:•••@{parts.hostname}:{port or 5432}{database}"


def main() -> None:
    if os.environ.get("RUN_MIGRATIONS_ON_BUILD", "true").lower() not in {"1", "true", "yes"}:
        print("Skipping database migrations.")
        return
    name = "MIGRATION_DATABASE_URL" if os.environ.get("MIGRATION_DATABASE_URL") else "DATABASE_URL"
    url = os.environ.get(name, "")
    if not url:
        print("DATABASE_URL is not set; skipping database migrations.")
        return
    print(f"Running database migrations with {name}: {outline(url)}")
    if pasted_url(url) != url:
        print(f"  (its value has extra text around the address, such as the name or quotes; that's ignored, "
              f"but worth tidying in the {name} setting)")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)


if __name__ == "__main__":
    main()
