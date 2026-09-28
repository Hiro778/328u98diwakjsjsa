export const CONNECTION_STATUS = {
  CONNECTING: 'connecting',
  RECONNECTING: 'reconnecting',
  QR_REQUIRED: 'qr',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  LOGGED_OUT: 'logged_out',
  ERROR: 'error'
};

// Baileys exposes DisconnectReason as numeric constants. Keep the decision in
// one place and compare against those constants rather than error text.
export function classifyDisconnect(statusCode, DisconnectReason) {
  const reason = DisconnectReason || {};
  const invalidCodes = [
    reason.loggedOut,
    reason.badSession,
    reason.multideviceMismatch,
  ].filter(Number.isFinite);
  const terminalCodes = [
    reason.forbidden,
    reason.connectionReplaced,
  ].filter(Number.isFinite);
  const invalidSession = invalidCodes.includes(statusCode);
  const terminal = invalidSession || terminalCodes.includes(statusCode);

  return {
    terminal,
    invalidSession,
    shouldReconnect: !terminal,
  };
}

export function normalizeConnectionStatus(status) {
  if (status === 'syncing') return CONNECTION_STATUS.CONNECTED;
  return status || CONNECTION_STATUS.DISCONNECTED;
}

export function statusFromConnectionUpdate({ connection, qr, loggedOut = false, error = false, isSyncing = false }) {
  if (connection === 'open') return CONNECTION_STATUS.CONNECTED;
  if (loggedOut) return CONNECTION_STATUS.LOGGED_OUT;
  if (error) return CONNECTION_STATUS.ERROR;
  if (qr) return CONNECTION_STATUS.QR_REQUIRED;
  if (connection === 'close') return CONNECTION_STATUS.DISCONNECTED;
  return CONNECTION_STATUS.CONNECTING;
}

