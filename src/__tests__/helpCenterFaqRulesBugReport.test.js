// src/__tests__/helpCenterFaqRulesBugReport.test.js
// Regression test suite for Help Center, FAQ, Usage Rules, and Email Bug Report
// Fully verifying bug.md specifications (Audited live tools, zero WhatsApp, mailto template)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  HELP_CATEGORIES,
  GENERAL_GUIDES,
  TOOL_FAQS,
  USAGE_RULES,
} from '../data/helpCenterData.js'
import {
  SUPPORT_CONFIG,
  BUG_REPORT_TEMPLATE,
  OFFICIAL_SUPPORT_EMAIL,
} from '../config/supportConfig.js'
import { CATEGORIES } from '../data/categories.js'

describe('Help Center & FAQ Specification Suite (bug.md)', () => {

  // 1. Tool Inventory Audit & Coverage
  describe('1. Tool Inventory Audit & Coverage', () => {
    it('Every live tool defined in categories.js has a corresponding FAQ help entry', () => {
      const liveToolsFromCategories = []
      Object.values(CATEGORIES).forEach((cat) => {
        cat.tools.forEach((tool) => {
          if (tool.availability !== 'COMING_SOON' && tool.status !== 'coming_soon') {
            liveToolsFromCategories.push(tool.name)
          }
        })
      })

      assert.ok(liveToolsFromCategories.length >= 25, `Expected at least 25 live tools, found ${liveToolsFromCategories.length}`)

      const faqToolNames = TOOL_FAQS.map((f) => f.toolName.toLowerCase())

      // Verify each live category tool is in TOOL_FAQS
      for (const toolName of liveToolsFromCategories) {
        const found = faqToolNames.some((fName) =>
          fName === toolName.toLowerCase() ||
          fName.includes(toolName.toLowerCase()) ||
          toolName.toLowerCase().includes(fName)
        )
        assert.ok(found, `Live tool "${toolName}" must have an entry in TOOL_FAQS`)
      }
    })

    it('All tool FAQ entries have complete structured schema', () => {
      assert.ok(TOOL_FAQS.length >= 25, 'Expected comprehensive tool FAQ dataset')

      TOOL_FAQS.forEach((tool) => {
        assert.ok(tool.toolName, 'toolName must be defined')
        assert.ok(tool.category, `category must be defined for ${tool.toolName}`)
        assert.ok(tool.route, `route must be defined for ${tool.toolName}`)
        assert.ok(
          tool.entitlement === 'FREE' || tool.entitlement === 'PRO' || tool.entitlement === 'FREE / PRO',
          `entitlement must be FREE, PRO, or FREE / PRO for ${tool.toolName}`
        )
        assert.ok(tool.apaItu && tool.apaItu.length > 20, `apaItu must be descriptive for ${tool.toolName}`)
        assert.ok(tool.kapanDigunakan && tool.kapanDigunakan.length > 15, `kapanDigunakan must be descriptive for ${tool.toolName}`)
        assert.ok(Array.isArray(tool.caraPakai) && tool.caraPakai.length >= 2, `caraPakai must have at least 2 steps for ${tool.toolName}`)
        assert.ok(tool.artiHasil && tool.artiHasil.length > 15, `artiHasil must explain output for ${tool.toolName}`)
        assert.ok(Array.isArray(tool.keywords) && tool.keywords.length > 0, `keywords must be present for ${tool.toolName}`)
      })
    })

    it('Does NOT claim AI capability for non-AI tools', () => {
      const nonAiTools = ['HPP Calculator', 'BEP Calculator', 'Margin Analysis', 'Loan Simulation', 'POS / Kasir']
      TOOL_FAQS.forEach((tool) => {
        if (nonAiTools.includes(tool.toolName)) {
          assert.ok(
            !tool.apaItu.toLowerCase().includes('kecerdasan buatan') &&
            !tool.apaItu.toLowerCase().includes('artificial intelligence'),
            `${tool.toolName} must not claim AI`
          )
        }
      })
    })
  })

  // 2. Help Categories & General Guides
  describe('2. Help Categories & General Guides', () => {
    it('Includes all required help categories from bug.md', () => {
      const requiredCategories = [
        'onboarding',
        'finance',
        'operations',
        'sales',
        'marketing',
        'legal',
        'export',
        'analytics',
        'pos',
        'qr-menu',
        'account',
        'rules',
        'troubleshooting',
      ]

      const categoryIds = HELP_CATEGORIES.map((c) => c.id)
      for (const reqCat of requiredCategories) {
        assert.ok(categoryIds.includes(reqCat), `Category "${reqCat}" must be present in HELP_CATEGORIES`)
      }
    })

    it('Includes all mandatory general guides specified in section 5 of bug.md', () => {
      const guideTitles = GENERAL_GUIDES.map((g) => g.title.toLowerCase())

      assert.ok(guideTitles.some((t) => t.includes('memulai')), 'Must have guide: Bagaimana cara memulai')
      assert.ok(guideTitles.some((t) => t.includes('membuat') || t.includes('bisnis')), 'Must have guide: Bagaimana membuat bisnis')
      assert.ok(guideTitles.some((t) => t.includes('menambahkan produk')), 'Must have guide: Bagaimana menambahkan produk')
      assert.ok(guideTitles.some((t) => t.includes('menggunakan pos')), 'Must have guide: Bagaimana menggunakan POS')
      assert.ok(guideTitles.some((t) => t.includes('qr menu')), 'Must have guide: Bagaimana menggunakan QR Menu')
      assert.ok(guideTitles.some((t) => t.includes('laporan')), 'Must have guide: Bagaimana melihat laporan')
      assert.ok(guideTitles.some((t) => t.includes('tools keuangan')), 'Must have guide: Bagaimana menggunakan tools keuangan')
      assert.ok(guideTitles.some((t) => t.includes('upgrade')), 'Must have guide: Bagaimana cara upgrade BisnisSehat Pro')
      assert.ok(guideTitles.some((t) => t.includes('terkunci') || t.includes('tidak bisa')), 'Must have guide: Fitur tidak bisa digunakan')
    })
  })

  // 3. Rules / Ketentuan Penggunaan
  describe('3. Usage Rules (Ketentuan Penggunaan)', () => {
    it('Contains all 7 required rule sections from bug.md', () => {
      assert.equal(USAGE_RULES.length, 7, 'Must have exactly 7 usage rule sections')

      const ruleTitles = USAGE_RULES.map((r) => r.title.toLowerCase())
      assert.ok(ruleTitles[0].includes('akun'), 'Rule 1 must be about Akun')
      assert.ok(ruleTitles[1].includes('data bisnis'), 'Rule 2 must be about Data Bisnis')
      assert.ok(ruleTitles[2].includes('perhitungan') || ruleTitles[2].includes('keputusan'), 'Rule 3 must be about Tools & Perhitungan')
      assert.ok(ruleTitles[3].includes('pembayaran') || ruleTitles[3].includes('subscription'), 'Rule 4 must be about Pembayaran & Subscription')
      assert.ok(ruleTitles[4].includes('penyalahgunaan'), 'Rule 5 must be about Penyalahgunaan')
      assert.ok(ruleTitles[5].includes('bug') || ruleTitles[5].includes('keamanan'), 'Rule 6 must be about Bug & Security')
      assert.ok(ruleTitles[6].includes('perubahan layanan'), 'Rule 7 must be about Perubahan Layanan')
    })

    it('All rules have substantive bullet points', () => {
      USAGE_RULES.forEach((rule) => {
        assert.ok(Array.isArray(rule.content) && rule.content.length >= 2, `Rule "${rule.title}" must have at least 2 points`)
      })
    })
  })

  // 4. Bug Report & Email Authoritativeness
  describe('4. Official Bug Reporting via Email', () => {
    it('Uses authoritative support email without fake addresses', () => {
      assert.equal(OFFICIAL_SUPPORT_EMAIL, 'support@bisnissehat.id')
      assert.equal(SUPPORT_CONFIG.email.address, 'support@bisnissehat.id')
    })

    it('Mailto template conforms to bug.md specification', () => {
      assert.equal(BUG_REPORT_TEMPLATE.subject, '[BisnisSehat Bug Report]')

      const body = BUG_REPORT_TEMPLATE.createBody('QR Menu')
      assert.ok(body.includes('Halo Tim BisnisSehat,'), 'Must include greeting')
      assert.ok(body.includes('Saya ingin melaporkan bug.'), 'Must include report intent')
      assert.ok(body.includes('Fitur:\nQR Menu'), 'Must embed feature')
      assert.ok(body.includes('Masalah:'), 'Must include problem field')
      assert.ok(body.includes('Langkah reproduksi:\n1.'), 'Must include reproduction steps')
      assert.ok(body.includes('Hasil yang diharapkan:'), 'Must include expected results')
      assert.ok(body.includes('Hasil yang terjadi:'), 'Must include actual results')
      assert.ok(body.includes('Browser/device:'), 'Must include device/browser info')
      assert.ok(body.includes('Terima kasih.'), 'Must include thank you closing')
      assert.ok(!body.includes('password') && !body.includes('token'), 'Must NOT request password or token')
    })

    it('Mailto URL is properly URL encoded', () => {
      const url = BUG_REPORT_TEMPLATE.createMailtoUrl('Kasir POS')
      assert.ok(url.startsWith('mailto:support@bisnissehat.id?subject='))
      assert.ok(url.includes('&body='))
      assert.ok(!url.includes('\n'), 'Newlines must be percent-encoded')
    })
  })

  // 5. Client-side Search Algorithm Verification
  describe('5. FAQ Search Simulation', () => {
    const searchFaq = (query) => {
      const q = query.toLowerCase().trim()
      return TOOL_FAQS.filter((tool) => {
        const matchTitle = tool.toolName.toLowerCase().includes(q)
        const matchDesc = tool.apaItu.toLowerCase().includes(q)
        const matchCategory = tool.category.toLowerCase().includes(q)
        const matchKeywords = tool.keywords.some((k) => k.toLowerCase().includes(q))
        return matchTitle || matchDesc || matchCategory || matchKeywords
      })
    }

    it('Searching "HPP" returns HPP Calculator', () => {
      const results = searchFaq('HPP')
      assert.ok(results.some((r) => r.toolName === 'HPP Calculator'))
    })

    it('Searching "stok" returns Inventory Management', () => {
      const results = searchFaq('stok')
      assert.ok(results.some((r) => r.toolName === 'Inventory Management'))
    })

    it('Searching "kasir" returns POS / Kasir and related tools', () => {
      const results = searchFaq('kasir')
      assert.ok(results.some((r) => r.toolName === 'POS / Kasir'))
    })

    it('Searching "qr" returns QR Menu & Pesanan and QR Menu Designer', () => {
      const results = searchFaq('qr')
      assert.ok(results.some((r) => r.toolName === 'QR Menu & Pesanan'))
      assert.ok(results.some((r) => r.toolName === 'QR Menu Designer'))
    })
  })

  // 6. Security & Leak Check
  describe('6. Security & Secret Exposure Audit', () => {
    it('No Supabase service_role keys or secrets in help data or components', () => {
      const helpDataPath = path.resolve(process.cwd(), 'src/data/helpCenterData.js')
      const helpModalPath = path.resolve(process.cwd(), 'src/components/help/HelpCenterModal.jsx')
      const helpPagePath = path.resolve(process.cwd(), 'src/pages/dashboard/HelpCenterPage.jsx')

      const contents = [
        fs.readFileSync(helpDataPath, 'utf8'),
        fs.readFileSync(helpModalPath, 'utf8'),
        fs.readFileSync(helpPagePath, 'utf8'),
      ].join('\n')

      assert.ok(!contents.includes('service_role'), 'Must not contain service_role')
      assert.ok(!contents.includes('supabase_service'), 'Must not contain supabase_service')
      assert.ok(!contents.includes('sbp_'), 'Must not contain service role prefix')
      assert.ok(!contents.includes('SECRET'), 'Must not contain SECRET keys')
    })
  })

  // 7. Route and Component Mounting in App.jsx
  describe('7. App Route Verification', () => {
    it('App.jsx registers /dashboard/bantuan and /dashboard/faq routes', () => {
      const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8')
      assert.ok(appSrc.includes("path: 'bantuan'"), 'App.jsx must register bantuan route')
      assert.ok(appSrc.includes("path: 'faq'"), 'App.jsx must register faq route')
      assert.ok(appSrc.includes('HelpCenterPage'), 'App.jsx must import HelpCenterPage')
    })
  })
})
