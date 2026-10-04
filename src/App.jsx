import { Suspense } from 'react'
import { lazy } from './lib/chunkRetry'
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
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import AdminLayout from './components/admin/AdminLayout'
import LoadingScreen from './components/LoadingScreen'
import ActivateCreditPage from './pages/ActivateCreditPage'
import TentangKamiPage from './pages/TentangKamiPage'
import RequireOnboarding from './components/RequireOnboarding'
import RequireSubscription from './components/RequireSubscription'
import MaintenanceGate from './components/MaintenanceGate'
import NotFoundPage from './pages/NotFoundPage'
import PublicMenuPage from './pages/public/PublicMenuPage'
import PublicProductDetailPage from './pages/public/PublicProductDetailPage'

// ── Lazy-loaded Admin Pages ──
const AdminDashboardOverview = lazy(() => import('./pages/admin/AdminDashboardOverview'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminUserDetailPage = lazy(() => import('./pages/admin/AdminUserDetailPage'))
const AdminBusinessesPage = lazy(() => import('./pages/admin/AdminBusinessesPage'))
const AdminBusinessDetailPage = lazy(() => import('./pages/admin/AdminBusinessDetailPage'))
const AdminSubscriptionsPage = lazy(() => import('./pages/admin/AdminSubscriptionsPage'))
const AdminSubscriptionDetailPage = lazy(() => import('./pages/admin/AdminSubscriptionDetailPage'))
const AdminActivationCodesPage = lazy(() => import('./pages/admin/AdminActivationCodesPage'))
const AdminAIUsagePage = lazy(() => import('./pages/admin/AdminAIUsagePage'))
const AdminSupportPage = lazy(() => import('./pages/admin/AdminSupportPage'))
const AdminSupportDetailPage = lazy(() => import('./pages/admin/AdminSupportDetailPage'))
const AdminPaymentsPage = lazy(() => import('./pages/admin/AdminPaymentsPage'))
const AdminPaymentDetailPage = lazy(() => import('./pages/admin/AdminPaymentDetailPage'))
const AdminAuditLogsPage = lazy(() => import('./pages/admin/AdminAuditLogsPage'))
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'))
const AdminFooterSocialLinksPage = lazy(() => import('./pages/admin/AdminFooterSocialLinksPage'))
const AdminPlaceholderPage = lazy(() => import('./pages/admin/AdminPlaceholderPage'))
const AdminCreditActivationsPage = lazy(() => import('./pages/admin/AdminCreditActivationsPage'))

// ── Lazy-loaded Dashboard Pages ──
const DashboardHome = lazy(() => import('./pages/dashboard/DashboardHome'))
const ProfilePage = lazy(() => import('./pages/dashboard/ProfilePage'))
const CategoryPage = lazy(() => import('./pages/dashboard/CategoryPage'))
const AllToolsPage = lazy(() => import('./pages/dashboard/AllToolsPage'))
const ExportCenterPage = lazy(() => import('./pages/dashboard/ExportCenterPage'))
const HelpCenterPage = lazy(() => import('./pages/dashboard/HelpCenterPage'))
const QRMenuPage = lazy(() => import('./pages/dashboard/pos/QRMenuPage'))
const QRMenuPublishedPage = lazy(() => import('./pages/dashboard/pos/QRMenuPublishedPage'))
const QRMenuDesignerPage = lazy(() => import('./pages/dashboard/pos/QRMenuDesignerPage'))
const ProductManager = lazy(() => import('./pages/dashboard/pos/ProductManager'))
const CategoryManager = lazy(() => import('./pages/dashboard/pos/CategoryManager'))
const TableManager = lazy(() => import('./pages/dashboard/pos/TableManager'))
const POSPage = lazy(() => import('./pages/dashboard/pos/PosPage'))
const OrderHistory = lazy(() => import('./pages/dashboard/pos/OrderHistory'))
const ReceiptSettingsPage = lazy(() => import('./pages/dashboard/pos/ReceiptSettingsPage'))
const HPPCalculator = lazy(() => import('./pages/dashboard/keuangan/HPPCalculator'))
const MarginAnalysis = lazy(() => import('./pages/dashboard/keuangan/MarginAnalysis'))
const BEPCalculator = lazy(() => import('./pages/dashboard/keuangan/BepCalculator'))
const CashFlowForecastPage = lazy(() => import('./pages/dashboard/keuangan/CashFlowForecastPage'))
const TaxPlanning = lazy(() => import('./pages/dashboard/keuangan/TaxPlanning'))
const FinancialReports = lazy(() => import('./pages/dashboard/keuangan/FinancialReports'))
const AnomalyDetection = lazy(() => import('./pages/dashboard/keuangan/AnomalyDetection'))
const FinancialHealthScore = lazy(() => import('./pages/dashboard/keuangan/FinancialHealthScore'))
const LoanSimulation = lazy(() => import('./pages/dashboard/keuangan/LoanSimulation'))
const CustomerCRM = lazy(() => import('./pages/dashboard/penjualan/CustomerCRM'))
const InvoiceFollowUp = lazy(() => import('./pages/dashboard/penjualan/InvoiceFollowUp'))
const LoyaltyProgram = lazy(() => import('./pages/dashboard/penjualan/LoyaltyProgram'))
const WhatsAppSalesTracker = lazy(() => import('./pages/dashboard/penjualan/WhatsAppSalesTracker'))
const LegalitasPage = lazy(() => import('./pages/dashboard/legalitas/LegalitasPage'))
const InventoryPage = lazy(() => import('./pages/dashboard/operasional/InventoryPage'))
const SupplierDatabasePage = lazy(() => import('./pages/dashboard/operasional/SupplierDatabasePage'))
const ProductionCapacityPlanner = lazy(() => import('./pages/dashboard/operasional/ProductionCapacityPlanner'))
const TelegramOperasionalPage = lazy(() => import('./pages/dashboard/operasional/TelegramOperasionalPage'))
const ExcelPenjualanPage = lazy(() => import('./pages/dashboard/operasional/ExcelPenjualanPage'))
const WhatsAppOperasionalPage = lazy(() => import('./pages/dashboard/operasional/WhatsAppOperasionalPage'))
const CreativeStudioPage = lazy(() => import('./pages/dashboard/marketing/CreativeStudioPage'))
const CreativeCreditsPage = lazy(() => import('./pages/dashboard/marketing/CreativeCreditsPage'))
const CompetitorAnalysisPage = lazy(() => import('./pages/dashboard/marketing/CompetitorAnalysisPage'))
const AdsPage = lazy(() => import('./pages/dashboard/marketing/AdsPage'))
const SeoOptimizerPage = lazy(() => import('./pages/dashboard/marketing/SeoOptimizerPage'))
const ContentCalendarPage = lazy(() => import('./pages/dashboard/marketing/ContentCalendarPage'))
const ABTestingPage = lazy(() => import('./pages/dashboard/marketing/ABTestingPage'))
const RealtimeDashboard = lazy(() => import('./pages/dashboard/analytics/RealtimeDashboard'))
const BenchmarkingPage = lazy(() => import('./pages/dashboard/analytics/BenchmarkingPage'))
const WeeklyRecapPage = lazy(() => import('./pages/dashboard/analytics/WeeklyRecapPage'))
const AiBusinessAnalystPage = lazy(() => import('./pages/ai/AiBusinessAnalystPage'))

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
            <Suspense fallback={<LoadingScreen />}>
              <AllToolsPage />
            </Suspense>
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
                  { index: true, element: <Suspense fallback={<LoadingScreen />}><AiBusinessAnalystPage isStandalone={true} /></Suspense> },
                  { path: 'chat', element: <Suspense fallback={<LoadingScreen />}><AiBusinessAnalystPage isStandalone={true} /></Suspense> },
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
