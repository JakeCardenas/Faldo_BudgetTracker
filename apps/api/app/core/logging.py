import logging
import re
from typing import Any

_REDACT_PATTERNS = [
    (re.compile(r"(?i)(sk-[a-z0-9_\-]{8,})"), "[redacted-key]"),
    (re.compile(r"(?i)(password|token|secret)=([^&\s]+)"), r"\1=[redacted]"),
    (re.compile(r"(?i)/reset-password/[A-Za-z0-9_\-]+"), "/reset-password/[redacted]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[redacted-email]"),
]


def redact(value: str) -> str:
    for pattern, replacement in _REDACT_PATTERNS:
        value = pattern.sub(replacement, value)
    return value


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(redact(a) if isinstance(a, str) else a for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: redact(v) if isinstance(v, str) else v for k, v in record.args.items()}
        return True


def configure_logging(level: str = "INFO", **_: Any) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    logging.getLogger("uvicorn.access").addFilter(RedactingFilter())
