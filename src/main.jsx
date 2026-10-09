import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { registerVitePreloadErrorHandler } from './lib/chunkRetry'

// Register global chunk load recovery — handles vite:preloadError, unhandledrejection,
// and script/link error events before React mounts
registerVitePreloadErrorHandler()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

