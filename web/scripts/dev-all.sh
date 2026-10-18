#!/usr/bin/env bash
# Runs the FastAPI server and the Vite web app together. Ctrl+C stops both.
# Usage (from anywhere): web/scripts/dev-all.sh
# Override ports with API_PORT=8001 WEB_PORT=5174 web/scripts/dev-all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"
VENV="$ROOT/server/.venv"

if [ ! -x "$VENV/bin/python3" ]; then
  echo "[setup] creating server/.venv and installing requirements"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$ROOT/server/requirements.txt"
fi

if [ ! -d "$ROOT/web/node_modules" ]; then
  echo "[setup] installing web dependencies"
  (cd "$ROOT/web" && npm ci)
fi

if [ ! -f "$ROOT/server/.env" ]; then
  echo "[warn] no server/.env; integrations stay off (copy server/.env.example to enable them)"
fi

cleanup() {
  trap - INT TERM EXIT
  echo
  echo "[stop] shutting down"
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Prefix each line so the two logs are easy to tell apart.
(cd "$ROOT" && "$VENV/bin/python3" -m uvicorn server.main:app --reload --reload-dir server --port "$API_PORT" 2>&1 | sed -u 's/^/[api] /') &
(cd "$ROOT/web" && VITE_API_BASE="http://localhost:$API_PORT" npx vite --port "$WEB_PORT" --strictPort 2>&1 | sed -u 's/^/[web] /') &

echo "[ready] API  http://localhost:$API_PORT/docs"
echo "[ready] Web  http://localhost:$WEB_PORT/patient  /caregiver  /beacon"

# Exit (and stop the other one) as soon as either process dies.
wait -n 2>/dev/null || wait
