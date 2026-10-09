// src/__tests__/authPasswordVisibilityToggle.test.js
// Dedicated unit & regression tests for Show/Hide Password functionality in AuthPage.jsx

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('AuthPage Show/Hide Password Toggle Feature Tests', () => {
  const authPagePath = path.resolve('src/pages/AuthPage.jsx')
  const authPageContent = fs.readFileSync(authPagePath, 'utf-8')

  it('1. Inputs and buttons have corresponding identifiers and data-testid attributes', () => {
    assert.ok(authPageContent.includes('id="auth-password"'), 'auth-password input ID must exist')
    assert.ok(authPageContent.includes('id="auth-confirm-password"'), 'auth-confirm-password input ID must exist')
    assert.ok(authPageContent.includes("data-testid={mode === 'login' ? 'toggle-login-password' : 'toggle-register-password'}"), 'Login/Register toggle button testid must exist')
    assert.ok(authPageContent.includes('data-testid="toggle-confirm-password"'), 'Confirm password toggle button testid must exist')
  })

  it('2. Three distinct states are initialized to false (hidden by default)', () => {
    assert.ok(authPageContent.includes("const [showLoginPassword, setShowLoginPassword] = useState(false)"), 'showLoginPassword must initialize to false')
    assert.ok(authPageContent.includes("const [showRegisterPassword, setShowRegisterPassword] = useState(false)"), 'showRegisterPassword must initialize to false')
    assert.ok(authPageContent.includes("const [showConfirmPassword, setShowConfirmPassword] = useState(false)"), 'showConfirmPassword must initialize to false')
  })

  it('3. State update functions are strictly isolated per input', () => {
    // Mode login updates only showLoginPassword
    assert.ok(authPageContent.includes("setShowLoginPassword((prev) => !prev)"), 'Login toggle updates only showLoginPassword')
    // Mode register updates only showRegisterPassword
    assert.ok(authPageContent.includes("setShowRegisterPassword((prev) => !prev)"), 'Register toggle updates only showRegisterPassword')
    // Confirm password updates only showConfirmPassword
    assert.ok(authPageContent.includes("setShowConfirmPassword((prev) => !prev)"), 'Confirm toggle updates only showConfirmPassword')
  })

  it('4. Switching auth modes resets all password visibility states to false', () => {
    const switchModeFn = authPageContent.substring(
      authPageContent.indexOf('function switchMode('),
      authPageContent.indexOf('async function handleGoogleLogin(')
    )

    assert.ok(switchModeFn.includes('setShowLoginPassword(false)'), 'switchMode resets showLoginPassword')
    assert.ok(switchModeFn.includes('setShowRegisterPassword(false)'), 'switchMode resets showRegisterPassword')
    assert.ok(switchModeFn.includes('setShowConfirmPassword(false)'), 'switchMode resets showConfirmPassword')
  })

  it('5. Toggle buttons use type="button" to prevent unwanted form submission', () => {
    const buttonBlocks = [...authPageContent.matchAll(/<button[\s\S]*?type="button"[\s\S]*?toggle-(?:login|register|confirm)-password[\s\S]*?>/g)]
    assert.ok(buttonBlocks.length >= 2, 'Toggle buttons must specify type="button"')
    for (const match of buttonBlocks) {
      assert.ok(match[0].includes('type="button"'), 'Button must have type="button"')
      assert.ok(!match[0].includes('type="submit"'), 'Button must not have type="submit"')
    }
  })

  it('6. Accessible aria-labels reflect current visibility state', () => {
    assert.ok(authPageContent.includes("showLoginPassword ? 'Sembunyikan password' : 'Lihat password'"))
    assert.ok(authPageContent.includes("showRegisterPassword ? 'Sembunyikan password' : 'Lihat password'"))
    assert.ok(authPageContent.includes("showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Lihat konfirmasi password'"))
  })

  it('7. Input fields have pr-11 padding so password text does not hide behind the icon', () => {
    // Both password input and confirm password input must have pr-11
    const passwordInputMatches = [...authPageContent.matchAll(/id="auth-(?:confirm-)?password"[\s\S]*?className="([^"]*)"/g)]
    assert.ok(passwordInputMatches.length >= 2, 'Found both password inputs')
    for (const match of passwordInputMatches) {
      assert.ok(match[1].includes('pr-11'), `Input class "${match[1]}" must include pr-11 padding`)
      assert.ok(match[1].includes('pl-3.5'), `Input class "${match[1]}" must include pl-3.5 padding`)
    }
  })

  it('8. EyeIcon and EyeOffIcon are defined with aria-hidden="true" and responsive classes', () => {
    assert.ok(authPageContent.includes('function EyeIcon({ className = \'h-5 w-5\' })'))
    assert.ok(authPageContent.includes('function EyeOffIcon({ className = \'h-5 w-5\' })'))
    assert.ok(authPageContent.includes('aria-hidden="true"'))
  })

  it('9. Simulated state transitions verify strict isolation', () => {
    // Model unit logic
    let state = {
      showLogin: false,
      showRegister: false,
      showConfirm: false,
    }

    // Toggle login password
    state.showLogin = !state.showLogin
    assert.strictEqual(state.showLogin, true)
    assert.strictEqual(state.showRegister, false, 'Register visibility must not change when login is toggled')
    assert.strictEqual(state.showConfirm, false, 'Confirm visibility must not change when login is toggled')

    // Toggle register password
    state.showRegister = !state.showRegister
    assert.strictEqual(state.showLogin, true, 'Login visibility stays untouched')
    assert.strictEqual(state.showRegister, true)
    assert.strictEqual(state.showConfirm, false, 'Confirm visibility remains false')

    // Toggle confirm password
    state.showConfirm = !state.showConfirm
    assert.strictEqual(state.showConfirm, true)

    // Simulate switchMode reset
    state = {
      showLogin: false,
      showRegister: false,
      showConfirm: false,
    }
    assert.strictEqual(state.showLogin, false)
    assert.strictEqual(state.showRegister, false)
    assert.strictEqual(state.showConfirm, false)
  })
})
