import json
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Query, Response, UploadFile

from app.api.deps import CtxDep
from app.core.rate_limit import limiter
from app.services import backup

router = APIRouter(tags=["backup"])


async def _read(file: UploadFile) -> bytes:
    return await file.read(backup.MAX_BACKUP_BYTES + 1)


@router.get("/me/backup")
async def download_backup(ctx: CtxDep, receipts: Annotated[bool, Query()] = True) -> Response:
    payload = await backup.build_backup(ctx.db, ctx.user_id, ctx.currency, include_receipts=receipts)
    name = f"faldo-backup-{ctx.today.isoformat()}.json"
    return Response(json.dumps(payload, separators=(",", ":")), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/me/backup/preview")
async def preview_backup(ctx: CtxDep, file: Annotated[UploadFile, File()]) -> dict[str, Any]:
    await limiter.hit(f"backup-preview:{ctx.user_id}", 30, 3600)
    return await backup.preview_restore(ctx.db, ctx.user_id, ctx.currency, await _read(file))


@router.post("/me/backup/restore")
async def restore_backup(ctx: CtxDep, file: Annotated[UploadFile, File()],
                         confirm_sha256: Annotated[str, Form(min_length=64, max_length=64)]) -> dict[str, Any]:
    await limiter.hit(f"backup-restore:{ctx.user_id}", 10, 3600)
    return await backup.restore(ctx.db, ctx.user_id, ctx.currency, await _read(file), confirm_sha256)
