# WhatsApp Baileys Connector Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  WhatsAppOperasionalPage.jsx → WhatsAppService.js (WebSocket)   │
└─────────────────────────────────────────────────────────────────┘
                                             │
                                             │ WebSocket
                                             │
┌─────────────────────────────────────────────────────────────────┐
│                   WhatsApp Connector Service                    │
│                  Node.js + Baileys v6.x                         │
│  - Persistent WhatsApp connection                               │
│  - QR code generation                                           │
│  - Message queue processing                                     │
│  - Session persistence in Supabase                              │
└─────────────────────────────────────────────────────────────────┘
                                             │
                                             │ Supabase
                                             │
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase DB                             │
│  - whatsapp_business_connections (session credentials)          │
│  - whatsapp_message_queue (incoming messages)                   │
│  - whatsapp_webhook_logs (audit trail)                          │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Node.js 18+** installed on your server
2. **Supabase project** with WhatsApp database schema applied
3. **Supabase Service Role Key** (for database access)

## Installation Steps

### 1. Create Connector Directory

```bash
cd /path/to/umkm
mkdir -p whatsapp-connector
cd whatsapp-connector
```

### 2. Initialize Project

```bash
npm init -y
npm install @whiskeysockets/baileys express ws
```

### 3. Create Environment File

Create `whatsapp-connector/.env`:

```bash
# Supabase Configuration
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>

# Encryption Key (32-byte hex for AES-256-GCM)
WHATSAPP_ENCRYPTION_KEY=<openssl rand -hex 32>

# Server Configuration
WHATSAPP_CONNECTOR_PORT=3001
```

### 4. Run the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
node server.mjs
```

### 5. Update Frontend Environment

Update `.env` in your project root:

```bash
VITE_WHATSAPP_CONNECTOR_URL=http://localhost:3001
```

For production, use your server URL:

```bash
VITE_WHATSAPP_CONNECTOR_URL=https://whatsapp.yourdomain.com
```

## Usage Flow

### Connecting WhatsApp

1. User clicks "Hubungkan WhatsApp" button
2. Frontend calls `initiateConnection({ businessId, wabaId, ... })`
3. Connector service creates new Baileys socket
4. QR code is generated and sent to frontend via WebSocket
5. User scans QR with WhatsApp: WhatsApp → Perangkat Tertaut → Tautkan Perangkat
6. Socket connects, status updates to "connected"
7. Session persisted in Supabase

### Disconnecting

1. User clicks "Putuskan" button
2. Frontend calls `disconnectConnection(connectionId)`
3. Connector service calls socket.logout()
4. Status updated to "disconnected"

### Receiving Messages

1. WhatsApp sends message to Baileys socket
2. Socket event handler receives message
3. Message inserted into `whatsapp_message_queue`
4. Message processor claims and processes job
5. Optional: Auto-reply sent via `sendMessage()`

## API Endpoints

### GET /health
Health check.

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"whatsapp-connector"}
```

### GET /status/:connectionId
Get connection status.

```bash
curl http://localhost:3001/status/abc-123
# {"status":"connected","connected":true,"phoneNumber":"+62..."}
```

### POST /connect/:connectionId
Start connection (triggers QR generation).

```bash
curl -X POST http://localhost:3001/connect/abc-123 \
  -H "Content-Type: application/json" \
  -d '{"businessId":"abc-123","wabaId":"abc-123","phoneNumberId":"1","accessToken":"token","displayPhoneNumber":"+62..."}'
```

### POST /disconnect/:connectionId
Disconnect.

```bash
curl -X POST http://localhost:3001/disconnect/abc-123
# {"success":true}
```

### POST /send-message/:connectionId
Send a message.

```bash
curl -X POST http://localhost:3001/send-message/abc-123 \
  -H "Content-Type: application/json" \
  -d '{"to":"6281234567890","message":"Hello"}'
```

## WebSocket Events

### qrcode
```json
{
  "type": "qrcode",
  "data": { "qrcode": "data:image/png;base64,iVBORw0KGgo..." }
}
```

### status
```json
{
  "type": "status",
  "data": { "status": "connected" }
}
```

