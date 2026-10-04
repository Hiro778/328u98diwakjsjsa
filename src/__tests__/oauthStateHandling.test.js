import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseOAuthError, getFriendlyOAuthErrorMessage } from '../lib/oauthUtils.js'


const AUTH_PAGE_PATH = path.resolve('src/pages/AuthPage.jsx')
const AUTH_CALLBACK_PAGE_PATH = path.resolve('src/pages/AuthCallbackPage.jsx')
const AUTH_CONTEXT_PATH = path.resolve('src/context/AuthContext.jsx')

describe('OAuth State Handling & bad_oauth_state Recovery Suite', () => {
  it('1. parseOAuthError detects bad_oauth_state from query string parameters', () => {
    const error = parseOAuthError('?error=server_error&error_code=bad_oauth_state&error_description=OAuth+callback+with+invalid+or+missing+state', '')
    assert.ok(error, 'Must detect error object')
    assert.equal(error.errorCode, 'bad_oauth_state')
    assert.equal(error.errorDescription, 'OAuth callback with invalid or missing state')
  })

  it('2. parseOAuthError detects bad_oauth_state from hash fragment (implicit flow)', () => {
    const error = parseOAuthError('', '#error=server_error&error_code=bad_oauth_state&error_description=OAuth+callback+with+invalid+or+missing+state')
    assert.ok(error, 'Must detect error object from hash')
    assert.equal(error.errorCode, 'bad_oauth_state')
    assert.equal(error.errorDescription, 'OAuth callback with invalid or missing state')
  })

  it('3. parseOAuthError detects access_denied when user cancels consent', () => {
    const error = parseOAuthError('?error=access_denied&error_description=User+denied+access', '')
    assert.ok(error, 'Must detect access_denied')
    assert.equal(error.errorCode, 'access_denied')
  })

  it('4. parseOAuthError returns null when callback contains no error', () => {
    const error = parseOAuthError('?code=auth-code-123', '#access_token=token-123')
    assert.equal(error, null, 'Must return null when no error parameters exist')
  })

  it('5. AuthPage.jsx protects against double-submission and rapid clicks', () => {
    const content = fs.readFileSync(AUTH_PAGE_PATH, 'utf-8')
    assert.match(content, /isLoggingIn/, 'AuthPage must track isLoggingIn state')
    assert.match(content, /disabled=\{isLoggingIn\s*\|\|\s*loading\}/, 'Button must be disabled during login')
    assert.match(content, /Menghubungkan ke Google\.\.\./, 'Button must show connecting feedback')
  })

  it('6. AuthPage.jsx handles bad_oauth_state with a user-friendly Indonesian explanation', () => {
    const message = getFriendlyOAuthErrorMessage('bad_oauth_state')
    assert.match(message, /Sesi login Google telah kedaluwarsa atau terjadi gangguan koneksi/, 'Must show friendly Indonesian guidance')

    const content = fs.readFileSync(AUTH_PAGE_PATH, 'utf-8')
    assert.match(content, /getFriendlyOAuthErrorMessage/, 'AuthPage must call getFriendlyOAuthErrorMessage')
    assert.match(content, /oauth-error-banner/, 'AuthPage must have error alert banner')
  })

  it('7. AuthCallbackPage.jsx prevents infinite loading hang with fallback timeout', () => {
    const content = fs.readFileSync(AUTH_CALLBACK_PAGE_PATH, 'utf-8')
    assert.match(content, /parseOAuthError/, 'AuthCallbackPage must parse OAuth errors')
    assert.match(content, /setTimeout/, 'AuthCallbackPage must have fallback timeout')
    assert.match(content, /error=auth_timeout/, 'Must redirect on timeout instead of hanging forever')
  })

  it('8. AuthContext returns the promise result of signInWithOAuth', () => {
    const content = fs.readFileSync(AUTH_CONTEXT_PATH, 'utf-8')
    assert.match(content, /return await supabase\.auth\.signInWithOAuth/, 'signInWithGoogle must return result')
  })
})
