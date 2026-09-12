import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { checkLogoSimilarity, uploadLogoImage } from '../../lib/legalitasService'
import LogoCheckUpload from './LogoCheckUpload'
import LogoCheckResults from './LogoCheckResults'
import LegalDisclaimer from './LegalDisclaimer'

export default function LogoCheckTab() {
  const { business } = useAuth()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)

  async function handleAnalyze(file) {
    // Pre-flight: check business
    if (!business?.id) {
      setLoading(false)
      setResults({
        overallStatus: 'ERROR',
        error: 'Data bisnis tidak ditemukan. Pastikan akun terdaftar memiliki bisnis.',
        results: [],
        totalResults: 0,
      })
      return
    }

    // Pre-flight: check session is valid
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        setLoading(false)
        setResults({
          overallStatus: 'ERROR',
          error: 'Sesi Anda tidak ditemukan. Silakan masuk kembali.',
          results: [],
          totalResults: 0,
        })
        return
      }
    } catch {
      setLoading(false)
      setResults({
        overallStatus: 'ERROR',
        error: 'Gagal memverifikasi sesi. Silakan masuk kembali.',
        results: [],
        totalResults: 0,
      })
      return
    }

    setLoading(true)
    setResults(null)

    try {
      // 1. Upload image to Supabase Storage
      const uploadResult = await uploadLogoImage(file, business.id)
      if (uploadResult.error) {
        setResults({
          overallStatus: 'ERROR',
          error: uploadResult.error,
          results: [],
          totalResults: 0,
        })
        setLoading(false)
        return
      }

      // 2. Call logo check Edge Function
      const checkResult = await checkLogoSimilarity({
        imageUrl: uploadResult.url,
        businessName: business.name || '',
        imageFilename: uploadResult.filename,
      })

      if (checkResult.error) {
        setResults({
          overallStatus: 'ERROR',
          error: checkResult.error,
          results: [],
          totalResults: 0,
        })
      } else {
        setResults({
          overallStatus: checkResult.overallStatus || 'ERROR',
          error: checkResult.errorMessage || null,
          results: checkResult.results || [],
          totalResults: checkResult.totalResults || 0,
        })
      }
    } catch (err) {
      setResults({
        overallStatus: 'ERROR',
        error: err.message || 'Terjadi kesalahan',
        results: [],
        totalResults: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <LogoCheckUpload onAnalyze={handleAnalyze} loading={loading} />

      {results && (
        <LogoCheckResults
          overallStatus={results.overallStatus}
          results={results.results}
          totalResults={results.totalResults}
          errorMessage={results.error}
        />
      )}

      <LegalDisclaimer type="logoCheck" />
    </div>
  )
}
