#!/bin/sh
# Container entrypoint. Railway provides PORT.
set -e
mkdir -p "$(dirname "${DB_PATH:-/data/carecall.db}")"

# SEED_DEMO=true refreshes Maria's synthetic sessions on boot (real data is kept).
if [ "$SEED_DEMO" = "true" ]; then python3 -m server.seed; fi

# Pre-generate the bedside phrases in the background (cached, so only the first boot calls ElevenLabs).
if [ -n "$ELEVENLABS_API_KEY" ]; then python3 -m server.tts & fi

# Photon bridge, only when Photon is on. Restarts itself if it crashes.
if [ "$ENABLE_PHOTON" = "true" ]; then
  (cd server/photon-bridge && while true; do
     node node_modules/tsx/dist/cli.mjs src/index.ts || echo "[bridge] exited, restarting in 3 s"
     sleep 3
   done) &
fi

exec python3 -m uvicorn server.main:app --host 0.0.0.0 --port "${PORT:-8000}"
