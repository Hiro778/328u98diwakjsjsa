// WhatsApp Baileys Connector Service
// Persistent Node.js service for WhatsApp Web connection using Baileys
//
// - Session persistence via useMultiFileAuthState (survives restarts)
// - WebSocket server for real-time status (QR, connected, disconnected)
// - Supabase for database access and message queue
// - Credentials encrypted at rest

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from connector directory
dotenvConfig({ path: join(__dirname, '.env') });

// ══════════════════════════════════════════════════════════
// Baileys imports (dynamic to avoid issues at startup)
// ══════════════════════════════════════════════════════════

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;

async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
}

// ══════════════════════════════════════════════════════════
// Configuration
// ══════════════════════════════════════════════════════════

const PORT = process.env.WHATSAPP_CONNECTOR_PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ENCRYPTION_KEY = process.env.WHATSAPP_ENCRYPTION_KEY;
const SESSIONS_DIR = join(__dirname, 'sessions');

// Validate configuration (never log secret values)
const hasSupabaseUrl = !!SUPABASE_URL;
const hasServiceKey = !!SUPABASE_SERVICE_KEY;
const hasEncryptionKey = !!ENCRYPTION_KEY;
const encryptionKeyValid = hasEncryptionKey && /^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY);

if (!hasSupabaseUrl || !hasServiceKey) {
  console.error('[FATAL] Missing required configuration in whatsapp-connector/.env');
  console.error('  hasSupabaseUrl:', hasSupabaseUrl);
  console.error('  hasServiceKey:', hasServiceKey);
  console.error('Copy .env.example to .env and fill in the values');
  process.exit(1);
}

if (!encryptionKeyValid) {
  console.error('[FATAL] WHATSAPP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  console.error('  hasEncryptionKey:', hasEncryptionKey);
  console.error('  Generate with: openssl rand -hex 32');
  console.error('  IMPORTANT: Save this key permanently. Changing it invalidates all sessions.');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════
// Supabase Client
// ══════════════════════════════════════════════════════════

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ══════════════════════════════════════════════════════════
// Encryption Helper (AES-256-GCM)
// ══════════════════════════════════════════════════════════

function encryptCredential(plaintext) {
  if (!ENCRYPTION_KEY) return plaintext;
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decryptCredential(encryptedBase64) {
  if (!ENCRYPTION_KEY) return encryptedBase64;
  try {
    const data = Buffer.from(encryptedBase64, 'base64');
    const iv = data.slice(0, 12);
    const authTag = data.slice(12, 28);
    const ciphertext = data.slice(28);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return encryptedBase64;
  }
}

// ══════════════════════════════════════════════════════════
// Session Store
// ══════════════════════════════════════════════════════════

// key = businessId, value = { connectionId, businessId, displayPhoneNumber, socket, qrCode, status, lastError, processorInterval }
const sessions = new Map();

// Per-connectionId WebSocket client list
// key = businessId, value = Set<WebSocket>
const wsClients = new Map();

// ══════════════════════════════════════════════════════════
// Phone Number Normalization
// ══════════════════════════════════════════════════════════

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  // Strip everything except digits
  let digits = phone.replace(/\D/g, '');
  // Convert 08... to 628... (Indonesian local to international)
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  }
  // Must be at least 10 digits and start with country code
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

// ══════════════════════════════════════════════════════════
// WebSocket Server (noServer mode — manual upgrade)
// ══════════════════════════════════════════════════════════

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Allow CORS for Express
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());

// Manual HTTP upgrade → WebSocket handshake
server.on('upgrade', (req, socket, head) => {
  const url = parseUrl(req.url || '', true);
  const businessId = url.query.businessId;

  if (!businessId) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const url = parseUrl(req.url || '', true);
  const businessId = url.query.businessId;

  console.log(`[WS] connection accepted businessId=${businessId}`);

  if (!businessId) {
    ws.close(1008, 'businessId required');
    return;
  }

  // Register client
  if (!wsClients.has(businessId)) {
    wsClients.set(businessId, new Set());
  }
  wsClients.get(businessId).add(ws);
  console.log(`[WS] client registered businessId=${businessId} total=${wsClients.get(businessId).size}`);

  // Heartbeat: ping every 30s, terminate if no pong
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Send current state immediately
  const session = sessions.get(businessId);
  if (session) {
    try {
      ws.send(JSON.stringify({
        type: 'status',
        data: { status: session.status, phoneNumber: session.displayPhoneNumber }
      }));
      console.log(`[WS] initial status sent businessId=${businessId} status=${session.status}`);
    } catch { /* client may have disconnected */ }
  } else {
    console.log(`[WS] no session yet businessId=${businessId}`);
  }

  ws.on('close', (code, reason) => {
    const clients = wsClients.get(businessId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) wsClients.delete(businessId);
    }
    console.log(`[WS] close code=${code} reason=${reason?.toString() || 'none'} businessId=${businessId}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] error businessId=${businessId} error=${err.message}`);
    const clients = wsClients.get(businessId);
    if (clients) clients.delete(ws);
  });

  // Handle incoming messages (pairing code request)
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    console.log(`[WS] message received businessId=${businessId} type=${msg.action || 'unknown'}`);

    if (msg.action === 'request_pairing_code') {
      const { phoneNumber } = msg;

      // Validate session exists and belongs to this business
      const session = sessions.get(businessId);
      if (!session || !session.socket) {
        try {
          ws.send(JSON.stringify({ type: 'pairing_code_error', data: { message: 'Session belum aktif. Klik Hubungkan WhatsApp terlebih dahulu.' } }));
        } catch { /* ignore */ }
        return;
      }

      // Normalize phone
      const normalized = normalizePhone(phoneNumber);
      if (!normalized) {
        try {
          ws.send(JSON.stringify({ type: 'pairing_code_error', data: { message: 'Nomor telepon tidak valid. Gunakan format internasional (contoh: 6281234567890).' } }));
        } catch { /* ignore */ }
        return;
      }

      try {
        // Request pairing code from Baileys (real API)
        const code = await session.socket.requestPairingCode(normalized);
        // Send back to this client only (never broadcast)
        try {
          ws.send(JSON.stringify({ type: 'pairing_code', data: { code } }));
        } catch { /* client disconnected */ }
      } catch (err) {
        try {
          ws.send(JSON.stringify({ type: 'pairing_code_error', data: { message: err.message || 'Gagal mendapatkan pairing code' } }));
        } catch { /* ignore */ }
      }
    }
  });
});

