import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ProductCatalogProvider } from './context/ProductCatalogContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ProductCatalogProvider>
      <App />
    </ProductCatalogProvider>
  </StrictMode>,
)
