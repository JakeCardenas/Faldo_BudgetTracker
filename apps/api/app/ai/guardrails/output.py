import re

_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK_RE = re.compile(r"\[([^\]]+)\]\((?:https?:|mailto:|javascript:|data:)[^)]*\)", re.IGNORECASE)
_URL_RE = re.compile(r"\bhttps?://\S+", re.IGNORECASE)
_HTML_RE = re.compile(r"<[^>]+>")

ADVICE_PATTERNS = [
    re.compile(r"\b(buy|sell|invest in)\s+(stocks?|shares|crypto|bitcoin|ethereum|[A-Z]{2,5}\b)", re.IGNORECASE),
    re.compile(r"\bguaranteed (returns?|profit)\b", re.IGNORECASE),
]

ADVICE_NOTE = (
    "For decisions about specific investments, loans, or insurance products, consider talking to a licensed "
    "financial professional."
)


def sanitize_markdown(text: str) -> str:
    text = _IMAGE_RE.sub("", text)
    text = _LINK_RE.sub(r"\1", text)
    text = _URL_RE.sub("", text)
    text = _HTML_RE.sub("", text)
    return text.strip()


def needs_advice_note(text: str) -> bool:
    return any(p.search(text) for p in ADVICE_PATTERNS)


def cited_refs(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"\[([tmi]\d{1,3})\]", text)))


def strip_unknown_refs(text: str, known: set[str]) -> str:
    return re.sub(r"\[([tmi]\d{1,3})\]", lambda m: m.group(0) if m.group(1) in known else "", text)
