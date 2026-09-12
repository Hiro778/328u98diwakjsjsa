#!/bin/bash
# apply_loyalty_migration.sh — Apply 019_loyalty_program.sql to Supabase via Direct API / CLI
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

SUPABASE_URL="${VITE_SUPABASE_URL}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SUPABASE_URL" ]; then
  echo "ERROR: VITE_SUPABASE_URL missing from .env"
  exit 1
fi

MIGRATION_FILE="${SCRIPT_DIR}/migrations/019_loyalty_program.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "ERROR: Migration file 019_loyalty_program.sql not found at $MIGRATION_FILE"
  exit 1
fi

echo "=================================================="
echo "APPLYING MIGRATION: 019_loyalty_program.sql"
echo "Target URL: $SUPABASE_URL"
echo "=================================================="

SQL_CONTENT=$(cat "$MIGRATION_FILE")

if [ -n "$SERVICE_KEY" ]; then
  echo "Found SERVICE_KEY, attempting PostgREST / SQL endpoint execution..."
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${SUPABASE_URL}/sql" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$SQL_CONTENT" | jq -Rs .)}" 2>&1)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  echo "Response Status: $HTTP_CODE"
  echo "Response Body: $BODY"

  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    echo "SUCCESS: Migration applied via SQL endpoint!"
    exit 0
  fi
fi

echo ""
echo "Direct execution skipped/failed. Manual application instructions:"
echo "1. Go to your Supabase Dashboard: https://supabase.com/dashboard"
echo "2. Select your project"
echo "3. Go to SQL Editor"
echo "4. Open/Paste the contents of: supabase/migrations/019_loyalty_program.sql"
echo "5. Click 'Run' to apply the migration"
echo "6. Run 'node verify_loyalty.mjs' to confirm the tables exist"
