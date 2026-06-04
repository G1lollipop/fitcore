"""
Compatibility shim — `backend_api:app` is still the entry point referenced by
the Dockerfile CMD. The real FastAPI app now lives in `app/main.py`.
"""
from app.main import app  # noqa: F401  (re-exported for uvicorn)
