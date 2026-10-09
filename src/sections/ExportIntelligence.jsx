import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ProductCatalogProvider, useProductCatalog } from '../context/ProductCatalogContext'
import LandingState from './ExportIntelligence/LandingState'
import ProductSelector from './ExportIntelligence/ProductSelector'
import AddProductForm from './ExportIntelligence/AddProductForm'
import ExportConfig from './ExportIntelligence/ExportConfig'
import ResultsPanel from './ExportIntelligence/ResultsPanel'
import DestinationInsights from './ExportIntelligence/DestinationInsights'
import { calculateExport } from './ExportIntelligence/calculateExport'

function ExportIntelligenceInner() {
  const { getProduct } = useProductCatalog()
  const [stage, setStage] = useState('LANDING')
  const [selectedProductId, setSelectedProductId] = useState(null)
  const [exportConfig, setExportConfig] = useState(null)
  const [results, setResults] = useState(null)

  const product = selectedProductId ? getProduct(selectedProductId) : null

  function reset() {
    setStage('LANDING')
    setSelectedProductId(null)
    setExportConfig(null)
    setResults(null)
  }

  // Right-side destination based on config or default
  const destForInsights = exportConfig?.destination || 'SG'

  return (
    <section id="export" className="px-5 py-20 sm:px-8 sm:py-28 bg-navy-600 text-cream">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Left — Flow stages */}
          <div>
            <AnimatePresence mode="wait">
              {stage === 'LANDING' && (
                <LandingState
                  key="landing"
                  onStart={() => setStage('PRODUCT_SELECT')}
                />
              )}

              {stage === 'PRODUCT_SELECT' && (
                <ProductSelector
                  key="product-select"
                  selectedProductId={selectedProductId}
                  onSelectProduct={setSelectedProductId}
                  onAddNew={() => setStage('ADD_PRODUCT')}
                  onContinue={() => setStage('CONFIGURE')}
                  onBack={reset}
                />
              )}

              {stage === 'ADD_PRODUCT' && (
                <AddProductForm
                  key="add-product"
                  onBack={() => setStage('PRODUCT_SELECT')}
                  onSave={(p) => {
                    setSelectedProductId(p.id)
                    setStage('CONFIGURE')
                  }}
                />
              )}

              {stage === 'CONFIGURE' && product && (
                <ExportConfig
                  key="configure"
                  product={product}
                  onBack={() => setStage('PRODUCT_SELECT')}
                  onContinue={(config) => {
                    setExportConfig(config)
                    setResults(calculateExport(product, config))
                    setStage('RESULTS')
                  }}
                />
              )}

              {stage === 'RESULTS' && product && exportConfig && results && (
                <ResultsPanel
                  key="results"
                  product={product}
                  config={exportConfig}
                  results={results}
                  onBack={() => setStage('CONFIGURE')}
                  onReset={reset}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Right — Destination insights */}
          <div className="flex flex-col justify-center">
            <p className="mb-4 text-sm font-semibold text-cream/40 uppercase tracking-wider">
              {stage === 'RESULTS' ? 'Negara Tujuan' : 'Pasar Global'}
            </p>
            <DestinationInsights
              selectedDest={destForInsights}
              onSelect={(code) => {
                if (stage === 'CONFIGURE' || stage === 'RESULTS') {
                  setExportConfig((prev) => prev ? { ...prev, destination: code } : prev)
                  if (stage === 'RESULTS' && product && exportConfig) {
                    const updated = { ...exportConfig, destination: code }
                    setResults(calculateExport(product, updated))
                  }
                }
              }}
              interactive={stage === 'CONFIGURE' || stage === 'RESULTS'}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default function ExportIntelligence() {
  return (
    <ProductCatalogProvider>
      <ExportIntelligenceInner />
    </ProductCatalogProvider>
  )
}
