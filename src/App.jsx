import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import PricingPage from './pages/PricingPage'
import DashboardLayout from './components/DashboardLayout'
import DashboardHome from './pages/dashboard/DashboardHome'
import ProfilePage from './pages/dashboard/ProfilePage'
import CategoryPage from './pages/dashboard/CategoryPage'
import AllToolsPage from './pages/dashboard/AllToolsPage'
import ExportCenterPage from './pages/dashboard/ExportCenterPage'
import HelpCenterPage from './pages/dashboard/HelpCenterPage'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import AdminLayout from './components/admin/AdminLayout'
import AdminDashboardOverview from './pages/admin/AdminDashboardOverview'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage'
import AdminBusinessesPage from './pages/admin/AdminBusinessesPage'
import AdminBusinessDetailPage from './pages/admin/AdminBusinessDetailPage'
import AdminSubscriptionsPage from './pages/admin/AdminSubscriptionsPage'
import AdminSubscriptionDetailPage from './pages/admin/AdminSubscriptionDetailPage'
import AdminActivationCodesPage from './pages/admin/AdminActivationCodesPage'
import AdminAIUsagePage from './pages/admin/AdminAIUsagePage'
import AdminSupportPage from './pages/admin/AdminSupportPage'
import AdminSupportDetailPage from './pages/admin/AdminSupportDetailPage'
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage'
import AdminPaymentDetailPage from './pages/admin/AdminPaymentDetailPage'
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminFooterSocialLinksPage from './pages/admin/AdminFooterSocialLinksPage'
import AdminPlaceholderPage from './pages/admin/AdminPlaceholderPage'
import AdminCreditActivationsPage from './pages/admin/AdminCreditActivationsPage'
import ActivateCreditPage from './pages/ActivateCreditPage'
import TentangKamiPage from './pages/TentangKamiPage'
import RequireOnboarding from './components/RequireOnboarding'
import RequireSubscription from './components/RequireSubscription'
import MaintenanceGate from './components/MaintenanceGate'
import NotFoundPage from './pages/NotFoundPage'

// POS / QR Menu pages
import QRMenuPage from './pages/dashboard/pos/QRMenuPage'
import QRMenuPublishedPage from './pages/dashboard/pos/QRMenuPublishedPage'
import QRMenuDesignerPage from './pages/dashboard/pos/QRMenuDesignerPage'
import ProductManager from './pages/dashboard/pos/ProductManager'
import CategoryManager from './pages/dashboard/pos/CategoryManager'
import TableManager from './pages/dashboard/pos/TableManager'
import POSPage from './pages/dashboard/pos/PosPage'
import OrderHistory from './pages/dashboard/pos/OrderHistory'
import ReceiptSettingsPage from './pages/dashboard/pos/ReceiptSettingsPage'
import PublicMenuPage from './pages/public/PublicMenuPage'
import PublicProductDetailPage from './pages/public/PublicProductDetailPage'
import HPPCalculator from './pages/dashboard/keuangan/HPPCalculator'
import MarginAnalysis from './pages/dashboard/keuangan/MarginAnalysis'
import BEPCalculator from './pages/dashboard/keuangan/BepCalculator'
import CashFlowForecastPage from './pages/dashboard/keuangan/CashFlowForecastPage'
import TaxPlanning from './pages/dashboard/keuangan/TaxPlanning'
import FinancialReports from './pages/dashboard/keuangan/FinancialReports'
import AnomalyDetection from './pages/dashboard/keuangan/AnomalyDetection'
import FinancialHealthScore from './pages/dashboard/keuangan/FinancialHealthScore'
import LoanSimulation from './pages/dashboard/keuangan/LoanSimulation'
import CustomerCRM from './pages/dashboard/penjualan/CustomerCRM'
import InvoiceFollowUp from './pages/dashboard/penjualan/InvoiceFollowUp'
import LoyaltyProgram from './pages/dashboard/penjualan/LoyaltyProgram'
import WhatsAppSalesTracker from './pages/dashboard/penjualan/WhatsAppSalesTracker'
import LegalitasPage from './pages/dashboard/legalitas/LegalitasPage'
import InventoryPage from './pages/dashboard/operasional/InventoryPage'
import SupplierDatabasePage from './pages/dashboard/operasional/SupplierDatabasePage'
import ProductionCapacityPlanner from './pages/dashboard/operasional/ProductionCapacityPlanner'
import TelegramOperasionalPage from './pages/dashboard/operasional/TelegramOperasionalPage'
import ExcelPenjualanPage from './pages/dashboard/operasional/ExcelPenjualanPage'
import WhatsAppOperasionalPage from './pages/dashboard/operasional/WhatsAppOperasionalPage'
import CreativeStudioPage from './pages/dashboard/marketing/CreativeStudioPage'
import CreativeCreditsPage from './pages/dashboard/marketing/CreativeCreditsPage'
import CompetitorAnalysisPage from './pages/dashboard/marketing/CompetitorAnalysisPage'
import AdsPage from './pages/dashboard/marketing/AdsPage'
import SeoOptimizerPage from './pages/dashboard/marketing/SeoOptimizerPage'
import ContentCalendarPage from './pages/dashboard/marketing/ContentCalendarPage'
import ABTestingPage from './pages/dashboard/marketing/ABTestingPage'
import RealtimeDashboard from './pages/dashboard/analytics/RealtimeDashboard'
import BenchmarkingPage from './pages/dashboard/analytics/BenchmarkingPage'
import WeeklyRecapPage from './pages/dashboard/analytics/WeeklyRecapPage'
import AiBusinessAnalystPage from './pages/ai/AiBusinessAnalystPage'