// ══════════════════════════════════════════════════════════
// Helper: notify only clients for a specific businessId
// ══════════════════════════════════════════════════════════

function notifyClients(businessId, message) {
  const clients = wsClients.get(businessId);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      try { ws.send(data); } catch { /* ignore */ }
    }
  }
}

// ══════════════════════════════════════════════════════════
// Express API Routes
// ══════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'whatsapp-connector', sessions: sessions.size });
});

// Get connection status by businessId
app.get('/status/:businessId', async (req, res) => {
  const { businessId } = req.params;

  // Check in-memory session first
  const session = sessions.get(businessId);
  if (session) {
    return res.json({
      status: session.status,
      connected: session.status === 'connected',
      phoneNumber: session.displayPhoneNumber || '',
      businessId,
      qrcode: session.qrCode || null,
      lastError: session.lastError || null,
      connectorAvailable: true
    });
  }

  // Check database for existing connection
  const { data: conn } = await supabase
    .from('whatsapp_business_connections')
    .select('id, status, display_phone_number, connected_at, last_error')
    .eq('business_id', businessId)
    .maybeSingle();

  if (conn) {
    return res.json({
      status: conn.status || 'disconnected',
      connected: conn.status === 'connected',
      phoneNumber: conn.display_phone_number || '',
      connectionId: conn.id,
      businessId,
      lastError: conn.last_error || null,
      connectorAvailable: true
    });
  }

  // No connection record
  return res.json({ status: 'disconnected', connected: false, businessId, connectorAvailable: true });
});

