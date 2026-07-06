#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Starting FitCore dev servers ==="

# --- RAG backend (port 8000) ---
echo "[1/2] Starting RAG service..."
tmux kill-session -t rag-dev-server 2>/dev/null || true
tmux new-session -d -s rag-dev-server \
  "cd '$PROJECT_DIR/rag' && ./.venv/bin/uvicorn backend_api:app --host 0.0.0.0 --port 8000"

# --- Next.js frontend (port 3000) ---
echo "[2/2] Starting Next.js dev server..."
tmux kill-session -t web-dev-server 2>/dev/null || true
tmux new-session -d -s web-dev-server \
  "cd '$PROJECT_DIR/web' && npm run dev"

# --- Wait and verify ---
echo ""
echo "Waiting for servers to start..."
sleep 4

RAG_OK=false
WEB_OK=false

if curl -sf --max-time 3 http://127.0.0.1:8000/v1/health > /dev/null 2>&1; then
  RAG_OK=true
fi

if curl -sf --max-time 3 -o /dev/null http://127.0.0.1:3000 2>&1; then
  WEB_OK=true
fi

echo ""
echo "=== Status ==="
if $RAG_OK; then
  echo "  ✓ RAG service   → http://localhost:8000"
else
  echo "  ✗ RAG service   → not ready (check: tmux attach -t rag-dev-server)"
fi

if $WEB_OK; then
  echo "  ✓ Next.js       → http://localhost:3000"
else
  echo "  ✗ Next.js       → not ready (check: tmux attach -t web-dev-server)"
fi

echo ""
echo "=== Tmux sessions ==="
echo "  rag-dev-server: tmux attach -t rag-dev-server"
echo "  web-dev-server: tmux attach -t web-dev-server"
