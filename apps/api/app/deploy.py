import os
import subprocess
import sys


def main() -> None:
    if os.environ.get("RUN_MIGRATIONS_ON_BUILD", "true").lower() not in {"1", "true", "yes"}:
        print("Skipping database migrations.")
        return
    if not (os.environ.get("MIGRATION_DATABASE_URL") or os.environ.get("DATABASE_URL")):
        print("DATABASE_URL is not set; skipping database migrations.")
        return
    print("Running database migrations…")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)


if __name__ == "__main__":
    main()