### error
```json
{
  "type": "error",
  "data": { "message": "Connection failed" }
}
```

## Production Deployment

### Option 1: Render.com (Recommended)

1. Create new Web Service
2. Connect repository (umkm)
3. Set build command: `cd whatsapp-connector && npm install`
4. Set start command: `cd whatsapp-connector && node server.mjs`
5. Add environment variables in Render dashboard
6. Enable auto-deploy

### Option 2: Railway.app

1. Create new Project
2. Add PostgreSQL database
3. Add new Service → Deploy from GitHub
4. Set Environment Variables:
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   - WHATSAPP_ENCRYPTION_KEY
5. Railway will auto-deploy

### Option 3: VPS (DigitalOcean, AWS, etc.)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt-get install -y nodejs

# Clone repo
cd /opt
git clone <your-repo> whatsapp-connector

# Install dependencies
cd whatsapp-connector
npm install

# Create systemd service
sudo tee /etc/systemd/system/whatsapp-connector.service <<EOF
[Unit]
Description=WhatsApp Baileys Connector Service
After=network.target

[Service]
Type=simple
User=whatsapp
WorkingDirectory=/opt/whatsapp-connector
ExecStart=/usr/bin/node server.mjs
Environment=SUPABASE_URL=https://<project-ref>.supabase.co
Environment=SUPABASE_SERVICE_KEY=<service-key>
Environment=WHATSAPP_ENCRYPTION_KEY=<encryption-key>
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-connector
sudo systemctl start whatsapp-connector
```

## Database Schema

### whatsapp_business_connections

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Connection ID (same as business_id) |
| business_id | uuid | Owner business |
| status | text | disconnected/connecting/qr/connected/error |
| phone_number_id | text | WhatsApp Phone Number ID |
| display_phone_number | text | Display phone number |
| whatsapp_business_id | text | WhatsApp Business Account ID |
| waba_id | text | WhatsApp Business Account ID |
| app_id | text | Meta App ID |
| access_token_encrypted | text | Encrypted access token |
| connected_at | timestamptz | Connection established time |
| disconnected_at | timestamptz | Disconnection time |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update |

### whatsapp_message_queue

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Job ID |
| business_id | uuid | Owner business |
| whatsapp_message_id | text | Unique message ID (deduplication) |
| sender_phone | text | Sender's phone number |
| message_text | text | Message content |
| payload | jsonb | Full message payload |
| status | text | queued/processing/completed/retrying/failed |
| attempts | integer | Retry attempts |
| created_at | timestamptz | Queued timestamp |

## Monitoring

### Check Service Status

```bash
curl http://localhost:3001/health
```

### View Logs

```bash
# If running in foreground
# Logs appear in console

# If running as systemd
sudo journalctl -u whatsapp-connector -f
```

### Check Database Connections

```sql
SELECT * FROM whatsapp_business_connections WHERE status = 'connected';
SELECT COUNT(*) FROM whatsapp_message_queue WHERE status = 'queued';
```

## Troubleshooting

### QR Code Not Showing

1. Check connector is running: `curl http://localhost:3001/health`
2. Check browser console for WebSocket errors
3. Verify VITE_WHATSAPP_CONNECTOR_URL is correct

### Connection Drops

1. Check network connectivity to Supabase
2. Verify SUPABASE_SERVICE_KEY is correct
3. Baileys auto-reconnects every 5 seconds on disconnect

### Messages Not Processing

1. Check `whatsapp_message_queue` table for queued messages
2. Verify `claim_whatsapp_job` function exists in database
3. Check connector logs for processing errors

### Session Lost on Server Restart

1. Sessions are persisted in Supabase
2. Baileys will reconnect automatically using stored credentials
3. QR code not needed if credentials exist

## Migration from Meta Cloud API

Existing Meta Edge Functions remain for backward compatibility:
- `whatsapp-connect` - Returns connector URL info
- `whatsapp-status` - Falls back to connector service
- `whatsapp-disconnect` - Tries connector first, then Edge Function

Frontend auto-detects connector availability and uses appropriate method.
