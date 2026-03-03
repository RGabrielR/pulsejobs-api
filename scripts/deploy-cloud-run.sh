#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pulsejobs-api}"
PORT="${PORT:-3001}"
CPU="${CPU:-1}"
MEMORY="${MEMORY:-1Gi}"
TIMEOUT="${TIMEOUT:-900}"
CONCURRENCY="${CONCURRENCY:-10}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-86400}"
DATABASE_URL="${DATABASE_URL:-}"
JWT_SECRET="${JWT_SECRET:-}"

if [[ -z "$PROJECT_ID" || -z "$DATABASE_URL" || -z "$JWT_SECRET" ]]; then
  cat <<'USAGE'
Usage (bash):
  PROJECT_ID="my-gcp-project" \
  DATABASE_URL="postgresql://..." \
  JWT_SECRET="your-secret" \
  ./scripts/deploy-cloud-run.sh

Optional env vars:
  REGION SERVICE PORT CPU MEMORY TIMEOUT CONCURRENCY MIN_INSTANCES MAX_INSTANCES JWT_EXPIRES_IN
USAGE
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID" >/dev/null

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com >/dev/null

upsert_secret() {
  local name="$1"
  local value="$2"

  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- >/dev/null
  fi
}

upsert_secret "DATABASE_URL" "$DATABASE_URL"
upsert_secret "JWT_SECRET" "$JWT_SECRET"

echo "Deploying $SERVICE to Cloud Run ($REGION)..."
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --execution-environment gen2 \
  --port "$PORT" \
  --cpu "$CPU" \
  --memory "$MEMORY" \
  --timeout "$TIMEOUT" \
  --concurrency "$CONCURRENCY" \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --no-cpu-throttling \
  --set-env-vars "NODE_ENV=production,PORT=$PORT,JWT_EXPIRES_IN=$JWT_EXPIRES_IN" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest" \
  --command npm \
  --args run,start:prod

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "Done. Service URL: $SERVICE_URL"