const router = createBrowserRouter([
  // Authentication infrastructure required for admin recovery (@gas.md)
  {
    path: '/auth',
    element: <AuthPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
  // Admin Control Center (Protected by RequireAuth & RequireAdmin server verification)
  {
    path: '/admin',
    element: <RequireAuth />,
    children: [
      {
        element: <RequireAdmin />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminDashboardOverview /> },
              { path: 'users', element: <AdminUsersPage /> },
              { path: 'users/:id', element: <AdminUserDetailPage /> },
              { path: 'businesses', element: <AdminBusinessesPage /> },
              { path: 'businesses/:id', element: <AdminBusinessDetailPage /> },
              { path: 'subscriptions', element: <AdminSubscriptionsPage /> },
              { path: 'subscriptions/:id', element: <AdminSubscriptionDetailPage /> },
              { path: 'activation-codes', element: <AdminActivationCodesPage /> },
              { path: 'credit-activations', element: <AdminCreditActivationsPage /> },
              { path: 'ai-usage', element: <AdminAIUsagePage /> },
              { path: 'ai-usage/:userId', element: <AdminPlaceholderPage title="User AI Usage Detail" description="Rincian penggunaan model AI, breakdown tools, dan penyesuaian kredit atomik." stage="Tahap 6" /> },
              { path: 'support', element: <AdminSupportPage /> },
              { path: 'support/:id', element: <AdminSupportDetailPage /> },
              { path: 'payments', element: <AdminPaymentsPage /> },
              { path: 'payments/:id', element: <AdminPaymentDetailPage /> },
              { path: 'audit-logs', element: <AdminAuditLogsPage /> },
              { path: 'settings', element: <AdminSettingsPage /> },
              { path: 'footer-social-links', element: <AdminFooterSocialLinksPage /> },
              {
                element: <RequireAdmin requiredRole="SUPER_ADMIN" />,
                children: [
                  { path: 'super-only', element: <AdminPlaceholderPage title="Super Admin Area" description="Area khusus otorisasi SUPER_ADMIN." stage="Super Admin Only" /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  // Centralized Global MaintenanceGate covering public and user application routes (@gas.md & @gl.md)
  {
    element: <MaintenanceGate />,
    children: [
      {
        path: '/',
        element: <LandingPage />,
      },
      {
        path: '/tentang-kami',
        element: <TentangKamiPage />,
      },
      {
        path: '/activate-credit',
        element: <ActivateCreditPage />,
      },
      {
        path: '/test-tools-view',
        element: (
          <div data-theme="dark" className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] p-4 sm:p-8 max-w-7xl mx-auto">
            <AllToolsPage />
          </div>
        ),
      },
      // Public menu (no auth required, but gated during maintenance)
      {
        path: '/menu/:businessId',
        element: <PublicMenuPage />,
      },
      {
        path: '/menu/:businessId/product/:productId',
        element: <PublicProductDetailPage />,
      },
      {
        path: '/onboarding',
        element: <RequireAuth />,
        children: [
          { index: true, element: <OnboardingPage /> },
        ],
      },
      {
        path: '/pricing',
        element: <RequireAuth />,
        children: [
          { index: true, element: <PricingPage /> },
        ],
      },
      {
        path: '/dashboard',
        element: <RequireAuth />,
        children: [
      {
        element: <RequireOnboarding />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { index: true, element: <DashboardHome /> },
              { path: 'profile', element: <ProfilePage /> },
              { path: 'settings', element: <ProfilePage /> },
              { path: 'pembayaran', element: <ProfilePage /> },
              { path: 'semua-tools', element: <AllToolsPage /> },
              { path: 'bantuan', element: <HelpCenterPage /> },
              { path: 'faq', element: <HelpCenterPage /> },

              // General & Category Overview Pages
              { path: 'keuangan', element: <CategoryPage categoryId="finance" /> },
              { path: 'marketing', element: <CategoryPage categoryId="marketing" /> },
              { path: 'operasional', element: <CategoryPage categoryId="operations" /> },
              { path: 'penjualan', element: <CategoryPage categoryId="sales" /> },
              { path: 'analytics', element: <CategoryPage categoryId="analytics" /> },

              // ── TIER 1: BASIC TOOLS (Rp35.000/bln — Standalone Calculators & AI Studio) ──
              {
                element: <RequireSubscription requiredPlan="basic" featureName="Tools Basic" />,
                children: [
                  { path: 'ekspor', element: <ExportCenterPage /> },
                  { path: 'kurs', element: <ExportCenterPage /> },
                  { path: 'keuangan/hpp-calculator', element: <HPPCalculator /> },
                  { path: 'keuangan/hpp', element: <HPPCalculator /> },
                  { path: 'keuangan/bep-calculator', element: <BEPCalculator /> },
                  { path: 'keuangan/bep', element: <BEPCalculator /> },
                  { path: 'keuangan/tax-planning', element: <TaxPlanning /> },
                  { path: 'keuangan/loan-simulation', element: <LoanSimulation /> },
                  { path: 'keuangan/cash-flow-forecast', element: <CashFlowForecastPage /> },
                  { path: 'marketing/content-generator', element: <CreativeStudioPage /> },
                ],
              },

              // ── TIER 2: PRO TOOLS (Rp130.000/bln — DB, POS, AI Credits, Analytics) ──
              {
                element: <RequireSubscription requiredPlan="pro" featureName="Fitur Pro" />,
                children: [
                  // AI Business Analyst (Pro Only)
                  { path: 'ai', element: <AiBusinessAnalystPage isStandalone={false} /> },
                  { path: 'ai/chat', element: <AiBusinessAnalystPage isStandalone={false} /> },

                  // Legalitas
                  { path: 'legalitas', element: <LegalitasPage /> },

                  // Marketing Pro
                  { path: 'marketing/credits', element: <CreativeCreditsPage /> },
                  { path: 'marketing/ads', element: <AdsPage /> },
                  { path: 'marketing/seo-optimizer', element: <SeoOptimizerPage /> },
                  { path: 'marketing/seo', element: <SeoOptimizerPage /> },
                  { path: 'marketing/content-calendar', element: <ContentCalendarPage /> },
                  { path: 'marketing/calendar', element: <ContentCalendarPage /> },
                  { path: 'marketing/google-business', element: <Navigate to="/dashboard/marketing/ads" replace /> },
                  { path: 'marketing/google-business-profile', element: <Navigate to="/dashboard/marketing/ads" replace /> },
                  { path: 'marketing/google-profile', element: <Navigate to="/dashboard/marketing/ads" replace /> },
                  { path: 'marketing/google-business/callback', element: <Navigate to="/dashboard/marketing/ads" replace /> },
                  { path: 'marketing/ab-testing', element: <ABTestingPage /> },
                  { path: 'marketing/ab-testing/:id', element: <ABTestingPage /> },
                  { path: 'marketing/competitor-analysis', element: <CompetitorAnalysisPage /> },

                  // Keuangan Pro
                  { path: 'keuangan/margin-analysis', element: <MarginAnalysis /> },
                  { path: 'keuangan/financial-reports', element: <FinancialReports /> },
                  { path: 'keuangan/anomaly-detection', element: <AnomalyDetection /> },
                  { path: 'keuangan/financial-health-score', element: <FinancialHealthScore /> },

                  // Operasional Pro
                  { path: 'operasional/inventory', element: <InventoryPage /> },
                  { path: 'operasional/suppliers', element: <SupplierDatabasePage /> },
                  { path: 'operasional/telegram', element: <TelegramOperasionalPage /> },
                  { path: 'operasional/excel-penjualan', element: <ExcelPenjualanPage /> },
                  { path: 'operasional/production-capacity', element: <ProductionCapacityPlanner /> },
                  { path: 'operasional/whatsapp', element: <WhatsAppOperasionalPage /> },

                  // Penjualan & CRM Pro
                  { path: 'penjualan/customer-crm', element: <CustomerCRM /> },
                  { path: 'penjualan/invoice-follow-up', element: <InvoiceFollowUp /> },
                  { path: 'penjualan/loyalty-program', element: <LoyaltyProgram /> },
                  { path: 'penjualan/whatsapp-sales-tracker', element: <WhatsAppSalesTracker /> },

                  // Analytics Pro
                  { path: 'analytics/realtime', element: <RealtimeDashboard /> },
                  { path: 'analytics/benchmarking', element: <BenchmarkingPage /> },
                  { path: 'analytics/weekly-recap', element: <WeeklyRecapPage /> },

                  // POS / QR Menu Pro
                  { path: 'pos', element: <POSPage /> },
                  { path: 'pos/qr-menu', element: <QRMenuPage /> },
                  { path: 'pos/qr-menu/published', element: <QRMenuPublishedPage /> },
                  { path: 'pos/qr-menu/designer', element: <QRMenuDesignerPage /> },
                  { path: 'pos/products', element: <ProductManager /> },
                  { path: 'pos/categories', element: <CategoryManager /> },
                  { path: 'pos/tables', element: <TableManager /> },
                  { path: 'pos/orders', element: <OrderHistory /> },
                  { path: 'pos/receipt-settings', element: <ReceiptSettingsPage /> },
                ],
              },
            ],
          },
        ],
      },
      {
        path: '/ai',
        element: <RequireAuth />,
        children: [
          {
            element: <RequireOnboarding />,
            children: [
              {
                element: <RequireSubscription requiredPlan="pro" featureName="AI Business Analyst" />,
                children: [
                  { index: true, element: <AiBusinessAnalystPage isStandalone={true} /> },
                  { path: 'chat', element: <AiBusinessAnalystPage isStandalone={true} /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <RouterProvider router={router} />
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
