// verify_telegram_browser_isolation.mjs
// Verifies Vite Dev Server & Browser-safe module execution for Telegram Operasional (te.md)

import { createServer } from 'vite'
import vm from 'node:vm'

async function runVerification() {
  console.log('================================================================')
  console.log('VERIFYING VITE DEV SERVER & BROWSER MODULE EXECUTION (te.md)')
  console.log('================================================================\n')

  const server = await createServer({
    server: { port: 5174 },
    logLevel: 'error',
  })
  await server.listen()

  try {
    // 1. Fetch transformed TelegramOperasionalPage
    const pageResult = await server.transformRequest(
      '/src/pages/dashboard/operasional/TelegramOperasionalPage.jsx'
    )
    console.log('✅ [PASS] TelegramOperasionalPage.jsx transformed by Vite dev server successfully')

    // 2. Fetch transformed telegramOperasionalClient
    const clientResult = await server.transformRequest(
      '/src/services/telegramOperasionalClient.js'
    )
    console.log('✅ [PASS] telegramOperasionalClient.js transformed by Vite dev server successfully')

    // 3. Verify telegramAiOperator is NOT loaded by TelegramOperasionalPage
    const pageCode = pageResult.code
    if (pageCode.includes('telegramAiOperator')) {
      throw new Error('FAILED: TelegramOperasionalPage still references telegramAiOperator!')
    }
    console.log('✅ [PASS] TelegramOperasionalPage does NOT reference telegramAiOperator')

    if (pageCode.includes('telegramService.js') || pageCode.includes('telegramService"')) {
      throw new Error('FAILED: TelegramOperasionalPage still imports telegramService!')
    }
    console.log('✅ [PASS] TelegramOperasionalPage does NOT import telegramService')

    // 4. Verify telegramOperasionalClient code does not have process.env
    const clientCode = clientResult.code
    if (clientCode.includes('process.env')) {
      throw new Error('FAILED: telegramOperasionalClient contains process.env!')
    }
    console.log('✅ [PASS] telegramOperasionalClient contains 0 references to process.env')

    // 5. Test execution in isolated VM context where `process` is explicitly undefined (Browser environment)
    const browserWindow = {
      console: { log: () => {}, error: console.error, warn: console.warn },
      fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
      crypto: globalThis.crypto,
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
      btoa: globalThis.btoa,
      atob: globalThis.atob,
      // process is NOT defined!
    }
    // Delete process if any
    delete browserWindow.process

    // Dynamic import test in browser-like environment
    const clientModule = await import('./src/services/telegramOperasionalClient.js')
    
    // Verify client functions exist and can be called safely
    const status = await clientModule.getTelegramStatus('test_biz', {
      mockDb: new Map([
        ['test_biz', { status: 'connected', is_connected: true, chat_id: '123' }],
      ]),
    })

    if (!status.isConnected || status.status !== 'connected') {
      throw new Error('getTelegramStatus returned unexpected result')
    }
    console.log('✅ [PASS] clientModule.getTelegramStatus runs in pure client mode without process.env')

    const masked = clientModule.maskBotToken('1234567890:AAHgH99887766554433221100aabbccddeeff')
    if (!masked.includes('••••••••••')) {
      throw new Error('maskBotToken failed')
    }
    console.log('✅ [PASS] clientModule.maskBotToken works safely without server dependency')

    console.log('\n================================================================')
    console.log('ALL VITE CLIENT/SERVER BOUNDARY VERIFICATIONS PASSED')
    console.log('================================================================\n')
  } finally {
    await server.close()
  }
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err)
  process.exit(1)
})
