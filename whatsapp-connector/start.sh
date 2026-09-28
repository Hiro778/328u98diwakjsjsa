#!/bin/bash
cd "$(dirname "$0")"

# Generate encryption key if not set
if [ -z "$WHATSAPP_ENCRYPTION_KEY" ]; then
  export WHATSAPP_ENCRYPTION_KEY=$(openssl rand -hex 32)
fi

export SUPABASE_URL="${SUPABASE_URL:-https://ttdevvrzmdquvaewxzhh.supabase.co}"
export SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "ERROR: SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable is required"
  exit 1
fi

echo "[start.sh] Starting WhatsApp Baileys Connector..."
echo "[start.sh] SUPABASE_URL=$SUPABASE_URL"
echo "[start.sh] WHATSAPP_ENCRYPTION_KEY=${WHATSAPP_ENCRYPTION_KEY:0:8}..."
echo "[start.sh] Port: ${WHATSAPP_CONNECTOR_PORT:-3001}"

exec node server.mjs
