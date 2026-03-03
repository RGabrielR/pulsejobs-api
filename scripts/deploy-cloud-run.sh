#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pulsejobs-api}"
PORT="${PORT:-3001}"
CPU="${CPU:-1}"
MEMORY="${MEMORY:-512Mi}"
TIMEOUT="${TIMEOUT:-120}"
CONCURRENCY="${CONCURRENCY:-80}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"
JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-86400}"
DATABASE_URL="${DATABASE_URL:-}"
JWT_SECRET="${JWT_SECRET:-}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-}"

if [[ -z "$PROJECT_ID" || -z "$DATABASE_URL" || -z "$JWT_SECRET" ]]; then
  cat <<'USAGE'
Usage (bash):
  PROJECT_ID="my-gcp-project" \
  DATABASE_URL="postgresql://..." \
  JWT_SECRET="your-secret" \
  ./scripts/deploy-cloud-run.sh

Optional env vars:
  REGION SERVICE PORT CPU MEMORY TIMEOUT CONCURRENCY MIN_INSTANCES MAX_INSTANCES JWT_EXPIRES_IN RUNTIME_SERVICE_ACCOUNT
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

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ -z "$RUNTIME_SERVICE_ACCOUNT" ]]; then
  RUNTIME_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

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

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

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
  --cpu-throttling \
  --no-cpu-boost \
  --clear-base-image \
  --set-env-vars "NODE_ENV=production,JWT_EXPIRES_IN=$JWT_EXPIRES_IN" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest" \
  --service-account "$RUNTIME_SERVICE_ACCOUNT"

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "Done. Service URL: $SERVICE_URL"
