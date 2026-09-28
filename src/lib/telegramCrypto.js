/**
/**
 * Application-Level Encryption for Telegram Bot Tokens
 *
 * Implements AES-256-GCM authenticated encryption at rest using Web Crypto API (crypto.subtle).
 * Ensures bot tokens are NEVER stored in plaintext in the database or server logs.
 */

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12 // 96-bit standard IV for AES-GCM
const PREFIX = 'enc_v1:'

/**
 * Resolves or derives a 256-bit CryptoKey.
 * Accepts:
 * - 64-char hex string
 * - Passphrase (derived via SHA-256)
 * - Server environment variable (TELEGRAM_BOT_ENCRYPTION_KEY)
 */
async function getCryptoKey(customKey = null) {
  let rawKey = customKey
  if (!rawKey && typeof process !== 'undefined' && process.env) {
    rawKey =
      process.env.TELEGRAM_BOT_ENCRYPTION_KEY ||
      process.env.SUPABASE_ENCRYPTION_KEY ||
      process.env.MARKETPLACE_ENCRYPTION_KEY
  }

  // Safe fallback for local/test runner when env var is not injected
  if (!rawKey) {
    rawKey = 'bisnissehat_telegram_bot_token_master_key_dev_fallback_2026'
  }

  let keyBytes
  const hexPattern = /^[0-9a-fA-F]{64}$/
  if (typeof rawKey === 'string' && hexPattern.test(rawKey)) {
    keyBytes = new Uint8Array(rawKey.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
  } else {
    // Derive 256 bits via SHA-256
    const encoder = new TextEncoder()
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(String(rawKey)))
    keyBytes = new Uint8Array(hash)
  }

  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM }, false, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Encrypts a raw Telegram Bot Token.
 * Returns: 'enc_v1:<base64(iv + ciphertext + authTag)>'
 */
export async function encryptBotToken(plaintextToken, { customKey = null } = {}) {
  if (!plaintextToken || typeof plaintextToken !== 'string') {
    throw new Error('Plaintext token must be a non-empty string')
  }

  const key = await getCryptoKey(customKey)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintextToken.trim())

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  )

  const ciphertext = new Uint8Array(ciphertextBuffer)
  const combined = new Uint8Array(iv.length + ciphertext.length)
  combined.set(iv)
  combined.set(ciphertext, iv.length)

  let base64
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(combined).toString('base64')
  } else {
    base64 = btoa(String.fromCharCode(...combined))
  }

  return `${PREFIX}${base64}`
}

/**
 * Decrypts an encrypted Telegram Bot Token.
 * Returns the raw plaintext token strictly in memory.
 */
export async function decryptBotToken(encryptedString, { customKey = null } = {}) {
  if (!encryptedString || typeof encryptedString !== 'string') {
    throw new Error('Encrypted string must be a non-empty string')
  }

  if (!encryptedString.startsWith(PREFIX)) {
    // If string is not encrypted (e.g. legacy or unencrypted during migration test), reject or throw
    throw new Error('Invalid ciphertext format: missing enc_v1 prefix')
  }

  const base64Data = encryptedString.slice(PREFIX.length)
  let combined
  if (typeof Buffer !== 'undefined') {
    combined = new Uint8Array(Buffer.from(base64Data, 'base64'))
  } else {
    combined = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
  }

  if (combined.length <= IV_LENGTH) {
    throw new Error('Ciphertext payload too short')
  }

  const iv = combined.subarray(0, IV_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH)

  const key = await getCryptoKey(customKey)

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    )
    return new TextDecoder().decode(decryptedBuffer)
  } catch (err) {
    throw new Error('Gagal mendekripsi token Telegram: autentikasi ciphertext tidak valid atau kunci salah.')
  }
}

/**
 * Checks if a token string is in encrypted format.
 */
export function isEncryptedToken(token) {
  return typeof token === 'string' && token.startsWith(PREFIX)
}
