import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DASHBOARD_PATH = path.resolve('src/pages/dashboard/DashboardHome.jsx')
const APP_PATH = path.resolve('src/App.jsx')
const POS_PAGE_PATH = path.resolve('src/pages/dashboard/pos/PosPage.jsx')
const CATEGORIES_PATH = path.resolve('src/data/categories.js')

describe('POS / Kasir Direct Flow & Regression Tests (pos.md)', () => {
  it('1. Tombol Dashboard: "Buka Kasir POS" navigates directly to /dashboard/pos', () => {
    const dashboardContent = fs.readFileSync(DASHBOARD_PATH, 'utf-8')
    assert.match(
      dashboardContent,
      /to="\/dashboard\/pos"[\s\S]*?Buka Kasir POS/,
      'Dashboard CTA must link directly to /dashboard/pos'
    )
  })

  it('2. Routing /dashboard/pos directly mounts POSPage without intermediate selector wrapper', () => {
    const appContent = fs.readFileSync(APP_PATH, 'utf-8')
    assert.match(
      appContent,
      /path:\s*'pos',\s*element:\s*<POSPage\s*\/>/,
      'App route for pos must directly mount POSPage'
    )
    assert.doesNotMatch(
      appContent,
      /path:\s*'pos\/select'|path:\s*'pos\/mode'/,
      'No selector subroutes should exist'
    )
  })

  it('3. POSPage directly renders cashier UI (search, categories, product grid, cart, checkout)', () => {
    const posContent = fs.readFileSync(POS_PAGE_PATH, 'utf-8')
    // Title
    assert.match(posContent, /POS \/ Kasir/, 'Must have unified POS / Kasir header')
    // Search
    assert.match(posContent, /placeholder="Cari produk\.\.\."/, 'Must provide immediate product search input')
    // Categories filter
    assert.match(posContent, /filterCategory === 'all'/, 'Must provide category filter bar with "Semua"')
    // Cart & Order
    assert.match(posContent, /Pesanan/, 'Must provide direct cart section')
    assert.match(posContent, /addToCart/, 'Must provide direct product click-to-cart functionality')
    assert.match(posContent, /handleSubmitOrder/, 'Must provide direct checkout/order submission flow')
  })

  it('4. No redundant "Pilih POS", "Pilih Kasir", or "POS atau Kasir" dialogs or selectors', () => {
    const posContent = fs.readFileSync(POS_PAGE_PATH, 'utf-8')
    const dashboardContent = fs.readFileSync(DASHBOARD_PATH, 'utf-8')

    const forbiddenPatterns = [
      /Pilih POS/i,
      /Pilih Kasir/i,
      /POS atau Kasir/i,
      /pilih mode/i,
      /mode=pos/i,
      /mode=kasir/i,
    ]

    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(
        posContent,
        pattern,
        `PosPage must not contain selector pattern: ${pattern}`
      )
      assert.doesNotMatch(
        dashboardContent,
        pattern,
        `Dashboard must not contain selector pattern: ${pattern}`
      )
    }
  })

  it('5. Unified conceptual identity: POS = Kasir in categories and navigation', () => {
    const catContent = fs.readFileSync(CATEGORIES_PATH, 'utf-8')
    assert.match(
      catContent,
      /{\s*name:\s*'POS \/ Kasir',\s*path:\s*'\/dashboard\/pos'\s*}/,
      'Categories must define POS / Kasir as a single unified tool linking to /dashboard/pos'
    )
  })
})
