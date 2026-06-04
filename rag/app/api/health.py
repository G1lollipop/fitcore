from fastapi import APIRouter

router = APIRouter()


@router.get("/v1/health")
async def health_check_v1():
    return {"status": "healthy"}


@router.get("/api/health")
async def health_check():
    return await health_check_v1()
