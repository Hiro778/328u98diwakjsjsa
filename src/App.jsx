import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './context/AuthContext'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import PricingPage from './pages/PricingPage'
import DashboardLayout from './components/DashboardLayout'
import DashboardHome from './pages/dashboard/DashboardHome'
import CategoryPage from './pages/dashboard/CategoryPage'
import AllToolsPage from './pages/dashboard/AllToolsPage'
import ExportCenterPage from './pages/dashboard/ExportCenterPage'
import RequireAuth from './components/RequireAuth'
import RequireOnboarding from './components/RequireOnboarding'
import RequireSubscription from './components/RequireSubscription'
import NotFoundPage from './pages/NotFoundPage'

// POS / QR Menu pages
import QRMenuPage from './pages/dashboard/pos/QRMenuPage'
import QRMenuPublishedPage from './pages/dashboard/pos/QRMenuPublishedPage'
import ProductManager from './pages/dashboard/pos/ProductManager'
import CategoryManager from './pages/dashboard/pos/CategoryManager'
import TableManager from './pages/dashboard/pos/TableManager'
import POSPage from './pages/dashboard/pos/POSPage'
import OrderHistory from './pages/dashboard/pos/OrderHistory'
import PublicMenuPage from './pages/public/PublicMenuPage'
import HPPCalculator from './pages/dashboard/keuangan/HPPCalculator'
import MarginAnalysis from './pages/dashboard/keuangan/MarginAnalysis'
import BEPCalculator from './pages/dashboard/keuangan/BEPCalculator'
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
import MarketplaceIntegrationPage from './pages/dashboard/operasional/MarketplaceIntegrationPage'
import MarketplaceCallbackPage from './pages/dashboard/operasional/MarketplaceCallbackPage'
import ProductionCapacityPlanner from './pages/dashboard/operasional/ProductionCapacityPlanner'
import WhatsAppOperasionalPage from './pages/dashboard/operasional/WhatsAppOperasionalPage'
import CreativeStudioPage from './pages/dashboard/marketing/CreativeStudioPage'
import CompetitorAnalysisPage from './pages/dashboard/marketing/CompetitorAnalysisPage'
import GoogleBusinessProfilePage from './pages/dashboard/marketing/GoogleBusinessProfilePage'
import GoogleBusinessCallbackPage from './pages/dashboard/marketing/GoogleBusinessCallbackPage'
import RealtimeDashboard from './pages/dashboard/analytics/RealtimeDashboard'
import BenchmarkingPage from './pages/dashboard/analytics/BenchmarkingPage'
import WeeklyRecapPage from './pages/dashboard/analytics/WeeklyRecapPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/auth',
    element: <AuthPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
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
  // Public menu (no auth required)
  {
    path: '/menu/:businessId',
    element: <PublicMenuPage />,
  },
  {
    path: '/dashboard',
    element: <RequireAuth />,
    children: [
      {
        element: <RequireOnboarding />,
        children: [
          {
            element: <RequireSubscription />,
            children: [
              {
                element: <DashboardLayout />,
                children: [
                  { index: true, element: <DashboardHome /> },
                  { path: 'keuangan', element: <CategoryPage categoryId="finance" /> },
                  { path: 'keuangan/hpp-calculator', element: <HPPCalculator /> },
                  { path: 'keuangan/margin-analysis', element: <MarginAnalysis /> },
              { path: 'keuangan/bep-calculator', element: <BEPCalculator /> },
                  { path: 'keuangan/cash-flow-forecast', element: <CashFlowForecastPage /> },
                  { path: 'keuangan/tax-planning', element: <TaxPlanning /> },
                  { path: 'keuangan/financial-reports', element: <FinancialReports /> },
                  { path: 'keuangan/anomaly-detection', element: <AnomalyDetection /> },
                  { path: 'keuangan/financial-health-score', element: <FinancialHealthScore /> },
                  { path: 'keuangan/loan-simulation', element: <LoanSimulation /> },
                  { path: 'operasional', element: <CategoryPage categoryId="operations" /> },
                  { path: 'operasional/inventory', element: <InventoryPage /> },
                  { path: 'operasional/suppliers', element: <SupplierDatabasePage /> },
                  { path: 'operasional/marketplace', element: <MarketplaceIntegrationPage /> },
                  { path: 'operasional/marketplace/callback', element: <MarketplaceCallbackPage /> },
                  { path: 'operasional/production-capacity', element: <ProductionCapacityPlanner /> },
                  { path: 'operasional/whatsapp', element: <WhatsAppOperasionalPage /> },
                  { path: 'penjualan', element: <CategoryPage categoryId="sales" /> },
                  { path: 'penjualan/customer-crm', element: <CustomerCRM /> },
                  { path: 'penjualan/invoice-follow-up', element: <InvoiceFollowUp /> },
                  { path: 'penjualan/loyalty-program', element: <LoyaltyProgram /> },
                  { path: 'penjualan/whatsapp-sales-tracker', element: <WhatsAppSalesTracker /> },
                  { path: 'marketing', element: <CategoryPage categoryId="marketing" /> },
                  { path: 'marketing/content-generator', element: <CreativeStudioPage /> },
                  { path: 'marketing/competitor-analysis', element: <CompetitorAnalysisPage /> },
                  { path: 'marketing/google-business-profile', element: <GoogleBusinessProfilePage /> },
                  { path: 'marketing/google-business/callback', element: <GoogleBusinessCallbackPage /> },
                  { path: 'legalitas', element: <LegalitasPage /> },
                  { path: 'ekspor', element: <ExportCenterPage /> },
                  { path: 'analytics', element: <CategoryPage categoryId="analytics" /> },
                  { path: 'analytics/realtime', element: <RealtimeDashboard /> },
                  { path: 'analytics/benchmarking', element: <BenchmarkingPage /> },
                  { path: 'analytics/weekly-recap', element: <WeeklyRecapPage /> },
                  { path: 'semua-tools', element: <AllToolsPage /> },
                  // POS / QR Menu routes
                  { path: 'pos', element: <POSPage /> },
                  { path: 'pos/qr-menu', element: <QRMenuPage /> },
                  { path: 'pos/qr-menu/published', element: <QRMenuPublishedPage /> },
                  { path: 'pos/products', element: <ProductManager /> },
                  { path: 'pos/categories', element: <CategoryManager /> },
                  { path: 'pos/tables', element: <TableManager /> },
                  { path: 'pos/orders', element: <OrderHistory /> },
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
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
