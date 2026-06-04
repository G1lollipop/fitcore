FROM python:3.11-slim

WORKDIR /app

# chromadb 编译需要 build-essential
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 层缓存（依赖不变时不重新安装）
COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

# 复制源码（排除 .dockerignore 里的内容）
COPY . .

ENV PYTHONUNBUFFERED=1
ENV RERANKER_ENABLED=false
ENV VECTOR_BACKEND=supabase

EXPOSE 10000

# Render 通过 $PORT 动态分配端口，本地默认回落到 8000
CMD ["sh", "-c", "uvicorn backend_api:app --host 0.0.0.0 --port ${PORT:-8000}"]
