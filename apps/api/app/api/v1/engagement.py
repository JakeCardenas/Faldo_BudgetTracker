from fastapi import APIRouter

from app.api.deps import CtxDep
from app.services.engagement import engagement

router = APIRouter()


@router.get("/engagement", tags=["engagement"])
async def get_engagement(ctx: CtxDep) -> dict:
    return await engagement(ctx.db, ctx.user_id, ctx.settings, ctx.today)
