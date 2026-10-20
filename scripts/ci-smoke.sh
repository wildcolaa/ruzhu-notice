#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# CI uses a disposable database and no real API key.
export GROQ_API_KEY=''
export DATABASE_PATH="${RUNNER_TEMP:-/tmp}/ruzhu-ci-$$.sqlite3"
GAME_PORT="${GAME_PORT:-8765}"
export GAME_URL="http://127.0.0.1:$GAME_PORT"
python -m uvicorn backend.app:app --host 127.0.0.1 --port "$GAME_PORT" --log-level error &
game_pid=$!
trap 'kill "$game_pid" 2>/dev/null || true; rm -f "$DATABASE_PATH" "$DATABASE_PATH-wal" "$DATABASE_PATH-shm"' EXIT
python - <<'PY'
import os, time, httpx
for attempt in range(40):
    try:
        response = httpx.get(os.environ['GAME_URL']+'/api/health', timeout=1)
        response.raise_for_status()
        assert response.json()['mode'] == 'simulation'
        break
    except httpx.TransportError:
        time.sleep(.25)
else:
    raise SystemExit('Game service did not become ready')
PY
python scripts/smoke.py
