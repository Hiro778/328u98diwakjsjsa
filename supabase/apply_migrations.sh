#!/bin/bash
# apply_migrations.sh — Apply missing migrations to Supabase via Management API
# Run: bash supabase/apply_migrations.sh

set -euo pipefail

# Load credentials from .env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE"
  exit 1
fi

# Source .env safely
set -a
source "$ENV_FILE"
set +a

SUPABASE_URL="${VITE_SUPABASE_URL}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "ERROR: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env"
  exit 1
fi

PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | sed 's|\.supabase\.co||')
echo "Project: $PROJECT_REF"
echo "URL: $SUPABASE_URL"

# Function to run SQL via PostgREST RPC
run_sql() {
  local sql="$1"
  local label="$2"
  echo ""
  echo ">>> $label"
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$sql" | jq -Rs .)}" 2>&1)
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  echo "HTTP $HTTP_CODE: $BODY"
}

# Try using supabase SQL endpoint directly
run_sql_direct() {
  local sql="$1"
  local label="$2"
  echo ""
  echo ">>> $label"
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${SUPABASE_URL}/sql" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$sql" | jq -Rs .)}" 2>&1)
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  echo "HTTP $HTTP_CODE: $BODY"
}

echo ""
echo "=== STEP 1: Check current schema ==="

run_sql_direct "SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'notes'" "Check products.notes"

run_sql_direct "SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'maximum_stock'" "Check inventory.maximum_stock"

run_sql_direct "SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'supplier_id'" "Check inventory.supplier_id"

run_sql_direct "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'adjust_stock')" "Check adjust_stock RPC"

run_sql_direct "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_movements')" "Check stock_movements table"

echo ""
echo "=== STEP 2: Apply migration 025 (products.notes) ==="

run_sql_direct "ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes text DEFAULT ''" "Migration 025: Add notes to products"

echo ""
echo "=== STEP 3: Verify final schema ==="

run_sql_direct "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'products' AND column_name IN ('notes', 'is_active', 'cost_price', 'unit_price') ORDER BY column_name" "Final products schema"

run_sql_direct "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'inventory' AND column_name IN ('quantity', 'min_stock', 'maximum_stock', 'supplier_id', 'location') ORDER BY column_name" "Final inventory schema"

run_sql_direct "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'adjust_stock') as rpc_exists, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_movements') as movements_table" "Final checks"

echo ""
echo "=== DONE ==="
