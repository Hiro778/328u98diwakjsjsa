// src/__tests__/customerSupportWidget.test.js
// Customer Support Floating Widget Regression Test Suite (bug.md & cs.md)
// Tests all requirements:
// 1. Widget structure & component presence
// 2. Fixed viewport positioning (bottom-4 right-4 sm:bottom-6 sm:right-6)
// 3. Panel opening on trigger
// 4. Panel toggling/closing on second click
// 5. Escape key handling
// 6. WhatsApp strictly REMOVED from Customer Support Widget
// 7. Pusat Bantuan & FAQ and Email Bug Report channels verified
// 8. No duplicate support widgets in codebase
// 9. Mobile ergonomics & safe bottom-action spacing
// 10. Design system integration (BisnisSehat branding)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SUPPORT_CONFIG, BUG_REPORT_TEMPLATE, OFFICIAL_SUPPORT_EMAIL } from '../config/supportConfig.js'

describe('Customer Support Floating Widget Specification Suite (bug.md)', () => {

  // 1 & 2. Widget Presence & Fixed Viewport Positioning
  describe('1 & 2. Widget Presence & Fixed Viewport Positioning', () => {
    it('CustomerSupportWidget component exists and is mounted in DashboardLayout', () => {
      const widgetPath = path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx')
      assert.ok(fs.existsSync(widgetPath), 'CustomerSupportWidget.jsx must exist')

      const layoutPath = path.resolve(process.cwd(), 'src/components/DashboardLayout.jsx')
      const layoutSrc = fs.readFileSync(layoutPath, 'utf8')
      assert.ok(layoutSrc.includes('<CustomerSupportWidget />'), 'DashboardLayout must render CustomerSupportWidget')
      assert.ok(layoutSrc.includes("import CustomerSupportWidget from './CustomerSupportWidget'"))
    })

    it('Widget uses fixed positioning with responsive coordinates (desktop 24px, mobile 16px)', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(
        widgetSrc.includes('fixed bottom-4 right-4 sm:bottom-6 sm:right-6'),
        'Must specify fixed bottom-4 right-4 on mobile and sm:bottom-6 sm:right-6 on desktop'
      )
    })

    it('Uses z-index layer that stays visible but does NOT cover modal overlays (z-35 < z-50)', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(widgetSrc.includes('z-35'), 'Must use z-35 to stay below modals (z-50) but above standard content')
    })
  })

  // 3, 4 & 5. Click Toggle & Keyboard Accessibility
  describe('3, 4 & 5. Interaction, Toggling & Escape Key Accessibility', () => {
    it('Button specifies aria-label="Customer Support" and dynamic aria-expanded', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(widgetSrc.includes('aria-label="Customer Support"'), 'Must have aria-label="Customer Support"')
      assert.ok(widgetSrc.includes('aria-expanded={isOpen}'), 'Must have dynamic aria-expanded state')
      assert.ok(widgetSrc.includes('aria-haspopup="dialog"'), 'Must indicate popup dialog capability')
    })

    it('Includes keyboard listener for Escape key to close open support panel', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(
        widgetSrc.includes("e.key === 'Escape' && isOpen"),
        'Must listen for Escape key to close panel'
      )
      assert.ok(
        widgetSrc.includes("window.addEventListener('keydown', handleKeyDown)"),
        'Must attach global keydown listener'
      )
    })

    it('Toggles open state on button click and provides dedicated close button inside panel', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(widgetSrc.includes('onClick={toggleOpen}'), 'Button must toggle open state')
      assert.ok(widgetSrc.includes('data-testid="cs-close-button"'), 'Panel must include close button')
      assert.ok(widgetSrc.includes('onClick={() => setIsOpen(false)}'), 'Close button must dismiss panel')
    })
  })

  // 6 & 7. WhatsApp Removal & Help Center / Bug Report Mailto (bug.md)
  describe('6 & 7. Channels: WhatsApp Removal & Bug Report Email Integration', () => {
    it('WhatsApp CTA, wa.me links, and WhatsApp phone numbers are strictly removed from CustomerSupportWidget', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(!widgetSrc.includes('Chat WhatsApp CS'), 'Chat WhatsApp CS must be removed')
      assert.ok(!widgetSrc.includes('wa.me'), 'wa.me link must not exist in widget')
      assert.ok(!widgetSrc.includes('6281234567890'), 'Fake WhatsApp number must not exist')
      assert.ok(!widgetSrc.includes('Tim Siap Membantu'), '"Tim Siap Membantu" status must be removed')
      assert.ok(!widgetSrc.includes('< 15 menit'), 'Unverified SLA "< 15 menit" must be removed')
    })

    it('Provides dedicated "Cari Bantuan", "Pusat Bantuan & FAQ", and "Lapor Bug via Email" actions', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(widgetSrc.includes('data-testid="cs-search-channel"'), 'Must contain Cari Bantuan button')
      assert.ok(widgetSrc.includes('data-testid="cs-faq-channel"'), 'Must contain FAQ & Help Center button')
      assert.ok(widgetSrc.includes('data-testid="cs-bug-report-channel"'), 'Must contain Lapor Bug via Email link')
    })

    it('Bug report links to official support email with [BisnisSehat Bug Report] subject and structured body', () => {
      assert.equal(OFFICIAL_SUPPORT_EMAIL, 'support@bisnissehat.id')
      assert.equal(SUPPORT_CONFIG.email.address, 'support@bisnissehat.id')
      assert.equal(BUG_REPORT_TEMPLATE.subject, '[BisnisSehat Bug Report]')

      const mailtoUrl = BUG_REPORT_TEMPLATE.createMailtoUrl('Kasir POS')
      assert.ok(mailtoUrl.startsWith('mailto:support@bisnissehat.id?'), 'Must point to support@bisnissehat.id')
      assert.ok(mailtoUrl.includes(encodeURIComponent('[BisnisSehat Bug Report]')), 'Subject must be [BisnisSehat Bug Report]')
      assert.ok(mailtoUrl.includes(encodeURIComponent('Langkah reproduksi')), 'Body must contain structured template')
      assert.ok(mailtoUrl.includes(encodeURIComponent('Kasir POS')), 'Feature name must be embedded in body')
    })
  })

  // 8. No Duplicate Widgets
  describe('8. Single Support Widget Enforcement', () => {
    it('Ensures no duplicate floating support or chat widgets exist across the source tree', () => {
      const srcDir = path.resolve(process.cwd(), 'src')
      let matchingComponents = []

      const scanDirectory = (dir) => {
        const files = fs.readdirSync(dir, { withFileTypes: true })
        for (const file of files) {
          const fullPath = path.join(dir, file.name)
          if (file.isDirectory() && file.name !== '__tests__') {
            scanDirectory(fullPath)
          } else if (file.isFile() && (file.name.endsWith('.jsx') || file.name.endsWith('.js'))) {
            const content = fs.readFileSync(fullPath, 'utf8')
            if (
              content.includes('aria-label="Customer Support"') &&
              !fullPath.includes('CustomerSupportWidget.jsx')
            ) {
              matchingComponents.push(fullPath)
            }
          }
        }
      }

      scanDirectory(srcDir)
      assert.equal(
        matchingComponents.length,
        0,
        `Found duplicate customer support widget definitions: ${matchingComponents.join(', ')}`
      )
    })
  })

  // 9. Mobile Safe Spacing & Layout
  describe('9. Mobile Spacing & Layout Ergonomics', () => {
    it('CustomerSupportWidget has compact dimensions (12x12 mobile, 14x14 desktop)', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(
        widgetSrc.includes('h-12 w-12 sm:h-14 sm:w-14'),
        'Button size must be 48-56px conforming to cs.md ergonomics'
      )
    })

    it('Support popover panel width is bounded to 320px with max-w viewport constraint', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(
        widgetSrc.includes('w-[320px] max-w-[calc(100vw-32px)]'),
        'Popover width must be 320px and prevent viewport overflow on mobile'
      )
    })
  })

  // 10. Design System & Branding Isolation
  describe('10. BisnisSehat Design System & No Atlas Cloud Branding Leak', () => {
    it('CustomerSupportWidget strictly avoids Atlas Cloud branding or logo copies', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(!widgetSrc.includes('Atlas Cloud'), 'Must NOT display "Atlas Cloud" text in UI')
      assert.ok(!widgetSrc.includes('atlascloud.ai'), 'Must NOT link to Atlas Cloud website')
    })

    it('Uses BisnisSehat design system tokens (bg-primary, bg-surface, text-text-primary, border-border)', () => {
      const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerSupportWidget.jsx'), 'utf8')
      assert.ok(widgetSrc.includes('bg-primary'), 'Must use BisnisSehat bg-primary')
      assert.ok(widgetSrc.includes('bg-surface'), 'Must use BisnisSehat bg-surface')
      assert.ok(widgetSrc.includes('border-border'), 'Must use BisnisSehat border-border')
    })
  })
})
