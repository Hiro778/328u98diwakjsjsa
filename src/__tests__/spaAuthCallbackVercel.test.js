import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const VERCEL_CONFIG_PATH = path.resolve('vercel.json')
const APP_JSX_PATH = path.resolve('src/App.jsx')
const AUTH_CALLBACK_PAGE_PATH = path.resolve('src/pages/AuthCallbackPage.jsx')
const AUTH_CONTEXT_PATH = path.resolve('src/context/AuthContext.jsx')

describe('Production SPA Routing & /auth/callback Vercel Fallback (bug.md)', () => {
  it('1. vercel.json exists and contains minimal, secure SPA fallback rewrites', () => {
    assert.ok(fs.existsSync(VERCEL_CONFIG_PATH), 'vercel.json must exist in root')

    const raw = fs.readFileSync(VERCEL_CONFIG_PATH, 'utf-8')
    let config
    assert.doesNotThrow(() => {
      config = JSON.parse(raw)
    }, 'vercel.json must be valid JSON')
    assert.ok(Array.isArray(config.rewrites), 'vercel.json must contain a rewrites array')
    const catchAllRewrite = config.rewrites.find(
      (r) => (r.source === '/(.*)' || r.source === '/:path*' || r.source.includes('.*')) && r.destination === '/index.html'
    )
    assert.ok(catchAllRewrite, 'Must have catch-all rewrite to /index.html for SPA client-side routing')
  })

  it('2. React Router in src/App.jsx explicitly declares /auth/callback route mapped to AuthCallbackPage', () => {
    const appContent = fs.readFileSync(APP_JSX_PATH, 'utf-8')
    assert.match(
      appContent,
      /import\s+AuthCallbackPage\s+from\s+['"]\.\/pages\/AuthCallbackPage['"]/,
      'App.jsx must import AuthCallbackPage'
    )
    assert.match(
      appContent,
      /path:\s*['"]\/auth\/callback['"][\s\S]*?element:\s*<AuthCallbackPage\s*\/>/,
      'App.jsx must have route /auth/callback rendering AuthCallbackPage'
    )
  })

  it('3. AuthCallbackPage safely consumes existing AuthContext without creating duplicate auth flows', () => {
    const callbackContent = fs.readFileSync(AUTH_CALLBACK_PAGE_PATH, 'utf-8')
    assert.match(
      callbackContent,
      /import\s*\{\s*useAuth\s*\}\s*from\s*['"]\.\.\/context\/AuthContext['"]/,
      'Must use existing useAuth hook'
    )
    assert.match(
      callbackContent,
      /isAuthenticated/,
      'Must check isAuthenticated from AuthContext'
    )
    assert.match(
      callbackContent,
      /Navigate\s+to=\{redirectTo\}/,
      'Must navigate to destination when authenticated'
    )
  })

  it('4. AuthContext does not hardcode localhost for production OAuth redirects', () => {
    const authContextContent = fs.readFileSync(AUTH_CONTEXT_PATH, 'utf-8')
    assert.match(
      authContextContent,
      /redirectTo:\s*`\$\{window\.location\.origin\}\/auth\/callback`/,
      'OAuth redirectTo must dynamically use window.location.origin instead of hardcoded localhost'
    )
    assert.doesNotMatch(
      authContextContent,
      /redirectTo:\s*['"`]http:\/\/localhost/i,
      'OAuth redirectTo must not hardcode localhost'
    )
  })

  it('5. vercel.json does not leak secrets or credentials', () => {
    const raw = fs.readFileSync(VERCEL_CONFIG_PATH, 'utf-8')
    assert.doesNotMatch(raw, /service_role/i, 'Must not contain service_role keys')
    assert.doesNotMatch(raw, /secret/i, 'Must not contain secret tokens')
    assert.doesNotMatch(raw, /sbp_/i, 'Must not contain Supabase access tokens')
  })
})
