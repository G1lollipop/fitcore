FROM python:3.11-slim

WORKDIR /app

# build-essential is required to compile chromadb
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy the dependency file first to leverage Docker layer caching (skip reinstall when deps are unchanged)
COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

# Copy the source code (excluding what's in .dockerignore)
COPY . .

ENV PYTHONUNBUFFERED=1
ENV RERANKER_ENABLED=false
ENV VECTOR_BACKEND=supabase

EXPOSE 10000

# Render assigns the port dynamically via $PORT; locally it falls back to 8000
CMD ["sh", "-c", "uvicorn backend_api:app --host 0.0.0.0 --port ${PORT:-8000}"]
