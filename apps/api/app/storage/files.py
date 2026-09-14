import uuid
from pathlib import Path
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import StoredFile


class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, mime_type: str) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Invalid storage key")
        return path

    async def put(self, key: str, data: bytes, mime_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    async def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class DatabaseStorage:
    def __init__(self, db: AsyncSession, user_id: uuid.UUID):
        self.db = db
        self.user_id = user_id

    async def put(self, key: str, data: bytes, mime_type: str) -> None:
        stmt = insert(StoredFile).values(key=key, user_id=self.user_id, mime_type=mime_type, size_bytes=len(data), content=data)
        await self.db.execute(stmt.on_conflict_do_update(index_elements=["key"], set_={"content": data, "size_bytes": len(data)}))

    async def get(self, key: str) -> bytes:
        content = await self.db.scalar(select(StoredFile.content).where(StoredFile.key == key, StoredFile.user_id == self.user_id))
        if content is None:
            raise FileNotFoundError(key)
        return content

    async def delete(self, key: str) -> None:
        await self.db.execute(delete(StoredFile).where(StoredFile.key == key, StoredFile.user_id == self.user_id))


def receipt_key(user_id: uuid.UUID, receipt_id: uuid.UUID, extension: str) -> str:
    return f"receipts/{user_id}/{receipt_id}.{extension}"


def get_storage(db: AsyncSession, user_id: uuid.UUID) -> ObjectStorage:
    settings = get_settings()
    if settings.storage_backend == "database":
        return DatabaseStorage(db, user_id)
    return LocalStorage(settings.receipt_storage_dir)
