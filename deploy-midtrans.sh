#!/bin/bash
# Deploy midtrans-create-snap Edge Function to Supabase
# Usage: SUPABASE_SERVICE_ROLE_KEY="..." bash deploy-midtrans.sh

set -e

PROJECT_REF="ttdevvrzmdquvaewxzhh"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
FUNCTION_NAME="midtrans-create-snap"

echo "Deploying $FUNCTION_NAME to Supabase..."
echo "Project: $PROJECT_REF"

FUNCTION_CODE=$(cat "supabase/functions/midtrans-create-snap/index.ts")

echo "Uploading function code..."
RESPONSE=$(curl -s -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/deploy" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"slug\":\"${FUNCTION_NAME}\",\"code\":\"${FUNCTION_CODE}\"}")

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "error"; then
  echo "Deployment failed!"
  exit 1
fi

echo "Deployment successful!"

echo ""
echo "Testing function..."
TEST_RESPONSE=$(curl -s -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"01f30690-7d48-4077-9c8b-0df4b64f09c6"}')

echo "Test Response: $TEST_RESPONSE"
