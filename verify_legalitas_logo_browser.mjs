// verify_legalitas_logo_browser.mjs
// Verifies Vite Dev Server & Browser-safe module execution for Legalitas & Logo Coming Soon (ui.md)

import { createServer } from 'vite'
import { CATEGORIES, isToolAvailable, TOOL_AVAILABILITY } from './src/data/categories.js'
import { LOGO_ANALYZER_ENABLED, checkLogoSimilarity, uploadLogoImage } from './src/lib/legalitasService.js'

async function runVerification() {
  console.log('================================================================')
  console.log('VERIFYING VITE DEV SERVER & BROWSER MODULE EXECUTION (ui.md)')
  console.log('================================================================\n')

  const server = await createServer({
    server: { port: 5175 },
    logLevel: 'error',
  })
  await server.listen()

  try {
    // 1. Fetch transformed LegalitasPage
    const pageResult = await server.transformRequest(
      '/src/pages/dashboard/legalitas/LegalitasPage.jsx'
    )
    if (!pageResult || !pageResult.code) {
      throw new Error('FAILED: LegalitasPage.jsx failed to transform!')
    }
    console.log('✅ [PASS] 1. LegalitasPage.jsx transformed by Vite successfully')

    // 2. Fetch transformed LegalitasDashboard
    const dashboardResult = await server.transformRequest(
      '/src/sections/Legalitas/LegalitasDashboard.jsx'
    )
    if (!dashboardResult || !dashboardResult.code) {
      throw new Error('FAILED: LegalitasDashboard.jsx failed to transform!')
    }
    console.log('✅ [PASS] 2. LegalitasDashboard.jsx transformed by Vite successfully')

    // 3. Fetch transformed LogoCheckTab
    const logoTabResult = await server.transformRequest(
      '/src/sections/Legalitas/LogoCheckTab.jsx'
    )
    if (!logoTabResult || !logoTabResult.code) {
      throw new Error('FAILED: LogoCheckTab.jsx failed to transform!')
    }
    console.log('✅ [PASS] 3. LogoCheckTab.jsx transformed by Vite successfully')

    // 4. Verify LogoCheckTab does NOT contain active file upload input
    const tabCode = logoTabResult.code
    if (tabCode.includes('type="file"') || tabCode.includes('Klik atau seret logo ke sini')) {
      throw new Error('FAILED: LogoCheckTab still contains active upload dropzone!')
    }
    console.log('✅ [PASS] 4. LogoCheckTab does NOT contain active file input or dropzone')

    // 5. Verify LogoCheckTab contains "Segera Hadir" status
    if (!tabCode.includes('Segera Hadir')) {
      throw new Error('FAILED: LogoCheckTab does not contain "Segera Hadir"!')
    }
    console.log('✅ [PASS] 5. LogoCheckTab displays restrained "Segera Hadir" status')

    // 6. Verify feature flag state in legalitasService
    if (LOGO_ANALYZER_ENABLED !== false) {
      throw new Error('FAILED: LOGO_ANALYZER_ENABLED must be false!')
    }
    console.log('✅ [PASS] 6. Feature flag LOGO_ANALYZER_ENABLED is false')

    // 7. Verify checkLogoSimilarity is safely blocked from calling Vision
    const checkRes = await checkLogoSimilarity({ imageUrl: 'https://test.com/dummy.png' })
    if (!checkRes.error || checkRes.overallStatus !== 'COMING_SOON') {
      throw new Error('FAILED: checkLogoSimilarity was not safely blocked!')
    }
    console.log('✅ [PASS] 7. checkLogoSimilarity is safely blocked (no Vision request)')

    // 8. Verify tool catalog state
    const logoTool = CATEGORIES.legal.tools.find((t) => t.name === 'Logo Analyzer')
    if (!logoTool || logoTool.availability !== TOOL_AVAILABILITY.COMING_SOON || logoTool.status !== 'coming_soon') {
      throw new Error('FAILED: Logo Analyzer catalog state is not COMING_SOON!')
    }
    if (logoTool.requiresPro === true || logoTool.isFree === true) {
      throw new Error('FAILED: Free/Pro gating is incorrectly applied to Logo Analyzer!')
    }
    if (isToolAvailable(logoTool) !== false) {
      throw new Error('FAILED: Logo Analyzer is erroneously reported as available!')
    }
    console.log('✅ [PASS] 8. Tool catalog source of truth correctly marks Logo Analyzer as COMING_SOON')

    console.log('\n================================================================')
    console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY (ui.md)')
    console.log('================================================================')
  } finally {
    await server.close()
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
