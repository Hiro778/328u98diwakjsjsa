import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { checkBusinessLegalitas, confirmCheckResult } from '../../lib/legalitasService'
import { LEGAL_LINKS } from '../../lib/officialLegalLinks'
import LegalCheckSearch from './LegalCheckSearch'
import LegalCheckResults from './LegalCheckResults'
import LogoCheckTab from './LogoCheckTab'
import LegalDisclaimer from './LegalDisclaimer'

const TABS = [
  { id: 'sources', label: 'Cek Legalitas Usaha', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'logo', label: 'Cek Logo & Kemiripan', icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z' },
]

export default function LegalitasDashboard() {
  const { business } = useAuth()
  const [activeTab, setActiveTab] = useState('sources')

  // Source check state
  const [searchValues, setSearchValues] = useState({})
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState(null)

  async function handleSearch(input) {
    if (!business?.id) return

    setLoading(true)
    setError(null)
    setSearchValues(input)
    setResults([])

    try {
      console.log('[LEGALITAS] submit started', { businessName: input.businessName })
      const result = await checkBusinessLegalitas(input)
      console.log('[LEGALITAS] response received', { hasError: !!result.error, resultsCount: result.results?.length })

      if (result.error) {
        console.error('[LEGALITAS] service error:', result.error)
        setError(result.error)
        setLoading(false)
        return
      }

      setResults(result.results || [])
      setHasSearched(true)
    } catch (err) {
      console.error('[LEGALITAS] unexpected error:', err)
      setError('Terjadi kesalahan tidak terduga. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(resultId, confirmedNumber) {
    const { error } = await confirmCheckResult(resultId, confirmedNumber)

    if (!error) {
      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? {
                ...r,
                user_confirmed: true,
                confirmed_number: confirmedNumber || null,
                confirmed_at: new Date().toISOString(),
              }
            : r
        )
      )
    }
  }

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-profit-500">
          Legal & Compliance
        </p>
        <h1 className="text-2xl font-extrabold text-navy-700">Legal & Brand Checker</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Periksa legalitas usaha dari berbagai sumber resmi, dan analisis kemiripan logo Anda.
        </p>
      </motion.div>

      {/* Tab Bar */}
      <div className="mt-6 flex gap-1 rounded-xl border border-border bg-cream p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-warm-400 text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface'
            }`}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'sources' && (
        <div className="mt-6 space-y-6">
          <LegalCheckSearch
            onSearch={handleSearch}
            loading={loading}
            initialValues={searchValues}
          />

          {/* Error Display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-red-200 bg-red-50 p-4"
            >
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-700">Gagal melakukan pemeriksaan</p>
                  <p className="mt-1 text-xs text-red-600">{error}</p>
                  <button
                    type="button"
                    onClick={() => handleSearch(searchValues)}
                    className="mt-2 text-xs font-semibold text-red-700 underline hover:text-red-800"
                  >
                    Coba lagi
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {hasSearched && !error && (
            <LegalCheckResults
              results={results}
              loading={loading}
              searchQuery={searchValues.businessName || ''}
              onConfirm={handleConfirm}
            />
          )}

          {/* Portal Links */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-border bg-surface p-5"
          >
            <h2 className="text-sm font-bold text-navy-700">Portal Resmi Terkait</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { key: 'oss', label: 'OSS (NIB)' },
                { key: 'ahu', label: 'AHU (Nama Usaha)' },
                { key: 'djki', label: 'DJKI (Merek)' },
                { key: 'pirt', label: 'BPOM (Produk)' },
                { key: 'halal', label: 'BPJPH (Halal)' },
                { key: 'pdki', label: 'PDKI (Cari Merek)' },
              ].map(({ key, label }) => {
                const link = LEGAL_LINKS[key]
                if (!link) return null
                return (
                  <a
                    key={key}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-electric-200 bg-electric-50 px-3 py-1.5 text-[11px] font-semibold text-electric-600 transition-all hover:border-electric-300 hover:bg-electric-100"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {label}
                  </a>
                )
              })}
            </div>
          </motion.div>

          <LegalDisclaimer type="sourceCheck" />
        </div>
      )}

      {activeTab === 'logo' && (
        <div className="mt-6">
          <LogoCheckTab />
        </div>
      )}
    </div>
  )
}
