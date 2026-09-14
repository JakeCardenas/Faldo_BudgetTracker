import hashlib
import math
import re

from app.models.ai import EMBEDDING_DIMENSIONS

_TOKEN_RE = re.compile(r"[a-z0-9]+")

DOMAIN_LEXICON: dict[str, list[str]] = {
    "shoes": ["footwear", "sneakers", "rubber shoes"],
    "sneakers": ["shoes", "footwear"],
    "coffee": ["cafe", "latte", "americano", "kape"],
    "food": ["meal", "restaurant", "dining", "eat"],
    "groceries": ["supermarket", "grocery", "market"],
    "transport": ["commute", "ride", "fare", "transportation"],
    "grab": ["ride", "transport"],
    "electricity": ["meralco", "power", "bill"],
    "internet": ["wifi", "broadband", "pldt", "globe"],
    "subscription": ["subscriptions", "monthly", "streaming"],
    "phone": ["mobile", "smartphone", "gadget"],
    "laptop": ["macbook", "computer", "notebook"],
    "clothes": ["clothing", "shirt", "apparel"],
    "medicine": ["pharmacy", "drugstore", "health"],
    "gift": ["gifts", "present", "birthday"],
    "trip": ["travel", "vacation"],
}


def _bucket(feature: str, dims: int) -> tuple[int, float]:
    digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
    value = int.from_bytes(digest, "big")
    return value % dims, 1.0 if (value >> 63) & 1 else -1.0


def _features(text: str) -> list[tuple[str, float]]:
    tokens = _TOKEN_RE.findall(text.lower())
    features: list[tuple[str, float]] = []
    for token in tokens:
        if len(token) <= 1:
            continue
        stem = token[:-1] if token.endswith("s") and len(token) > 3 else token
        features.append((f"w:{stem}", 1.0))
        for synonym in DOMAIN_LEXICON.get(token, []) + DOMAIN_LEXICON.get(stem, []):
            for part in _TOKEN_RE.findall(synonym):
                features.append((f"w:{part[:-1] if part.endswith('s') and len(part) > 3 else part}", 0.6))
        padded = f"#{stem}#"
        for i in range(len(padded) - 2):
            features.append((f"c:{padded[i:i + 3]}", 0.25))
    return features


class LocalHashEmbeddings:
    name = "local"
    model = "local-hash-v1"
    dimensions = EMBEDDING_DIMENSIONS

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_one(t) for t in texts]

    def embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        for feature, weight in _features(text):
            index, sign = _bucket(feature, self.dimensions)
            vector[index] += sign * weight
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]
