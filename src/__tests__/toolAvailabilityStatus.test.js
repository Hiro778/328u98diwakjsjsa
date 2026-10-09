// src/__tests__/toolAvailabilityStatus.test.js
// Regression test suite for Tool Availability Status (soon.md)
// Verifying separation between AVAILABILITY (LIVE vs COMING_SOON) and ENTITLEMENT (FREE vs PRO)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CATEGORIES,
  TOOL_AVAILABILITY,
  isToolAvailable,
  TOTAL_AVAILABLE_TOOLS,
} from '../data/categories.js'

describe('soon.md: Tool Availability Status & Entitlement Separation', () => {
  const toolCardSrc = fs.readFileSync(path.resolve('src/components/ToolCard.jsx'), 'utf8')
  const categoryPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/CategoryPage.jsx'), 'utf8')
  const businessToolsSrc = fs.readFileSync(path.resolve('src/sections/BusinessTools.jsx'), 'utf8')

  // Helper accurately evaluating ToolCard runtime behavior
  function evaluateToolCard(tool, { isPro = false, hasUsedFreeAi = false } = {}) {
    const isComingSoon = tool.status === 'coming_soon' || tool.availability === 'COMING_SOON'
    const needsConnection = tool.status === 'needs_connection'

    const isAiStudio = tool.name === 'AI Creative Studio' || tool.path?.includes('content-generator')
    const isExplicitPro = tool.requiresPro === true
    const isExplicitFree = tool.requiresPro === false || tool.isFree === true
    const isHpp = tool.name === 'HPP Calculator' || tool.name?.toLowerCase().includes('hpp') || tool.path?.includes('hpp')
    const isBep = tool.name === 'BEP Calculator' || tool.name === 'Break-even Point Calculator' || tool.name?.toLowerCase().includes('bep') || tool.name?.toLowerCase().includes('break-even') || tool.name?.toLowerCase().includes('break even') || tool.path?.includes('bep')
    const isSeo = tool.name === 'SEO Optimizer' || tool.path?.includes('seo')
    const isLegal = tool.name === 'Legalitas Checker' || tool.path?.includes('legalitas')
    const isManualTx = tool.name?.toLowerCase().includes('transaksi manual')

    const isFreeTool = !isComingSoon && !isAiStudio && (isHpp || isBep || isExplicitFree || (!isExplicitPro && (isSeo || isLegal || isManualTx)))

    let isLocked = false
    let showLockIcon = false
    let badgeLabel = ''

    if (isComingSoon) {
      isLocked = false
      showLockIcon = false
      badgeLabel = 'Coming Soon'
    } else if (isFreeTool) {
      isLocked = false
      showLockIcon = false
      badgeLabel = isSeo ? 'Gratis • Unlimited' : 'Gratis'
    } else if (isAiStudio) {
      isLocked = false
      showLockIcon = false
      if (isPro) badgeLabel = 'Siap Digunakan'
      else if (!hasUsedFreeAi) badgeLabel = 'Gratis • 1x'
      else badgeLabel = 'Token diperlukan'
    } else if (needsConnection) {
      badgeLabel = 'Perlu Koneksi'
    } else if (!isPro) {
      isLocked = true
      showLockIcon = true
      badgeLabel = 'Pro'
    } else {
      badgeLabel = 'Siap Digunakan'
    }

    const ctaText = isComingSoon ? 'Segera Hadir' : isLocked ? 'Upgrade Pro' : 'Buka Tool'
    return { isLocked, showLockIcon, badgeLabel, ctaText }
  }

  // 1. Semua 9 Kurs & Valuta: availability = COMING_SOON, bukan FREE, bukan PRO
  describe('1. Semua 9 Kurs & Valuta Asing availability = COMING_SOON', () => {
    const exportTools = CATEGORIES.export.tools
    const expectedExportToolNames = [
      'Currency Risk Calculator',
      'HS Code Lookup',
      'Import Duty Estimator',
      'Buyer Matching',
      'Incoterms Guide',
      'Dokumen Perdagangan',
      'Certification Guide',
      'Freight Estimator',
      'Localization Tool',
    ]

    it('Katalog memiliki tepat 9 tool di Kurs & Valuta Asing tanpa menghapus tool', () => {
      assert.equal(exportTools.length, 9, 'Must have exactly 9 tools in export category')
      expectedExportToolNames.forEach((name) => {
        const found = exportTools.find((t) => t.name === name)
        assert.ok(found, `Tool ${name} must exist in export category`)
      })
    })

    it('Seluruh 9 tool memiliki availability = COMING_SOON dan status = coming_soon', () => {
      exportTools.forEach((tool) => {
        assert.equal(
          tool.availability,
          TOOL_AVAILABILITY.COMING_SOON,
          `${tool.name} must have availability = COMING_SOON`
        )
        assert.equal(tool.status, 'coming_soon', `${tool.name} must have status = coming_soon`)
      })
    })

    it('Seluruh 9 tool BUKAN FREE dan BUKAN PRO (tidak punya entitlement Free/Pro)', () => {
      exportTools.forEach((tool) => {
        assert.notEqual(tool.requiresPro, true, `${tool.name} must NOT have requiresPro: true`)
        assert.notEqual(tool.requiresPro, false, `${tool.name} must NOT have requiresPro: false`)
        assert.notEqual(tool.isFree, true, `${tool.name} must NOT have isFree: true`)
      })
    })

    it('Dalam UI ToolCard, seluruh 9 tool menampilkan badge "Coming Soon", tanpa lock icon, tanpa "Gratis", tanpa "Pro"', () => {
      exportTools.forEach((tool) => {
        const freeView = evaluateToolCard(tool, { isPro: false })
        assert.equal(freeView.badgeLabel, 'Coming Soon', `${tool.name} must display "Coming Soon" badge`)
        assert.equal(freeView.showLockIcon, false, `${tool.name} must NOT show lock icon`)
        assert.equal(freeView.isLocked, false, `${tool.name} must NOT be locked`)
        assert.equal(freeView.ctaText, 'Segera Hadir', `${tool.name} must display "Segera Hadir"`)

        const proView = evaluateToolCard(tool, { isPro: true })
        assert.equal(proView.badgeLabel, 'Coming Soon', `${tool.name} must display "Coming Soon" for pro user too`)
        assert.equal(proView.showLockIcon, false)
        assert.equal(proView.isLocked, false)
      })
    })
  })

  // 2. BEP: LIVE + FREE
  describe('2. BEP: LIVE + FREE', () => {
    const bepTool = CATEGORIES.finance.tools.find((t) => t.name === 'BEP Calculator')

    it('BEP Calculator memiliki availability LIVE dan requiresPro: false', () => {
      assert.ok(bepTool, 'BEP Calculator must exist in finance tools')
      assert.equal(bepTool.availability, 'LIVE')
      assert.equal(bepTool.requiresPro, false)
    })

    it('BEP Calculator menampilkan badge Gratis dan Buka Tool untuk akun Free', () => {
      const view = evaluateToolCard(bepTool, { isPro: false })
      assert.equal(view.badgeLabel, 'Gratis')
      assert.equal(view.isLocked, false)
      assert.equal(view.showLockIcon, false)
      assert.equal(view.ctaText, 'Buka Tool')
    })
  })

  // 3. HPP Kalkulator: LIVE + FREE
  describe('3. HPP Kalkulator: LIVE + FREE', () => {
    const hppTool = CATEGORIES.finance.tools.find((t) => t.name === 'HPP Calculator')

    it('HPP Calculator memiliki availability LIVE dan requiresPro: false', () => {
      assert.ok(hppTool, 'HPP Calculator must exist in finance tools')
      assert.equal(hppTool.availability, 'LIVE')
      assert.equal(hppTool.requiresPro, false)
    })

    it('HPP Calculator menampilkan badge Gratis dan Buka Tool untuk akun Free', () => {
      const view = evaluateToolCard(hppTool, { isPro: false })
      assert.equal(view.badgeLabel, 'Gratis')
      assert.equal(view.isLocked, false)
      assert.equal(view.showLockIcon, false)
      assert.equal(view.ctaText, 'Buka Tool')
    })
  })

  // 4. Tool Pro yang benar-benar LIVE: LIVE + PRO
  describe('4. Tool Pro yang benar-benar LIVE: LIVE + PRO', () => {
    const proTools = CATEGORIES.finance.tools.filter((t) => t.requiresPro === true)

    it('Pro finance tools memiliki availability LIVE dan requiresPro: true', () => {
      assert.ok(proTools.length > 0)
      proTools.forEach((tool) => {
        assert.equal(tool.availability, 'LIVE', `${tool.name} must have availability LIVE`)
        assert.equal(tool.requiresPro, true, `${tool.name} must have requiresPro: true`)
      })
    })

    it('Pro tools menampilkan Pro + lock icon untuk akun Free, dan Siap Digunakan untuk Pro', () => {
      proTools.forEach((tool) => {
        const freeView = evaluateToolCard(tool, { isPro: false })
        assert.equal(freeView.isLocked, true)
        assert.equal(freeView.showLockIcon, true)
        assert.equal(freeView.badgeLabel, 'Pro')
        assert.equal(freeView.ctaText, 'Upgrade Pro')

        const proView = evaluateToolCard(tool, { isPro: true })
        assert.equal(proView.isLocked, false)
        assert.equal(proView.showLockIcon, false)
        assert.equal(proView.badgeLabel, 'Siap Digunakan')
        assert.equal(proView.ctaText, 'Buka Tool')
      })
    })
  })

  // 5. Coming Soon tidak boleh memicu paywall Pro
  describe('5. Coming Soon tidak boleh memicu paywall Pro', () => {
    it('ToolCard.jsx handleClick returns early when isComingSoon without navigating to pricing', () => {
      assert.ok(
        toolCardSrc.includes('if (isComingSoon) return'),
        'ToolCard must return early on coming soon click without navigating to pricing'
      )
    })

    it('Coming soon tools do not render Upgrade Pro CTA button', () => {
      CATEGORIES.export.tools.forEach((tool) => {
        const freeView = evaluateToolCard(tool, { isPro: false })
        assert.notEqual(freeView.ctaText, 'Upgrade Pro')
        assert.equal(freeView.isLocked, false)
      })
    })
  })

  // 6. Coming Soon tidak boleh dihitung sebagai tool yang tersedia
  describe('6. Coming Soon tidak boleh dihitung sebagai tool yang tersedia', () => {
    it('isToolAvailable helper returns false for COMING_SOON tools', () => {
      CATEGORIES.export.tools.forEach((tool) => {
        assert.equal(isToolAvailable(tool), false, `${tool.name} must not be counted as available`)
      })
    })

    it('isToolAvailable returns true for LIVE tools', () => {
      const hpp = CATEGORIES.finance.tools.find((t) => t.name === 'HPP Calculator')
      const bep = CATEGORIES.finance.tools.find((t) => t.name === 'BEP Calculator')
      assert.equal(isToolAvailable(hpp), true)
      assert.equal(isToolAvailable(bep), true)
    })

    it('TOTAL_AVAILABLE_TOOLS excludes coming soon tools', () => {
      const comingSoonCount = CATEGORIES.export.tools.length
      const totalTools = Object.values(CATEGORIES).reduce((sum, c) => sum + c.tools.length, 0)
      assert.ok(
        TOTAL_AVAILABLE_TOOLS <= totalTools - comingSoonCount,
        'TOTAL_AVAILABLE_TOOLS must exclude all coming soon tools'
      )
    })

    it('CategoryPage.jsx calculates availableCount filtering out COMING_SOON', () => {
      assert.ok(
        categoryPageSrc.includes("t.availability !== 'COMING_SOON'"),
        'CategoryPage must filter out COMING_SOON tools from available count'
      )
    })
  })

  // 7. BusinessTools.jsx consistency
  describe('7. Landing page BusinessTools.jsx consistency', () => {
    it('Semua 9 Kurs & Valuta Asing tools di BusinessTools memiliki status coming_soon', () => {
      const expectedTools = [
        'HS Code Lookup',
        'Import Duty Estimator',
        'Buyer Matching',
        'Incoterms Guide',
        'Dokumen Perdagangan',
        'Currency Risk Calculator',
        'Certification Guide',
        'Freight Estimator',
        'Localization Tool',
      ]
      expectedTools.forEach((name) => {
        assert.ok(
          businessToolsSrc.includes(`{ name: '${name}', status: 'coming_soon' }`),
          `${name} must have status coming_soon in BusinessTools.jsx`
        )
      })
    })
  })

  describe('8. ui2.md Regression: ToolCard hook imports', () => {
    it('ToolCard.jsx imports useNavigate from react-router', () => {
      assert.match(
        toolCardSrc,
        /import\s*\{\s*useNavigate\s*\}\s*from\s*['"]react-router['"]/,
        'ToolCard must explicitly import useNavigate from react-router'
      )
    })

    it('ToolCard.jsx imports useAuth from AuthContext', () => {
      assert.match(
        toolCardSrc,
        /import\s*\{\s*useAuth\s*\}\s*from\s*['"]\.\.\/context\/AuthContext['"]/,
        'ToolCard must explicitly import useAuth from ../context/AuthContext'
      )
    })

    it('ToolCard.jsx correctly defines navigate inside component function', () => {
      assert.match(
        toolCardSrc,
        /const\s+navigate\s*=\s*useNavigate\(\)/,
        'ToolCard must initialize navigate using useNavigate()'
      )
    })
  })
})

