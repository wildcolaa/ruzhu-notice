#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f frontend/dist/index.html ]; then
  echo '未找到构建产物。请先按 README 构建前端。'
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import fastapi, uvicorn, httpx, dotenv' >/dev/null 2>&1; then
  .venv/bin/python -m pip install -r requirements.txt
fi
PORT="${PORT:-8765}"
HOST="${HOST:-127.0.0.1}"
echo "入住须知已启动：http://$HOST:$PORT"
echo '无 API Key 时将自动进入可通关的模拟模式。按 Ctrl+C 停止。'
exec .venv/bin/python -m uvicorn backend.app:app --host "$HOST" --port "$PORT"