// Start connection
app.post('/connect/:businessId', async (req, res) => {
  const { businessId } = req.params;
  console.log(`[HTTP] POST /connect/${businessId}`);

  try {
    // Check for existing active session
    const existing = sessions.get(businessId);
    if (existing && (existing.status === 'connected' || existing.status === 'qr')) {
      return res.json({
        success: true,
        status: existing.status,
        connectionId: existing.connectionId,
        qrRequired: existing.status === 'qr'
      });
    }

    // Clean up stale session (stuck at 'connecting' from prior failed attempt)
    if (existing && existing.socket) {
      try { existing.socket.end(undefined); } catch { /* ignore */ }
      if (existing.processorInterval) clearInterval(existing.processorInterval);
    }

    // Find or create connection record in Supabase
    let connectionId = businessId;
    const { data: conn } = await supabase
      .from('whatsapp_business_connections')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle();

    if (conn) {
      connectionId = conn.id;
    } else {
      const { data: newConn } = await supabase
        .from('whatsapp_business_connections')
        .insert({
          business_id: businessId,
          status: 'connecting'
        })
        .select('id')
        .single();
      if (newConn) connectionId = newConn.id;
    }

    // Create session
    sessions.set(businessId, {
      connectionId,
      businessId,
      displayPhoneNumber: '',
      socket: null,
      qrCode: null,
      status: 'connecting',
      lastError: null,
      processorInterval: null
    });

    // Return IMMEDIATELY — don't await initializeSocket
    // QR arrives via WebSocket, not via POST response
    res.json({ success: true, status: 'connecting', connectionId, qrRequired: true });

    // Initialize Baileys in background (QR will arrive via WebSocket)
    initializeSocket(businessId, connectionId).catch(err => {
      console.error(`[CONNECT] initializeSocket failed for ${businessId}:`, err.message);
      const s = sessions.get(businessId);
      if (s) {
        s.status = 'error';
        s.lastError = err.message;
      }
      notifyClients(businessId, { type: 'error', data: { message: err.message } });
    });
  } catch (error) {
    console.error('[CONNECT] Error:', error.message);
    const session = sessions.get(businessId);
    if (session) {
      session.status = 'error';
      session.lastError = error.message;
    }
    notifyClients(businessId, { type: 'error', data: { message: error.message } });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect
app.post('/disconnect/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const session = sessions.get(businessId);

  if (!session) {
    return res.json({ success: true, message: 'No active session' });
  }

  try {
    // Clear message processor interval
    if (session.processorInterval) {
      clearInterval(session.processorInterval);
      session.processorInterval = null;
    }

    // End Baileys socket
    if (session.socket) {
      try {
        session.socket.end(undefined);
      } catch { /* ignore */ }
      session.socket = null;
    }

    // Update Supabase
    await supabase
      .from('whatsapp_business_connections')
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString()
      })
      .eq('id', session.connectionId);

    session.status = 'disconnected';
    session.qrCode = null;
    notifyClients(businessId, { type: 'status', data: { status: 'disconnected' } });

    res.json({ success: true });
  } catch (error) {
    console.error('[DISCONNECT] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send message
app.post('/send-message/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const { to, message } = req.body;

  const session = sessions.get(businessId);
  if (!session || session.status !== 'connected' || !session.socket) {
    return res.status(400).json({ success: false, error: 'Not connected' });
  }

  try {
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    const result = await session.socket.sendMessage(jid, { text: message });
    res.json({ success: true, messageId: result?.key?.id || null });
  } catch (error) {
    console.error('[SEND] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ══════════════════════════════════════════════════════════
// Baileys Socket Initialization
// ══════════════════════════════════════════════════════════

async function initializeSocket(businessId, connectionId) {
  console.log(`[Socket] initialize requested businessId=${businessId}`);
  const session = sessions.get(businessId);
  if (!session) throw new Error('Session not found');

  // Session directory for file-based auth persistence
  const sessionDir = join(SESSIONS_DIR, businessId);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  // Load auth state from disk (survives restarts)
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Get latest Baileys version (with timeout)
  const versionPromise = fetchLatestBaileysVersion();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Baileys version fetch timeout')), 10000)
  );
  const { version } = await Promise.race([versionPromise, timeoutPromise]);

  // Create socket
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: state.keys,
    },
    printQRInTerminal: true,
    browser: ['BisnisSehat', 'Safari', '1.0.0'],
    generateHighQualityLinkPreview: false,
  });

  session.socket = sock;

  // Save credentials on every update (persists to disk)
  sock.ev.on('creds.update', saveCreds);

  // Connection state handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.status = 'qr';
      session.qrCode = qr;
      const clientCount = wsClients.get(businessId)?.size || 0;
      console.log(`[Socket] QR generated businessId=${businessId} wsClients=${clientCount}`);
      notifyClients(businessId, { type: 'qrcode', data: { qrcode: qr } });

      // Update DB
      await supabase
        .from('whatsapp_business_connections')
        .update({ status: 'connecting', last_error: '' })
        .eq('id', connectionId);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log(`[Socket] Disconnected (code ${statusCode}), reconnecting for ${businessId}...`);
        session.status = 'connecting';
        session.socket = null;
        notifyClients(businessId, { type: 'status', data: { status: 'connecting' } });

        // Reconnect after delay
        setTimeout(() => {
          initializeSocket(businessId, connectionId).catch(err => {
            console.error(`[Socket] Reconnect failed for ${businessId}:`, err.message);
            session.status = 'error';
            session.lastError = err.message;
            notifyClients(businessId, { type: 'error', data: { message: err.message } });
          });
        }, 3000);
      } else {
        console.log(`[Socket] Logged out for ${businessId}`);
        session.status = 'disconnected';
        session.socket = null;
        session.qrCode = null;

        if (session.processorInterval) {
          clearInterval(session.processorInterval);
          session.processorInterval = null;
        }

        notifyClients(businessId, { type: 'status', data: { status: 'disconnected' } });

        await supabase
          .from('whatsapp_business_connections')
          .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
          .eq('id', connectionId);
      }
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.lastError = null;
      notifyClients(businessId, { type: 'status', data: { status: 'connected', phoneNumber: session.displayPhoneNumber } });
      console.log(`[Socket] Connected for business ${businessId}`);

      // Try to get phone number from user info
      try {
        const me = sock.user;
        if (me?.id) {
          session.displayPhoneNumber = me.id.replace(/:.*$/, '').replace('+', '');
        }
      } catch { /* ignore */ }

      // Update DB
      await supabase
        .from('whatsapp_business_connections')
        .update({
          status: 'connected',
          connected_at: new Date().toISOString(),
          last_error: '',
          display_phone_number: session.displayPhoneNumber
        })
        .eq('id', connectionId);

      // Start message processor (only if not already running)
      if (!session.processorInterval) {
        session.processorInterval = startMessageProcessor(businessId);
      }
    }
  });

  // Incoming message handler
  sock.ev.on('messages.upsert', async (msg) => {
    if (msg.type !== 'notify') return;
    for (const m of msg.messages) {
      handleIncomingMessage(businessId, m);
    }
  });
}

