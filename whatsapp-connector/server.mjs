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
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import {
  handleOperationalMessage,
  handleGuidedCommand,
  OPERATIONAL_INTENTS
} from './operational/index.mjs';
import { classifyDisconnect, statusFromConnectionUpdate, normalizeConnectionStatus } from './connectionState.mjs';
import { advanceConversation, getInteractiveSelection, formatInteractiveFallback } from './operational/conversation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from connector directory
dotenvConfig({ path: join(__dirname, '.env') });

// ══════════════════════════════════════════════════════════
// Baileys imports (dynamic to avoid issues at startup)
// ══════════════════════════════════════════════════════════

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, proto, generateWAMessageFromContent;

async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  proto = baileys.proto;
  generateWAMessageFromContent = baileys.generateWAMessageFromContent;
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

// key = businessId, value = { connectionId, businessId, displayPhoneNumber, socket, qrCode, status, lastError, processorInterval, reconnectTimer }
const sessions = new Map();

// In-flight socket initialization lock to ensure strictly 1 Baileys socket per businessId
const socketInitLocks = new Map();

// Per-connectionId WebSocket client list
// key = businessId, value = Set<WebSocket>
const wsClients = new Map();

// Baileys DisconnectReason codes mapping for precise error audit
const DISCONNECT_REASON_MAP = {
  401: 'loggedOut',
  403: 'forbidden',
  408: 'timedOut / connectionLost',
  411: 'multideviceMismatch',
  428: 'connectionClosed',
  440: 'connectionReplaced',
  500: 'badSession',
  503: 'unavailableService',
  515: 'restartRequired',
};

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
      const effectiveStatus = normalizeConnectionStatus(session.status);
      ws.send(JSON.stringify({
        type: 'status',
        data: {
          status: effectiveStatus,
          phoneNumber: session.displayPhoneNumber,
          syncing: session.syncing || false
        }
      }));
      if (effectiveStatus === 'qr' && session.qrCode) {
        ws.send(JSON.stringify({
          type: 'qrcode',
          data: { qrcode: session.qrCode }
        }));
      }
      console.log(`[WS] initial status sent businessId=${businessId} status=${effectiveStatus}`);
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
      if (!session || !session.socket || session.status !== 'qr') {
        try {
          ws.send(JSON.stringify({ type: 'pairing_code_error', data: { message: 'Pairing code hanya tersedia saat QR baru aktif.' } }));
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

async function sendInteractiveMessage(socket, jid, interactive) {
  const buttons = interactive.kind === 'list'
    ? [{ name: 'single_select', buttonParamsJson: JSON.stringify({ title: interactive.buttonText, sections: interactive.sections }) }]
    : interactive.buttons.map(button => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: button.title, id: button.id }) }));
  const content = proto.Message.fromObject({
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: {
          body: { text: interactive.text },
          footer: { text: interactive.footer || 'BisnisSehat' },
          header: { title: interactive.title || 'BisnisSehat', hasMediaAttachment: false },
          nativeFlowMessage: { buttons, messageVersion: 1 }
        }
      }
    }
  });
  const message = generateWAMessageFromContent(jid, content, { userJid: socket.user?.id });
  await socket.relayMessage(jid, message.message, { messageId: message.key.id });
}

