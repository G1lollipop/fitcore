from fastapi import APIRouter

from app.core.settings import get_settings

router = APIRouter()


@router.get("/v1/health")
async def health_check_v1():
    return {"status": "healthy"}


@router.get("/api/health")
async def health_check():
    return await health_check_v1()


@router.get("/v1/health/ready")
async def readiness_check():
    """Readiness probe: distinct from liveness.

    Confirms settings load and reports the configured vector backend so an
    orchestrator can tell a booted-but-misconfigured instance from a ready one.
    Kept dependency-free (no network calls) so the probe stays fast and cheap.
    """
    settings = get_settings()
    return {
        "status": "ready",
        "vector_backend": settings.vector_backend,
    }
