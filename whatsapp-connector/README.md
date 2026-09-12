# WhatsApp Baileys Connector Service

Persistent Node.js service for WhatsApp Web connection using Baileys library.

## Architecture

```
┌─────────────────┐
│   Frontend      │  (React)
│   (React)       │
└────────┬────────┘
         │ WebSocket
         │
┌────────▼────────┐
│  Connector      │  (Node.js + Baileys)
│  Service        │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Supabase│  (session storage, message queue)
    └─────────┘
```

## Features

- Persistent WhatsApp connection (not limited by Edge Function timeouts)
- Session persistence in Supabase
- QR code streaming via WebSocket
- Message queue integration
- Auto-reconnect on disconnect

## Environment Variables

```bash
WHATSAPP_CONNECTOR_PORT=3001
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
WHATSAPP_ENCRYPTION_KEY=<32-byte-hex-key>
```

## Installation

```bash
cd whatsapp-connector
npm install
node server.mjs
```

## API Endpoints

### GET /health
Health check.

### GET /status/:connectionId
Get connection status.

### POST /connect/:connectionId
Start WhatsApp connection.

Body:
```json
{
  "businessId": "uuid",
  "wabaId": "uuid",
  "phoneNumberId": "string",
  "accessToken": "string",
  "displayPhoneNumber": "+62..."
}
```

### POST /disconnect/:connectionId
Disconnect WhatsApp.

### POST /send-message/:connectionId
Send a WhatsApp message.

Body:
```json
{
  "to": "6281234567890@c.us",
  "message": "Hello"
}
```

## WebSocket Messages

### qrcode
```json
{
  "type": "qrcode",
  "data": { "qrcode": "data:image/png;base64,..." }
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
  "data": { "message": "error description" }
}
```
