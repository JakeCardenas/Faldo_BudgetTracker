import logging
import re
from typing import Any

# Secrets and personal details that must never reach a log line, a traceback included.
_REDACT_PATTERNS = [
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=\-]{8,}"), "Bearer [redacted]"),
    (re.compile(r"\b(sk-(?:ant-|proj-)?[A-Za-z0-9_\-]{8,})"), "[redacted-key]"),
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{20,}"), "[redacted-key]"),
    (re.compile(r"\bgsk_[A-Za-z0-9]{16,}"), "[redacted-key]"),
    (re.compile(r"\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{8,}"), "[redacted-key]"),
    (re.compile(r"\bGOCSPX-[A-Za-z0-9_\-]{10,}"), "[redacted-key]"),
    (re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]*"), "[redacted-token]"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S), "[redacted-private-key]"),
    (re.compile(r"([a-z][a-z0-9+.\-]*://[^:/\s@]+:)[^@\s/]+@", re.I), r"\1[redacted]@"),
    (re.compile(r"(?i)(password|passwd|token|secret|api_key|apikey|faldo_session)(\"?\s*[=:]\s*\"?)([^&\s\"',;]+)"),
     r"\1\2[redacted]"),
    (re.compile(r"(?i)/(reset-password|verify-email)/[A-Za-z0-9_\-]+"), r"/\1/[redacted]"),
    # Values the database driver or Postgres echo back in errors (hide_parameters only covers SQLAlchemy's own part).
    (re.compile(r"(invalid input for query argument \$\d+:\s*).*?(\s+\(|$)", re.M), r"\1[redacted]\2"),
    (re.compile(r"(\binvalid\b[^'\"\n]{0,80}?)(['\"])(?:(?!\2).)*\2"), r"\1\2[redacted]\2"),
    (re.compile(r"(Key \([^)]*\)=\().*?(\)( already exists| is not present|\.))"), r"\1[redacted]\2"),
    (re.compile(r"(Failing row contains \().*(\)\.?)$", re.M), r"\1[redacted]\2"),
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


class RedactingFormatter(logging.Formatter):
    """Redacts the finished line, so exception text and tracebacks (which the filter can't reach) are cleaned too."""

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def configure_logging(level: str = "INFO", **_: Any) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(RedactingFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    # Uvicorn's own loggers keep their handlers (and formatters) when run locally; clean what they print as well.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        server_logger = logging.getLogger(name)
        server_logger.addFilter(RedactingFilter())
        for server_handler in server_logger.handlers:
            if server_handler.formatter is not None and not isinstance(server_handler.formatter, _Redacted):
                server_handler.setFormatter(_Redacted(server_handler.formatter))


class _Redacted(logging.Formatter):
    """Another formatter's output, redacted: keeps uvicorn's own formats (which need their own fields) working."""

    def __init__(self, inner: logging.Formatter):
        super().__init__()
        self.inner = inner

    def format(self, record: logging.LogRecord) -> str:
        return redact(self.inner.format(record))
