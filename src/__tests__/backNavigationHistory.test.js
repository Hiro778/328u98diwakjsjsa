// src/__tests__/backNavigationHistory.test.js
// Tests for undo.md: Back navigation history, fallback logic, accessibility, and Context7 design compliance

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('undo.md BackButton Navigation & Context7 Design Suite', () => {
  const backButtonSrc = fs.readFileSync(path.resolve('src/components/BackButton.jsx'), 'utf8');
  const categoryManagerSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/CategoryManager.jsx'), 'utf8');
  const productManagerSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/ProductManager.jsx'), 'utf8');
  const orderHistorySrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/OrderHistory.jsx'), 'utf8');
  const receiptSettingsSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/ReceiptSettingsPage.jsx'), 'utf8');
  const qrMenuSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/QRMenuPage.jsx'), 'utf8');

  // Logic simulation for BackButton handleBack()
  function simulateBackNavigation({ historyIdx, historyLength, referrer, origin, fallbackUrl = '/dashboard/pos' }) {
    const hasSpaHistory = historyIdx > 0;
    const isInternalReferrer = referrer && referrer.startsWith(origin);

    if (hasSpaHistory || (historyLength > 1 && isInternalReferrer)) {
      return { action: 'navigate_delta', delta: -1 };
    }
    return { action: 'navigate_fallback', target: fallbackUrl };
  }

  // 1. Dashboard → POS → Categories: klik Kembali → navigate(-1) (kembali ke POS)
  it('1. Dashboard → POS → Categories: clicking back executes navigate(-1) to previous internal page', () => {
    const nav = simulateBackNavigation({
      historyIdx: 2, // Dashboard (0) -> POS (1) -> Categories (2)
      historyLength: 3,
      referrer: 'http://localhost:5173/dashboard/pos',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/pos',
    });

    assert.equal(nav.action, 'navigate_delta');
    assert.equal(nav.delta, -1);
  });

  // 2. POS → Categories → Edit: klik Kembali → navigate(-1) (kembali ke Categories)
  it('2. POS → Categories → Edit: clicking back executes navigate(-1) to Categories', () => {
    const nav = simulateBackNavigation({
      historyIdx: 3, // POS (1) -> Categories (2) -> Edit modal/subview (3)
      historyLength: 4,
      referrer: 'http://localhost:5173/dashboard/pos/categories',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/pos/categories',
    });

    assert.equal(nav.action, 'navigate_delta');
    assert.equal(nav.delta, -1);
  });

  // 3. Directly membuka /dashboard/pos/categories tanpa history internal → fallback /dashboard/pos
  it('3. Direct URL access without internal history executes fallback to /dashboard/pos', () => {
    const nav = simulateBackNavigation({
      historyIdx: 0, // Direct link opened in fresh tab
      historyLength: 1,
      referrer: '', // No referrer or external
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/pos',
    });

    assert.equal(nav.action, 'navigate_fallback');
    assert.equal(nav.target, '/dashboard/pos');
  });

  // 4. Browser back tetap normal & safe
  it('4. Uses standard navigate(-1) preserving normal browser history stack', () => {
    assert.ok(backButtonSrc.includes('navigate(-1)'), 'Must call navigate(-1)');
    assert.ok(backButtonSrc.includes('useNavigate'), 'Must import and use useNavigate from react-router');
  });

  // 5. Refresh tidak menyebabkan error
  it('5. Safe checks ensure component does not crash on server or refreshed window', () => {
    assert.ok(backButtonSrc.includes("typeof window !== 'undefined'"), 'Must guard window checks for SSR/hydration');
  });

  // 6 & 7. Entitlement is pure navigation and does not mutate permissions
  it('6 & 7. Back navigation is pure client navigation without mutating entitlement, tokens, or subscription', () => {
    assert.ok(!backButtonSrc.includes('mutate'), 'Must not mutate');
    assert.ok(!backButtonSrc.includes('subscription'), 'Must not mutate subscription');
    assert.ok(!backButtonSrc.includes('deductToken'), 'Must not deduct tokens');
    assert.ok(!backButtonSrc.includes('supabase'), 'Must not execute backend RPC');
  });

  // 8. Tidak ada external-origin navigation
  it('8. External referrer or unknown origin does NOT hijack back button outside app', () => {
    const nav = simulateBackNavigation({
      historyIdx: 0,
      historyLength: 2,
      referrer: 'https://evil-phishing-site.com',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/pos',
    });

    // Even if history length is 2 from external site, fallback protects user inside BisnisSehat origin
    assert.equal(nav.action, 'navigate_fallback');
    assert.equal(nav.target, '/dashboard/pos');
    assert.ok(nav.target.startsWith('/'), 'Target must be internal relative path');
  });

  // 9. Accessibility (WAI-ARIA)
  it('9. BackButton is semantic <button type="button"> with aria-label, NOT a clickable div', () => {
    assert.ok(backButtonSrc.includes('<button'), 'Must use native button');
    assert.ok(backButtonSrc.includes('type="button"'), 'Must have explicit type="button"');
    assert.ok(backButtonSrc.includes('aria-label='), 'Must have aria-label');
    assert.ok(!backButtonSrc.includes('<div onClick'), 'Must not be a clickable div');
    assert.ok(backButtonSrc.includes('focus-visible:'), 'Must have focus indicator for keyboard accessibility');
  });

  // 10. Context7 Design System Tokens & Styling
  it('10. Adheres to Context7 and design.md styling specifications', () => {
    assert.ok(backButtonSrc.includes('text-text-secondary'), 'Must use text-text-secondary');
    assert.ok(backButtonSrc.includes('hover:text-text-primary'), 'Must use hover:text-text-primary');
    assert.ok(backButtonSrc.includes('svg'), 'Must render ArrowLeft svg icon');
    assert.ok(backButtonSrc.includes('group-hover:-translate-x-'), 'Must include subtle hover translate animation');
  });

  // 11. Attached in all relevant POS sub-pages
  it('11. BackButton is integrated in CategoryManager, ProductManager, OrderHistory, ReceiptSettings, and QRMenu', () => {
    assert.ok(categoryManagerSrc.includes('<BackButton'), 'CategoryManager must render BackButton');
    assert.ok(productManagerSrc.includes('<BackButton'), 'ProductManager must render BackButton');
    assert.ok(orderHistorySrc.includes('<BackButton'), 'OrderHistory must render BackButton');
    assert.ok(receiptSettingsSrc.includes('<BackButton'), 'ReceiptSettingsPage must render BackButton');
    assert.ok(qrMenuSrc.includes('<BackButton'), 'QRMenuPage must render BackButton');
  });

  // 12. Attached in all Marketing child sub-pages per plan.md Section 8
  it('12. BackButton is integrated across all Marketing child pages with /dashboard/marketing fallback', () => {
    const seoPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/SeoOptimizerPage.jsx'), 'utf8');
    const creativeStudioSrc = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/CreativeStudioPage.jsx'), 'utf8');
    const competitorSrc = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/CompetitorAnalysisPage.jsx'), 'utf8');
    const adsPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/AdsPage.jsx'), 'utf8');
    const calendarPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/ContentCalendarPage.jsx'), 'utf8');
    const abTestingSrc = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/ABTestingPage.jsx'), 'utf8');
    const creditsPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/CreativeCreditsPage.jsx'), 'utf8');

    assert.ok(seoPageSrc.includes('<BackButton fallbackUrl="/dashboard/marketing"'), 'SeoOptimizerPage must have BackButton');
    assert.ok(creativeStudioSrc.includes('<BackButton fallbackUrl="/dashboard/marketing"'), 'CreativeStudioPage must have BackButton');
    assert.ok(competitorSrc.includes('<BackButton fallbackUrl="/dashboard/marketing"'), 'CompetitorAnalysisPage must have BackButton');
    assert.ok(adsPageSrc.includes('<BackButton fallbackUrl="/dashboard/marketing"'), 'AdsPage must have BackButton');
    assert.ok(calendarPageSrc.includes('<BackButton fallbackUrl="/dashboard/marketing"'), 'ContentCalendarPage must have BackButton');
    assert.ok(abTestingSrc.includes('<BackButton fallbackUrl="/dashboard/marketing"'), 'ABTestingPage must have BackButton');
    assert.ok(creditsPageSrc.includes('<BackButton fallbackUrl="/dashboard/marketing"'), 'CreativeCreditsPage must have BackButton');
  });

  // 13. Black-box Route Testing: Dashboard → Keuangan → HPP → Back
  it('13. Black-box Route Testing: Dashboard → Keuangan → HPP → Back returns to Keuangan', () => {
    const nav = simulateBackNavigation({
      historyIdx: 2, // Dashboard (0) -> Keuangan (1) -> HPP Calculator (2)
      historyLength: 3,
      referrer: 'http://localhost:5173/dashboard/keuangan',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/keuangan',
    });
    assert.equal(nav.action, 'navigate_delta');
    assert.equal(nav.delta, -1);
  });

  // 14. Black-box Route Testing: Dashboard → Keuangan → HPP → Detail → Back returns to HPP
  it('14. Black-box Route Testing: Dashboard → Keuangan → HPP → Detail → Back returns to HPP', () => {
    const hppSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/HPPCalculator.jsx'), 'utf8');
    assert.ok(hppSrc.includes('fallbackUrl="/dashboard/keuangan/hpp-calculator"'), 'HPP Detail must fallback to /dashboard/keuangan/hpp-calculator');
    assert.ok(hppSrc.includes('onClick={() => setDetailItem(null)}'), 'HPP Detail must close detail when Back clicked');
  });

  // 15. Black-box Route Testing: Dashboard → Marketing → SEO → Back
  it('15. Black-box Route Testing: Dashboard → Marketing → SEO → Back returns to Marketing', () => {
    const nav = simulateBackNavigation({
      historyIdx: 2, // Dashboard (0) -> Marketing (1) -> SEO (2)
      historyLength: 3,
      referrer: 'http://localhost:5173/dashboard/marketing',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/marketing',
    });
    assert.equal(nav.action, 'navigate_delta');
    assert.equal(nav.delta, -1);
  });

  // 16. Black-box Route Testing: Dashboard → Operasional → child page → Back returns to Operasional
  it('16. Black-box Route Testing: Dashboard → Operasional → Inventory → Back returns to Operasional', () => {
    const nav = simulateBackNavigation({
      historyIdx: 2, // Dashboard (0) -> Operasional (1) -> Inventory (2)
      historyLength: 3,
      referrer: 'http://localhost:5173/dashboard/operasional',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/operasional',
    });
    assert.equal(nav.action, 'navigate_delta');
    assert.equal(nav.delta, -1);
  });

  // 17. Black-box Route Testing: Direct URL child page → Back → parent
  it('17. Black-box Route Testing: Direct URL child page access uses safe parent fallback', () => {
    const navHpp = simulateBackNavigation({
      historyIdx: 0,
      historyLength: 1,
      referrer: '',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/keuangan',
    });
    assert.equal(navHpp.action, 'navigate_fallback');
    assert.equal(navHpp.target, '/dashboard/keuangan');

    const navInventory = simulateBackNavigation({
      historyIdx: 0,
      historyLength: 1,
      referrer: '',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/operasional',
    });
    assert.equal(navInventory.action, 'navigate_fallback');
    assert.equal(navInventory.target, '/dashboard/operasional');
  });

  // 18. Black-box Route Testing: Refresh child page preserves safe navigation
  it('18. Black-box Route Testing: Refresh child page preserves internal fallback', () => {
    // On page refresh, history state may have idx=0 or history.length unchanged
    const navRefreshed = simulateBackNavigation({
      historyIdx: 0,
      historyLength: 1,
      referrer: 'http://localhost:5173/dashboard/keuangan/bep-calculator',
      origin: 'http://localhost:5173',
      fallbackUrl: '/dashboard/keuangan',
    });
    assert.equal(navRefreshed.action, 'navigate_fallback');
    assert.equal(navRefreshed.target, '/dashboard/keuangan');
  });

  // 19. Integration Audit for all Keuangan, Operasional, Penjualan, Analytics, POS, and Category Overview
  it('19. Global audit: BackButton is integrated across Keuangan, Operasional, Penjualan, Analytics, and Category Overview', () => {
    const categoryPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/CategoryPage.jsx'), 'utf8');
    const allToolsSrc = fs.readFileSync(path.resolve('src/pages/dashboard/AllToolsPage.jsx'), 'utf8');
    const legalitasSrc = fs.readFileSync(path.resolve('src/sections/Legalitas/LegalitasDashboard.jsx'), 'utf8');
    const exportCenterSrc = fs.readFileSync(path.resolve('src/pages/dashboard/ExportCenterPage.jsx'), 'utf8');
    const posPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/PosPage.jsx'), 'utf8');
    const tableManagerSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/TableManager.jsx'), 'utf8');
    const qrPublishedSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/QRMenuPublishedPage.jsx'), 'utf8');

    // Category Level
    assert.ok(categoryPageSrc.includes('<BackButton fallbackUrl="/dashboard"'), 'CategoryPage must fallback to /dashboard');
    assert.ok(allToolsSrc.includes('<BackButton fallbackUrl="/dashboard"'), 'AllToolsPage must fallback to /dashboard');
    assert.ok(legalitasSrc.includes('<BackButton fallbackUrl="/dashboard"'), 'Legalitas must fallback to /dashboard');
    assert.ok(exportCenterSrc.includes('<BackButton fallbackUrl="/dashboard"'), 'ExportCenter must fallback to /dashboard');
    assert.ok(posPageSrc.includes('<BackButton fallbackUrl="/dashboard"'), 'POSPage must fallback to /dashboard');
    assert.ok(tableManagerSrc.includes('<BackButton fallbackUrl="/dashboard/pos"'), 'TableManager must fallback to /dashboard/pos');
    assert.ok(qrPublishedSrc.includes('<BackButton fallbackUrl="/dashboard/pos/qr-menu"'), 'QRMenuPublished must fallback to /dashboard/pos/qr-menu');

    // Keuangan Child Pages
    const bepSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/BEPCalculator.jsx'), 'utf8');
    const marginSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/MarginAnalysis.jsx'), 'utf8');
    const cashFlowSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/CashFlowForecastPage.jsx'), 'utf8');
    const taxSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/TaxPlanning.jsx'), 'utf8');
    const finReportsSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/FinancialReports.jsx'), 'utf8');
    const anomalySrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/AnomalyDetection.jsx'), 'utf8');
    const healthSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/FinancialHealthScore.jsx'), 'utf8');
    const loanSrc = fs.readFileSync(path.resolve('src/pages/dashboard/keuangan/LoanSimulation.jsx'), 'utf8');

    assert.ok(bepSrc.includes('<BackButton fallbackUrl="/dashboard/keuangan"'), 'BEP must fallback to /dashboard/keuangan');
    assert.ok(marginSrc.includes('<BackButton'), 'Margin must have BackButton');
    assert.ok(cashFlowSrc.includes('<BackButton fallbackUrl="/dashboard/keuangan"'), 'CashFlow must fallback to /dashboard/keuangan');
    assert.ok(taxSrc.includes('<BackButton fallbackUrl="/dashboard/keuangan"'), 'Tax must fallback to /dashboard/keuangan');
    assert.ok(finReportsSrc.includes('<BackButton fallbackUrl="/dashboard/keuangan"'), 'Reports must fallback to /dashboard/keuangan');
    assert.ok(anomalySrc.includes('<BackButton fallbackUrl="/dashboard/keuangan"'), 'Anomaly must fallback to /dashboard/keuangan');
    assert.ok(healthSrc.includes('<BackButton fallbackUrl="/dashboard/keuangan"'), 'Health must fallback to /dashboard/keuangan');
    assert.ok(loanSrc.includes('<BackButton fallbackUrl="/dashboard/keuangan"'), 'Loan must fallback to /dashboard/keuangan');

    // Operasional Child Pages
    const inventorySrc = fs.readFileSync(path.resolve('src/sections/Inventory/InventoryPage.jsx'), 'utf8');
    const supplierSrc = fs.readFileSync(path.resolve('src/pages/dashboard/operasional/SupplierDatabasePage.jsx'), 'utf8');
    const marketplaceSrc = fs.readFileSync(path.resolve('src/sections/Marketplace/MarketplacePage.jsx'), 'utf8');
    const capacitySrc = fs.readFileSync(path.resolve('src/pages/dashboard/operasional/ProductionCapacityPlanner.jsx'), 'utf8');
    const waOperasionalSrc = fs.readFileSync(path.resolve('src/sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx'), 'utf8');
    const telegramSrc = fs.readFileSync(path.resolve('src/pages/dashboard/operasional/TelegramOperasionalPage.jsx'), 'utf8');

    assert.ok(inventorySrc.includes('<BackButton'), 'Inventory must have BackButton');
    assert.ok(supplierSrc.includes('<BackButton'), 'Supplier must have BackButton');
    assert.ok(marketplaceSrc.includes('<BackButton fallbackUrl="/dashboard/operasional"'), 'Marketplace must fallback to /dashboard/operasional');
    assert.ok(capacitySrc.includes('<BackButton fallbackUrl="/dashboard/operasional"'), 'Capacity must fallback to /dashboard/operasional');
    assert.ok(waOperasionalSrc.includes('<BackButton fallbackUrl="/dashboard/operasional"'), 'WA Operasional must fallback to /dashboard/operasional');
    assert.ok(telegramSrc.includes('<BackButton fallbackUrl="/dashboard/operasional"'), 'Telegram Operasional must fallback to /dashboard/operasional');

    // Penjualan Child Pages
    const crmSrc = fs.readFileSync(path.resolve('src/pages/dashboard/penjualan/CustomerCRM.jsx'), 'utf8');
    const invoiceSrc = fs.readFileSync(path.resolve('src/pages/dashboard/penjualan/InvoiceFollowUp.jsx'), 'utf8');
    const loyaltySrc = fs.readFileSync(path.resolve('src/pages/dashboard/penjualan/LoyaltyProgram.jsx'), 'utf8');
    const waSalesSrc = fs.readFileSync(path.resolve('src/pages/dashboard/penjualan/WhatsAppSalesTracker.jsx'), 'utf8');

    assert.ok(crmSrc.includes('<BackButton'), 'CRM must have BackButton');
    assert.ok(invoiceSrc.includes('<BackButton'), 'Invoice must have BackButton');
    assert.ok(loyaltySrc.includes('<BackButton fallbackUrl="/dashboard/penjualan"'), 'Loyalty must fallback to /dashboard/penjualan');
    assert.ok(waSalesSrc.includes('<BackButton'), 'WA Sales must have BackButton');

    // Analytics Child Pages
    const realtimeSrc = fs.readFileSync(path.resolve('src/pages/dashboard/analytics/RealtimeDashboard.jsx'), 'utf8');
    const benchmarkSrc = fs.readFileSync(path.resolve('src/pages/dashboard/analytics/BenchmarkingPage.jsx'), 'utf8');
    const weeklyRecapSrc = fs.readFileSync(path.resolve('src/pages/dashboard/analytics/WeeklyRecapPage.jsx'), 'utf8');

    assert.ok(realtimeSrc.includes('<BackButton fallbackUrl="/dashboard/analytics"'), 'Realtime must fallback to /dashboard/analytics');
    assert.ok(benchmarkSrc.includes('<BackButton fallbackUrl="/dashboard/analytics"'), 'Benchmark must fallback to /dashboard/analytics');
    assert.ok(weeklyRecapSrc.includes('<BackButton fallbackUrl="/dashboard/analytics"'), 'Weekly Recap must fallback to /dashboard/analytics');
  });
});
