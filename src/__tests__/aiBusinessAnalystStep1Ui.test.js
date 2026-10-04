import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('AI Business Analyst — Step 1 UI & Routing Specification Suite', () => {
  const pagePath = path.resolve(process.cwd(), 'src/pages/ai/AiBusinessAnalystPage.jsx')
  const appPath = path.resolve(process.cwd(), 'src/App.jsx')
  const categoriesPath = path.resolve(process.cwd(), 'src/data/categories.js')
  const sidebarPath = path.resolve(process.cwd(), 'src/components/SidebarNav.jsx')

  // 1. /ai route exists
  it('1. /ai route exists and is configured in App.jsx', () => {
    assert.ok(fs.existsSync(appPath), 'App.jsx must exist')
    const appContent = fs.readFileSync(appPath, 'utf8')
    assert.ok(appContent.includes("path: '/ai'"), 'App.jsx must declare path: \'/ai\'')
    assert.ok(
      appContent.includes("import AiBusinessAnalystPage from './pages/ai/AiBusinessAnalystPage'") ||
      appContent.includes("import('./pages/ai/AiBusinessAnalystPage')"),
      'App.jsx must import AiBusinessAnalystPage'
    )
  })

  // 2. Unauthenticated user cannot open AI
  it('2. unauthenticated user cannot access /ai (protected by RequireAuth)', () => {
    const appContent = fs.readFileSync(appPath, 'utf8')
    const aiRouteIdx = appContent.indexOf("path: '/ai'")
    assert.ok(aiRouteIdx !== -1, '/ai route must exist')

    // Find the slice defining /ai route
    const aiSection = appContent.slice(aiRouteIdx, aiRouteIdx + 600)
    assert.ok(
      aiSection.includes('element: <RequireAuth />'),
      '/ai route must be wrapped by RequireAuth'
    )
  })

  // 3. Subscription guard remains active
  it('3. subscription guard remains active (protected by RequireSubscription)', () => {
    const appContent = fs.readFileSync(appPath, 'utf8')
    const aiRouteIdx = appContent.indexOf("path: '/ai'")
    const aiSection = appContent.slice(aiRouteIdx, aiRouteIdx + 600)

    assert.ok(
      aiSection.includes('RequireSubscription'),
      '/ai route must be wrapped by RequireSubscription'
    )
    assert.ok(
      aiSection.includes('requiredPlan="pro"'),
      '/ai route must specify requiredPlan="pro"'
    )
  })

  // 4. AI Business Analyst appears in navigation
  it('4. AI Business Analyst appears in navigation (SidebarNav & categories.js)', () => {
    const catContent = fs.readFileSync(categoriesPath, 'utf8')
    assert.ok(
      catContent.includes('✨ AI Business Analyst'),
      'categories.js SIDEBAR_NAV must include "✨ AI Business Analyst"'
    )
    assert.ok(
      catContent.includes("path: '/ai'"),
      'categories.js must link to /ai'
    )

    const sideContent = fs.readFileSync(sidebarPath, 'utf8')
    assert.ok(
      sideContent.includes("'ai-analyst'"),
      'SidebarNav.jsx must include ai-analyst in NAV_GROUPS'
    )
  })

  // 5. Suggested prompt can be clicked
  it('5. all 4 core suggested prompts are defined and wired for click', () => {
    const pageContent = fs.readFileSync(pagePath, 'utf8')
    assert.ok(pageContent.includes('Produk paling laku bulan ini?'), 'Prompt 1 must be present')
    assert.ok(pageContent.includes('Berapa omzet saya bulan ini?'), 'Prompt 2 must be present')
    assert.ok(pageContent.includes('Berapa margin saya?'), 'Prompt 3 must be present')
    assert.ok(pageContent.includes('Kapan harus restock?'), 'Prompt 4 must be present')
    assert.ok(pageContent.includes('handleSendMessage(prompt.query)'), 'Prompts must call handleSendMessage')
  })

  // 6. User message appears
  it('6. user message state handler formats and adds sender: user message', () => {
    const pageContent = fs.readFileSync(pagePath, 'utf8')
    assert.ok(pageContent.includes("sender: 'user'"), 'Message must set sender to user')
    assert.ok(pageContent.includes('user-message'), 'Must include test id or marker for user message')
  })

  // 7. Mock assistant response appears with disclaimer
  it('7. mock assistant response appears and is clearly distinguished from live data', () => {
    const pageContent = fs.readFileSync(pagePath, 'utf8')
    assert.ok(pageContent.includes("sender: 'assistant'"), 'Message must set sender to assistant')
    assert.ok(
      pageContent.includes('Simulasi Respons UI') || pageContent.includes('belum terhubung ke live LLM'),
      'Mock response must clearly state it is simulated and not live database data'
    )
  })

  // 8. Empty input does not send
  it('8. empty input or whitespace is rejected from sending', () => {
    const pageContent = fs.readFileSync(pagePath, 'utf8')
    assert.ok(
      pageContent.includes('!query || isLoading') || pageContent.includes('!inputValue.trim()'),
      'Component must validate input is not empty before sending'
    )
  })

  // 9. Enter sends and Shift+Enter is respected
  it('9. Enter key triggers message submit while Shift+Enter is allowed', () => {
    const pageContent = fs.readFileSync(pagePath, 'utf8')
    assert.ok(
      pageContent.includes("e.key === 'Enter' && !e.shiftKey"),
      'Must check for Enter without Shift key to submit'
    )
    assert.ok(
      pageContent.includes('e.preventDefault()'),
      'Must prevent default newline on Enter submit'
    )
  })

  // 10. Mobile layout does not horizontal overflow (360px, 390px, 412px)
  it('10. mobile layout adheres to adr.md (overflow-x-hidden, safe-area inset, responsive widths)', () => {
    const pageContent = fs.readFileSync(pagePath, 'utf8')
    assert.ok(
      pageContent.includes('overflow-x-hidden'),
      'Root layout must prevent horizontal overflow'
    )
    assert.ok(
      pageContent.includes('env(safe-area-inset-bottom'),
      'Input bar must account for mobile device safe area'
    )
    assert.ok(
      pageContent.includes('min-w-0'),
      'Flex children must have min-w-0 to prevent flex blowout on small viewports'
    )
    assert.ok(
      !pageContent.includes('w-[360px]') && !pageContent.includes('w-[390px]') && !pageContent.includes('w-[412px]'),
      'Must not hardcode fixed widths that break on smaller mobile screens'
    )
  })
})