async function sendConversationReply(socket, senderPhone, response, options = {}) {
  const targetJid = options.remoteJid || (senderPhone.includes('@') ? senderPhone : `${senderPhone}@s.whatsapp.net`);
  if (response.interactive) {
    try {
      await sendInteractiveMessage(socket, targetJid, response.interactive);
      console.log('→ sendMessage success');
      return;
    } catch (err) {
      console.warn(`[Socket] Native interactive send failed (${err.message}), falling back to text`);
      const fallbackText = formatInteractiveFallback(response.interactive);
      await socket.sendMessage(targetJid, { text: fallbackText });
      console.log('→ sendMessage success');
      return;
    }
  }
  if (response.text) {
    await socket.sendMessage(targetJid, { text: response.text });
    console.log('→ sendMessage success');
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
    const effectiveStatus = normalizeConnectionStatus(session.status);
    return res.json({
      status: effectiveStatus,
      connected: effectiveStatus === 'connected',
      phoneNumber: session.displayPhoneNumber || '',
      businessId,
      qrcode: session.qrCode || null,
      lastError: session.lastError || null,
      connectorAvailable: true,
      syncing: session.syncing || false
    });
  }

  // A database row only records the last known state. It is never evidence
  // that this connector currently owns an open Baileys socket.
  const { data: conn } = await supabase
    .from('whatsapp_business_connections')
    .select('id, status, display_phone_number, connected_at, last_error')
    .eq('business_id', businessId)
    .maybeSingle();

  if (conn) {
    return res.json({
      status: 'disconnected',
      connected: false,
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
    // Check for existing active or in-flight session
    const existing = sessions.get(businessId);
    if (existing && (existing.status === 'connected' || existing.status === 'qr' || existing.status === 'connecting' || existing.status === 'reconnecting')) {
      console.log(`[HTTP] POST /connect/${businessId} session already in state '${existing.status}', returning existing`);
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
    if (existing?.reconnectTimer) clearTimeout(existing.reconnectTimer);

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
      processorInterval: null,
      reconnectTimer: null
    });

    // Return IMMEDIATELY — don't await initializeSocket
    // QR arrives via WebSocket, not via POST response
    res.json({ success: true, status: 'connecting', connectionId, qrRequired: false });

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
  const sessionDir = join(SESSIONS_DIR, businessId);

  try {
    if (session) {
      // Clear message processor interval
      if (session.processorInterval) {
        clearInterval(session.processorInterval);
        session.processorInterval = null;
      }
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
      }

      // End Baileys socket with official sock.logout() if available
      if (session.socket) {
        try {
          console.log(`[DISCONNECT] Logging out Baileys socket for business ${businessId}...`);
          if (typeof session.socket.logout === 'function') {
            await session.socket.logout('Intentional web disconnect');
          } else {
            session.socket.end(undefined);
          }
        } catch (logoutErr) {
          console.warn(`[DISCONNECT] sock.logout() notice:`, logoutErr.message);
          try {
            session.socket.end(undefined);
          } catch { /* ignore */ }
        }
        session.socket = null;
      }

      session.status = 'disconnected';
      session.qrCode = null;
      session.pairingCode = null;
      session.displayPhoneNumber = '';
      session.lastError = 'Disconnected by user';
    }

    // Purge encrypted auth credentials from disk so reconnect generates fresh QR
    try {
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[DISCONNECT] Auth credentials purged from disk for business ${businessId}`);
      }
    } catch (purgeErr) {
      console.error(`[DISCONNECT] Failed to purge session dir:`, purgeErr.message);
    }

    // Update Supabase connection row to disconnected
    if (session?.connectionId) {
      await supabase
        .from('whatsapp_business_connections')
        .update({
          status: 'disconnected',
          disconnected_at: new Date().toISOString(),
          last_error: 'Disconnected by user'
        })
        .eq('id', session.connectionId);
    } else {
      await supabase
        .from('whatsapp_business_connections')
        .update({
          status: 'disconnected',
          disconnected_at: new Date().toISOString(),
          last_error: 'Disconnected by user'
        })
        .eq('business_id', businessId);
    }

    notifyClients(businessId, { type: 'status', data: { status: 'disconnected', reason: 'User initiated disconnect' } });

    res.json({ success: true, message: 'Disconnected and credentials invalidated' });
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

// Operational command execution endpoint (used by Web UI & API clients)
app.post('/operational/execute/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const { text, command, source = 'api' } = req.body;

  try {
    const session = sessions.get(businessId);
    const socket = (session && session.status === 'connected') ? session.socket : null;

    let result;
    if (command && typeof command === 'object') {
      result = await handleGuidedCommand({
        command: { ...command, source: command.source || source },
        businessId,
        supabase
      });
    } else if (text && typeof text === 'string') {
      result = await handleOperationalMessage({
        text,
        businessId,
        whatsappMessageId: `api_${Date.now()}`,
        senderPhone: session?.displayPhoneNumber || '',
        supabase,
        socket
      });
    } else {
      return res.status(400).json({ success: false, error: 'Teks perintah atau command object wajib dikirim' });
    }

    return res.json(result);
  } catch (error) {
    console.error('[Operational API] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Operational intents list
app.get('/operational/intents', (req, res) => {
  res.json({ success: true, intents: OPERATIONAL_INTENTS });
});

// ══════════════════════════════════════════════════════════
// Baileys Socket Initialization
// ══════════════════════════════════════════════════════════

async function initializeSocket(businessId, connectionId) {
  // Prevent concurrent initializeSocket calls for the same businessId
  if (socketInitLocks.has(businessId)) {
    console.log(`[Socket] initialize already in flight for ${businessId}, awaiting existing promise`);
    return socketInitLocks.get(businessId);
  }

  const initPromise = (async () => {
    console.log(`[Socket] initialize requested businessId=${businessId}`);
    const session = sessions.get(businessId);
    if (!session) throw new Error('Session not found');

    // Clean up previous socket if still active to ensure strictly 1 Baileys socket
    if (session.socket) {
      try {
        session.socket.ev.removeAllListeners();
        session.socket.end(undefined);
      } catch { /* ignore */ }
      session.socket = null;
    }

    // Session directory for file-based auth persistence
    const sessionDir = join(SESSIONS_DIR, businessId);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    // Load auth state from disk (survives restarts)
    let { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // CRITICAL: Detect incomplete/aborted pairing attempt.
    // If state.creds.me is present, but registered is false and account is null,
    // WhatsApp server will reject the noise handshake with 401 (loggedOut).
    // Purge the unauthenticated credentials so Baileys generates a fresh QR code.
    if (state?.creds?.me && !state?.creds?.registered && !state?.creds?.account) {
      console.log(`[Socket] Incomplete unregistered pairing credentials detected for ${businessId}. Purging to allow clean QR code...`);
      try {
        rmSync(sessionDir, { recursive: true, force: true });
        mkdirSync(sessionDir, { recursive: true });
        const fresh = await useMultiFileAuthState(sessionDir);
        state = fresh.state;
        saveCreds = fresh.saveCreds;
      } catch (rmErr) {
        console.error('[Socket] Failed to reset incomplete session directory:', rmErr.message);
      }
    }

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
      printQRInTerminal: false,
      browser: ['BisnisSehat', 'Safari', '1.0.0'],
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
    });

    session.socket = sock;

    // Save credentials on every update (persists to disk)
    sock.ev.on('creds.update', saveCreds);

    // Connection state handler
    sock.ev.on('connection.update', async (update) => {
      // A late event from a socket that has been replaced must not overwrite
      // the state of the authoritative socket for this tenant.
      if (sessions.get(businessId) !== session || session.socket !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.status = statusFromConnectionUpdate({ connection, qr });
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
        const err = lastDisconnect?.error;
        // Baileys 6.7.16 reports disconnect causes as Boom errors. Do not
        // infer a terminal reason from arbitrary error properties or text.
        const statusCode = Number(err?.output?.statusCode ?? 0);
        const reasonName = DISCONNECT_REASON_MAP[statusCode] || err?.message || 'unknown';

        console.log(`[Socket] Connection closed businessId=${businessId} statusCode=${statusCode} (${reasonName})`);

        const disconnect = classifyDisconnect(statusCode, DisconnectReason);

        if (disconnect.terminal) {
          console.log(`[Socket] Terminal disconnect reason='${reasonName}' (${statusCode}) for ${businessId}`);
          session.status = 'disconnected';
          session.socket = null;
          session.qrCode = null;
          session.lastError = `Disconnected: ${reasonName} (${statusCode})`;

          if (session.processorInterval) {
            clearInterval(session.processorInterval);
            session.processorInterval = null;
          }

          // Invalid authentication must not be reused on the next Connect.
          // This is the existing tenant-scoped Baileys auth persistence.
          if (disconnect.invalidSession) {
            try {
              if (existsSync(sessionDir)) {
                rmSync(sessionDir, { recursive: true, force: true });
                console.log(`[Socket] Invalid credentials removed from disk for ${businessId}`);
              }
            } catch (cleanupErr) {
              console.error(`[Socket] Error cleaning session dir:`, cleanupErr.message);
            }
          }

          notifyClients(businessId, {
            type: 'status',
            data: { status: 'disconnected', reason: reasonName, statusCode }
          });

          await supabase
            .from('whatsapp_business_connections')
            .update({
              status: 'disconnected',
              disconnected_at: new Date().toISOString(),
              last_error: `${reasonName} (${statusCode})`
            })
            .eq('id', connectionId);

        } else {
          // Recoverable error: restartRequired, connectionClosed, connectionLost, timedOut, etc.
          console.log(`[Socket] Recoverable disconnect (${reasonName}, code ${statusCode}), reconnecting for ${businessId}...`);
          session.status = 'reconnecting';
          session.socket = null;
          session.qrCode = null;
          notifyClients(businessId, { type: 'status', data: { status: 'reconnecting', reason: reasonName } });

          const delay = statusCode === DisconnectReason.restartRequired ? 500 : 3000;
          if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
          session.reconnectTimer = setTimeout(() => {
            session.reconnectTimer = null;
            if (sessions.get(businessId) !== session || session.status !== 'reconnecting') return;
            initializeSocket(businessId, connectionId).catch(err => {
              console.error(`[Socket] Reconnect failed for ${businessId}:`, err.message);
              session.status = 'error';
              session.lastError = err.message;
              notifyClients(businessId, { type: 'error', data: { message: err.message } });
            });
          }, delay);
        }
      }

      if (connection === 'open') {
        // History sync emits separate Baileys events; only connection=open is
        // authoritative for this status and remains so while sync runs.
        session.status = statusFromConnectionUpdate({ connection });
        session.syncing = false;
        session.qrCode = null;
        session.lastError = null;

        // Try to get phone number from user info
        try {
          const me = sock.user;
          if (me?.id) {
            session.displayPhoneNumber = me.id.replace(/:.*$/, '').replace('+', '');
          }
        } catch { /* ignore */ }

        notifyClients(businessId, {
          type: 'status',
          data: {
            status: 'connected',
            phoneNumber: session.displayPhoneNumber,
            syncing: false
          }
        });
        console.log(`[Socket] Connected authoritative for business ${businessId}`);

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

        // Start message processor
        if (!session.processorInterval) {
          session.processorInterval = startMessageProcessor(businessId);
        }
      }
    });

    // History sync listener: MUST NEVER change primary connection status to syncing.
    // Preserves status === 'connected' and only provides secondary indicator.
    sock.ev.on('messaging-history.set', ({ isLatest, progress }) => {
      console.log(`[Socket] History sync event for business ${businessId}: progress=${progress ?? 0}% isLatest=${Boolean(isLatest)}`);
      session.syncing = !isLatest;
      if (session.status === 'connected') {
        notifyClients(businessId, {
          type: 'status',
          data: {
            status: 'connected',
            syncing: session.syncing,
            syncProgress: progress,
            phoneNumber: session.displayPhoneNumber
          }
        });
      }
    });

    // Incoming message handler
    sock.ev.on('messages.upsert', async (msg) => {
      if (msg.type !== 'notify' && msg.type !== 'append') return;
      for (const m of msg.messages) {
        handleIncomingMessage(businessId, m);
      }
    });

    return sock;
  })();

  socketInitLocks.set(businessId, initPromise);
  try {
    return await initPromise;
  } finally {
    socketInitLocks.delete(businessId);
  }
}

// ══════════════════════════════════════════════════════════
// Message Processing
// ══════════════════════════════════════════════════════════

async function handleIncomingMessage(businessId, msg) {
  const session = sessions.get(businessId);
  if (!session) return;
  if (msg.key?.fromMe) return;
  if (msg.key?.remoteJid === 'status@broadcast') return;

  const text = getInteractiveSelection(msg.message);

  console.log('INBOUND message received');
  console.log(`→ normalized text=${text}`);
  console.log(`→ businessId resolved: ${businessId}`);

  const whatsappMessageId = msg.key?.id || `msg_${Date.now()}`;
  const senderPhone = msg.key?.remoteJid?.replace(/@.*$/, '') || '';

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

    // Claim a job from queue atomically with fallback parameter names
    let job = null;
    let claimError = null;
    const { data: pData, error: pErr } = await supabase.rpc('claim_whatsapp_job', {
      p_worker_id: `baileys-${businessId}`,
      p_claim_timeout: '300 seconds'
    });
    if (!pErr && pData && pData.length > 0) {
      job = pData;
    } else if (pErr) {
      const { data: fbData, error: fbErr } = await supabase.rpc('claim_whatsapp_job', {
        worker_id: `baileys-${businessId}`,
        claim_timeout: '300 seconds'
      });
      if (!fbErr && fbData && fbData.length > 0) {
        job = fbData;
      } else {
        claimError = pErr || fbErr;
      }
    }

    if (claimError && claimError.code !== 'PGRST202') {
      console.error('[PROC] claim_whatsapp_job error:', claimError.message);
    }

    if (!job || job.length === 0) return;

    const message = job[0];
    try {
      if (message.message_text) {
        const trimmed = message.message_text.trim();
        if (/^\/(?:hai|help|menu)$/i.test(trimmed)) {
          console.log(`→ conversation handler matched ${trimmed}`);
        }
        const conversation = await advanceConversation({
          businessId: session.businessId,
          senderPhone: message.sender_phone,
          input: message.message_text,
          execute: command => handleGuidedCommand({ command, businessId: session.businessId, supabase })
        });
        if (conversation.handled) {
          if (conversation.interactive) {
            console.log('→ greeting generated');
          }
          console.log('→ sending greeting');
          const targetJid = message.payload?.key?.remoteJid || (message.sender_phone.includes('@') ? message.sender_phone : `${message.sender_phone}@s.whatsapp.net`);
          await sendConversationReply(session.socket, message.sender_phone, conversation, { remoteJid: targetJid });
          await supabase
            .from('whatsapp_message_queue')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', message.id);
          return;
        }
        await handleOperationalMessage({
          text: message.message_text,
          businessId: session.businessId,
          whatsappMessageId: message.whatsapp_message_id,
          senderPhone: message.sender_phone,
          supabase,
          socket: session.socket
        });
      }

      // Mark completed
      await supabase
        .from('whatsapp_message_queue')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', message.id);
    } catch (err) {
      console.error('[PROC] Operational message processing error:', err.message);
      await supabase
        .from('whatsapp_message_queue')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          last_error: err.message
        })
        .eq('id', message.id);
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

  // Auto-restore sessions from DB in background
  try {
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
            processorInterval: null,
            reconnectTimer: null
          });
          initializeSocket(conn.business_id, conn.id).catch(err => {
            console.error(`[Server] Restore failed for ${conn.business_id}:`, err.message);
          });
        } catch (err) {
          console.error(`[Server] Failed to setup restore for ${conn.business_id}:`, err.message);
        }
      }
    }
  } catch (dbErr) {
    console.error('[Server] Failed to query active sessions:', dbErr.message);
  }
}

// Process-level unhandled rejection/exception traps to prevent transient network/Baileys crashes
process.on('unhandledRejection', (reason) => {
  console.warn('[Process] Caught unhandled rejection:', reason?.message || reason);
});

// Graceful shutdown traps for PM2 / systemd process management
const handleGracefulShutdown = async (signal) => {
  console.log(`[Process] Received ${signal}, closing active Baileys sockets cleanly...`);
  for (const [bizId, session] of sessions.entries()) {
    if (session.processorInterval) {
      clearInterval(session.processorInterval);
      session.processorInterval = null;
    }
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    if (session.socket) {
      try {
        session.socket.ev.removeAllListeners();
        session.socket.end(undefined);
      } catch { /* ignore */ }
      session.socket = null;
    }
  }
  process.exit(0);
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

