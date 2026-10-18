# Care Call server for Railway: Python API + the Node Photon bridge in one container.
# Build from the repo root:  docker build -f server/Dockerfile -t carecall .
# On Railway set RAILWAY_DOCKERFILE_PATH=server/Dockerfile and mount a volume at /data.

# Stage 1: install the Photon bridge (spectrum-ts is TypeScript only).
FROM node:20-slim AS bridge
WORKDIR /bridge
COPY server/photon-bridge/package.json server/photon-bridge/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/photon-bridge/src src

# Stage 2: Python server, plus the node binary and bridge from stage 1.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    DB_PATH=/data/carecall.db \
    TTS_CACHE_DIR=/data/tts-cache

COPY --from=bridge /usr/local/bin/node /usr/local/bin/node
COPY --from=bridge /bridge server/photon-bridge

COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

# Copy code explicitly so a local .venv or .env can never end up in the image.
COPY server/*.py server/start.sh server/
COPY server/routes server/routes
COPY server/integrations server/integrations
COPY benchmark benchmark

CMD ["sh", "server/start.sh"]
