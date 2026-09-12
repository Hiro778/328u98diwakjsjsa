#!/bin/bash
# Deploy midtrans-create-snap Edge Function
# Run this script with: bash midtrans-deploy.sh

set -e

echo "Deploying midtrans-create-snap function..."

# Get the project ref from config
PROJECT_REF=$(cat supabase/config.toml | grep id | sed 's/.*= *//')

# Get the service role key from .env
SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d'=' -f2)

if [ -z "$PROJECT_REF" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "ERROR: Missing PROJECT_REF or SERVICE_ROLE_KEY"
  exit 1
fi

echo "Project: $PROJECT_REF"
echo "Deploying function..."

# Read function code
FUNCTION_CODE=$(cat supabase/functions/midtrans-create-snap/index.ts)

# Deploy using curl
curl -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/deploy" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"${FUNCTION_CODE}\", \"slug\": \"midtrans-create-snap\"}"

echo ""
echo "Deployment complete."

# Test the function
echo ""
echo "Testing function..."
curl -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/midtrans-create-snap" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"order_id": "test-order-id"}'

echo ""
