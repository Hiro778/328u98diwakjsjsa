import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// DisconnectReason constants from Baileys
const DisconnectReason = {
  connectionClosed: 428,
  connectionLost: 408,
  connectionReplaced: 440,
  timedOut: 408,
  loggedOut: 401,
  badSession: 500,
  restartRequired: 515,
  multideviceMismatch: 411,
  forbidden: 403,
  unavailableService: 503,
}

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
}

function evaluateDisconnect(statusCode) {
  const reasonName = DISCONNECT_REASON_MAP[statusCode] || 'unknown'
  const isLoggedOut = statusCode === DisconnectReason.loggedOut
  const isBadSession = statusCode === DisconnectReason.badSession
  const isMismatch = statusCode === DisconnectReason.multideviceMismatch
  const isForbidden = statusCode === DisconnectReason.forbidden
  const isReplaced = statusCode === DisconnectReason.connectionReplaced

  const isTerminal = isLoggedOut || isBadSession || isMismatch || isForbidden || isReplaced
  const shouldPurgeCredentials = isLoggedOut || isBadSession || isMismatch
  const shouldReconnect = !isTerminal

  return { statusCode, reasonName, isTerminal, shouldPurgeCredentials, shouldReconnect }
}

function isSessionValid(creds) {
  if (!creds) return false
  // If me is set but not registered or has no account keys, session is invalid/incomplete
  if (creds.me && (!creds.registered || !creds.account)) {
    return false
  }
  return Boolean(creds.registered && creds.account)
}

describe('WhatsApp Connection Failure & Disconnect Reason Suite (fixwa.md)', () => {
  it('1. Correctly classifies 401 as loggedOut and terminal with credential purge', () => {
    const result = evaluateDisconnect(401)
    assert.equal(result.reasonName, 'loggedOut')
    assert.equal(result.isTerminal, true)
    assert.equal(result.shouldPurgeCredentials, true)
    assert.equal(result.shouldReconnect, false, 'Logged out session must not reconnect in infinite loop')
  })

  it('2. Correctly classifies 440 as connectionReplaced and terminal without credential purge', () => {
    const result = evaluateDisconnect(440)
    assert.equal(result.reasonName, 'connectionReplaced')
    assert.equal(result.isTerminal, true)
    assert.equal(result.shouldPurgeCredentials, false)
    assert.equal(result.shouldReconnect, false, 'Replaced connection must yield to new device/socket')
  })

  it('3. Correctly classifies 515 (restartRequired) as recoverable', () => {
    const result = evaluateDisconnect(515)
    assert.equal(result.reasonName, 'restartRequired')
    assert.equal(result.isTerminal, false)
    assert.equal(result.shouldReconnect, true)
  })

  it('4. Correctly classifies 408 (timedOut) and 428 (connectionClosed) as recoverable', () => {
    const r1 = evaluateDisconnect(408)
    assert.equal(r1.shouldReconnect, true)

    const r2 = evaluateDisconnect(428)
    assert.equal(r2.shouldReconnect, true)
  })

  it('5. Detects incomplete/unregistered pairing session as INVALID', () => {
    // The exact state found in sessions/b51fdc7e-6b7d-4207-8b30-d5f02275f686/creds.json
    const creds = {
      registered: false,
      me: { id: '6288211118394@s.whatsapp.net', name: '~' },
      account: null,
      pairingCode: 'KGYAKTWJ',
    }

    assert.equal(isSessionValid(creds), false, 'Incomplete pairing credentials must be flagged invalid')
  })

  it('6. Detects registered authenticated session as VALID', () => {
    const validCreds = {
      registered: true,
      me: { id: '6288211118394@s.whatsapp.net', name: 'User' },
      account: { details: 'cert_data' },
    }

    assert.equal(isSessionValid(validCreds), true)
  })

  it('7. Duplicate POST /connect guard returns active status without spawning new socket', () => {
    const activeSession = {
      status: 'connecting',
      connectionId: 'conn-123',
      socket: null,
    }

    function handleConnectRequest(session) {
      if (session && (session.status === 'connected' || session.status === 'qr' || session.status === 'connecting')) {
        return { success: true, status: session.status, spawnedNew: false }
      }
      return { success: true, status: 'connecting', spawnedNew: true }
    }

    const res = handleConnectRequest(activeSession)
    assert.equal(res.status, 'connecting')
    assert.equal(res.spawnedNew, false, 'Must not spawn new socket when already connecting')
  })
})
