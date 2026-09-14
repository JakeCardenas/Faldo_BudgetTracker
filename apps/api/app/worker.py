import asyncio

from app.core.logging import configure_logging
from app.jobs.worker import run_forever


def main() -> None:
    configure_logging()
    asyncio.run(run_forever())


if __name__ == "__main__":
    main()
