import re
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.factory import get_embeddings
from app.models import MemoryDocument

RRF_K = 60
CANDIDATES = 40
MIN_VECTOR_SIMILARITY = {"local-hash-v1": 0.22}
DEFAULT_MIN_SIMILARITY = 0.30
MIN_TRIGRAM = 0.6


@dataclass
class MemoryHit:
    document_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    content: str
    occurred_on: date | None
    amount_minor: int | None
    provenance: str
    metadata: dict[str, Any]
    score: float
    similarity: float | None
    lexical: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "entity_id": str(self.entity_id),
            "content": self.content,
            "date": self.occurred_on.isoformat() if self.occurred_on else None,
            "amount_minor": self.amount_minor,
            "provenance": self.provenance,
            "metadata": self.metadata,
            "score": round(self.score, 4),
            "similarity": round(self.similarity, 3) if self.similarity is not None else None,
            "matched_keywords": self.lexical,
        }


async def search_memory(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    *,
    entity_types: list[str] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category_ids: list[uuid.UUID] | None = None,
    account_ids: list[uuid.UUID] | None = None,
    include_generated: bool = False,
    limit: int = 10,
) -> list[MemoryHit]:
    query = query.strip()[:300]
    if not query:
        return []
    embeddings = get_embeddings()
    [vector] = await embeddings.embed([query])

    filters = [MemoryDocument.user_id == user_id, MemoryDocument.embedding_model == embeddings.model]
    if entity_types:
        filters.append(MemoryDocument.entity_type.in_(entity_types))
    if date_from:
        filters.append(MemoryDocument.occurred_on >= date_from)
    if date_to:
        filters.append(MemoryDocument.occurred_on <= date_to)
    if category_ids:
        filters.append(MemoryDocument.category_id.in_(category_ids))
    if account_ids:
        filters.append(MemoryDocument.account_id.in_(account_ids))
    if not include_generated:
        filters.append(MemoryDocument.provenance != "generated")

    distance = MemoryDocument.embedding.cosine_distance(vector)
    vector_rows = (
        await db.execute(select(MemoryDocument.id, (1 - distance).label("similarity")).where(*filters)
                         .order_by(distance).limit(CANDIDATES))
    ).all()

    tsquery = func.websearch_to_tsquery("simple", query)
    fts_rank = func.ts_rank_cd(MemoryDocument.search_tsv, tsquery)
    fts_rows = (
        await db.execute(select(MemoryDocument.id, fts_rank.label("rank")).where(*filters, MemoryDocument.search_tsv.op("@@")(tsquery))
                         .order_by(fts_rank.desc()).limit(CANDIDATES))
    ).all()

    or_query = func.to_tsquery("simple", literal(" | ".join(f"{t}:*" for t in _tokens(query))))
    or_rank = func.ts_rank_cd(MemoryDocument.search_tsv, or_query)
    or_rows = (
        await db.execute(select(MemoryDocument.id, or_rank.label("rank")).where(*filters, MemoryDocument.search_tsv.op("@@")(or_query))
                         .order_by(or_rank.desc()).limit(CANDIDATES))
    ).all() if _tokens(query) else []

    cleaned = " ".join(_tokens(query))
    trigram = func.word_similarity(cleaned, func.lower(MemoryDocument.content))
    trigram_rows = (
        await db.execute(select(MemoryDocument.id, trigram.label("sim")).where(*filters, trigram >= MIN_TRIGRAM)
                         .order_by(trigram.desc()).limit(20))
    ).all() if cleaned else []

    threshold = MIN_VECTOR_SIMILARITY.get(embeddings.model, DEFAULT_MIN_SIMILARITY)
    scores: dict[uuid.UUID, float] = {}
    similarity: dict[uuid.UUID, float] = {}
    lexical: set[uuid.UUID] = set()
    for rank, row in enumerate(vector_rows):
        similarity[row.id] = float(row.similarity)
        scores[row.id] = scores.get(row.id, 0) + 1 / (RRF_K + rank + 1)
    for rows in (fts_rows, or_rows, trigram_rows):
        for rank, row in enumerate(rows):
            lexical.add(row.id)
            scores[row.id] = scores.get(row.id, 0) + 1 / (RRF_K + rank + 1)

    eligible = [doc_id for doc_id in scores if doc_id in lexical or similarity.get(doc_id, 0) >= threshold]
    eligible.sort(key=lambda doc_id: scores[doc_id], reverse=True)
    top = eligible[:limit]
    if not top:
        return []
    docs = {d.id: d for d in (await db.execute(select(MemoryDocument).where(MemoryDocument.user_id == user_id,
                                                                            MemoryDocument.id.in_(top)))).scalars()}
    return [
        MemoryHit(
            document_id=doc_id, entity_type=docs[doc_id].entity_type, entity_id=docs[doc_id].entity_id,
            content=docs[doc_id].content, occurred_on=docs[doc_id].occurred_on, amount_minor=docs[doc_id].amount_minor,
            provenance=docs[doc_id].provenance, metadata=docs[doc_id].doc_metadata, score=scores[doc_id],
            similarity=similarity.get(doc_id), lexical=doc_id in lexical,
        )
        for doc_id in top if doc_id in docs
    ]


STOPWORDS = {
    "how", "much", "did", "i", "spend", "spent", "on", "the", "a", "an", "my", "this", "that", "year", "month", "for",
    "what", "when", "where", "is", "are", "was", "were", "have", "has", "been", "to", "of", "in", "at", "and", "or",
    "me", "do", "does", "all", "any", "about", "last", "week", "so", "far", "total", "buy", "bought", "can", "you",
}


def _tokens(text: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 2 and w not in STOPWORDS]
    out: list[str] = []
    for w in words:
        out.append(w)
        if w.endswith("s") and len(w) > 3:
            out.append(w[:-1])
    return list(dict.fromkeys(out))[:12]
