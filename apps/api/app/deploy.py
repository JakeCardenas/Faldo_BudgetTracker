import os
import subprocess
import sys
from urllib.parse import urlsplit

from app.core.db import pasted_url


def outline(url: str) -> str:
    """Where an address points, without its password, so the build log shows which database it reached for."""
    try:
        parts = urlsplit(pasted_url(url))
        return f"{parts.scheme}://{parts.username or '?'}:•••@{parts.hostname or '?'}:{parts.port or 5432}{parts.path}"
    except ValueError:
        return "(not a database address)"


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
