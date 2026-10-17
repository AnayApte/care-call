# Care Call server for Railway. Build from the repo root:
#   docker build -f server/Dockerfile -t carecall .
# On Railway set RAILWAY_DOCKERFILE_PATH=server/Dockerfile and mount a volume at /data.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    DB_PATH=/data/carecall.db

COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

# Copy code explicitly so a local .venv or .env can never end up in the image.
COPY server/*.py server/
COPY server/routes server/routes
COPY server/integrations server/integrations
COPY benchmark benchmark

# Railway provides PORT. SEED_DEMO=true refreshes Maria's synthetic sessions on boot.
CMD mkdir -p "$(dirname "$DB_PATH")" \
    && if [ "$SEED_DEMO" = "true" ]; then python3 -m server.seed; fi \
    && exec python3 -m uvicorn server.main:app --host 0.0.0.0 --port "${PORT:-8000}"