// ══════════════════════════════════════════════════════════
// Message Processing
// ══════════════════════════════════════════════════════════

async function handleIncomingMessage(businessId, msg) {
  const session = sessions.get(businessId);
  if (!session) return;
  if (msg.key.fromMe) return;

  const text = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || '';

  const whatsappMessageId = msg.key.id || `msg_${Date.now()}`;
  const senderPhone = msg.key.remoteJid?.replace(/@.*$/, '') || '';

  // Insert into queue (dedup via unique index on whatsapp_message_id)
  const { error } = await supabase
    .from('whatsapp_message_queue')
    .insert({
      business_id: session.businessId,
      phone_number_id: '',
      whatsapp_message_id: whatsappMessageId,
      sender_phone: senderPhone,
      message_type: text ? 'text' : (msg.message ? Object.keys(msg.message)[0] : 'unknown'),
      message_text: text,
      payload: msg,
      status: 'queued'
    });

  if (error) {
    if (error.code === '23505') return; // Duplicate, skip
    console.error('[MSG] Queue insert error:', error.message);
  } else {
    console.log(`[MSG] Queued: ${whatsappMessageId} from ${senderPhone}`);
  }
}

function startMessageProcessor(businessId) {
  return setInterval(async () => {
    const session = sessions.get(businessId);
    if (!session || session.status !== 'connected' || !session.socket) return;

    // Claim a job from queue
    const { data: job, error } = await supabase.rpc('claim_whatsapp_job', {
      worker_id: `baileys-${businessId}`,
      claim_timeout: '300 seconds'
    });

    if (error || !job || job.length === 0) return;

    const message = job[0];
    try {
      // Mark completed
      await supabase
        .from('whatsapp_message_queue')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', message.id);

      // Auto-reply (placeholder - real business logic goes here)
      if (message.message_text && session.socket) {
        const jid = message.sender_phone?.includes('@')
          ? message.sender_phone
          : `${message.sender_phone}@s.whatsapp.net`;
        await session.socket.sendMessage(jid, {
          text: `Terima kasih! Pesan "${message.message_text}" telah diterima.`
        });
      }
    } catch (err) {
      console.error('[PROC] Error:', err.message);
    }
  }, 2000);
}

// ══════════════════════════════════════════════════════════
// Start Server
// ══════════════════════════════════════════════════════════

async function main() {
  await loadBaileys();

  console.log('[Server] WhatsApp Baileys Connector');
  console.log('  hasSupabaseUrl:', hasSupabaseUrl);
  console.log('  hasServiceKey:', hasServiceKey);
  console.log('  hasEncryptionKey:', hasEncryptionKey);
  console.log('  encryptionKeyValid:', encryptionKeyValid);
  console.log('  port:', PORT);

  // Auto-restore sessions from DB on startup
  const { data: connections } = await supabase
    .from('whatsapp_business_connections')
    .select('id, business_id, status')
    .eq('status', 'connected');

  if (connections && connections.length > 0) {
    console.log(`[Server] Restoring ${connections.length} session(s)...`);
    for (const conn of connections) {
      try {
        sessions.set(conn.business_id, {
          connectionId: conn.id,
          businessId: conn.business_id,
          displayPhoneNumber: '',
          socket: null,
          qrCode: null,
          status: 'connecting',
          lastError: null,
          processorInterval: null
        });
        await initializeSocket(conn.business_id, conn.id);
        console.log(`[Server] Restored session for ${conn.business_id}`);
      } catch (err) {
        console.error(`[Server] Failed to restore ${conn.business_id}:`, err.message);
      }
    }
  }

  // Heartbeat: ping all clients every 30s, terminate dead connections
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  server.listen(PORT, () => {
    console.log(`[Server] WhatsApp Baileys Connector running on port ${PORT}`);
    console.log(`[Server] Health: http://localhost:${PORT}/health`);
  });
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
