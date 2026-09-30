import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import QRGenerator from '../../../components/pos/QRGenerator'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import BackButton from '../../../components/BackButton'

export default function TableManager() {
  const { business } = useAuth()
  const { toast, showToast } = useToast()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [tableName, setTableName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [qrTable, setQrTable] = useState(null)

  const menuUrl = business?.id
    ? `${window.location.origin}/menu/${business.id}`
    : ''

  useEffect(() => {
    if (business?.id) loadTables()
  }, [business?.id])

  async function loadTables() {
    const { data } = await supabase
      .from('tables')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order', { ascending: true })

    setTables(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!tableName.trim()) {
      setError('Nama meja wajib diisi')
      return
    }

    setSaving(true)
    setError('')

    const maxOrder = tables.length > 0 ? Math.max(...tables.map(t => t.sort_order)) + 1 : 0
    const { error: insErr } = await supabase
      .from('tables')
      .insert({
        business_id: business.id,
        name: tableName.trim(),
        sort_order: maxOrder,
      })

    if (insErr) { setError(insErr.message); setSaving(false); return }

    setSaving(false)
    setTableName('')
    setShowForm(false)
    showToast('Meja berhasil ditambahkan!', 'success')
    loadTables()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus meja ini?')) return
    const { error } = await supabase.from('tables').delete().eq('id', id)
    if (error) {
      showToast('Gagal menghapus meja.', 'error')
      return
    }
    showToast('Meja berhasil dihapus.', 'success')
    loadTables()
    if (qrTable?.id === id) setQrTable(null)
  }

  async function handleToggleActive(id, current) {
    const { error } = await supabase
      .from('tables')
      .update({ is_active: !current })
      .eq('id', id)
    if (error) {
      showToast('Gagal mengubah status meja.', 'error')
      return
    }
    loadTables()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />
      <BackButton fallbackUrl="/dashboard/pos" label="Kembali" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Meja</h1>
          <p className="mt-1 text-sm text-text-secondary">Kelola meja dan generate QR untuk pemesanan.</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setTableName(''); setError('') }}
          className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          + Tambah Meja
        </button>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
            >
              <h2 className="text-lg font-bold text-navy-700">Tambah Meja</h2>
              <div className="mt-4">
                <label className="text-xs font-medium text-text-muted">Nama Meja</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="Contoh: Meja 01"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  autoFocus
                />
                {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
                >
                  Batal
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
                >
                  {saving ? 'Menambahkan...' : 'Tambah'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Preview Modal */}
      <AnimatePresence>
        {qrTable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-3 sm:p-5"
            onClick={() => setQrTable(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-xl"
            >
              <h2 className="text-lg font-bold text-navy-700">QR — {qrTable.name}</h2>
              <p className="mt-1 text-xs text-text-muted">
                Scan untuk membuka menu di meja ini.
              </p>
              <div className="mt-4 flex justify-center">
                <QRGenerator
                  url={`${menuUrl}?table=${encodeURIComponent(qrTable.name)}`}
                  tableName={qrTable.name}
                />
              </div>
              <button
                onClick={() => setQrTable(null)}
                className="mt-6 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
              >
                Tutup
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table List */}
      {tables.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada meja</p>
          <p className="mt-2 text-sm text-text-muted">Tambahkan meja untuk generate QR pemesanan.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map(t => (
            <motion.div
              key={t.id}
              layout
              className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 transition-all ${
                t.is_active ? 'border-border' : 'border-border opacity-60'
              }`}
            >
              <div className="flex-1">
                <p className="text-sm font-bold text-navy-700">{t.name}</p>
                <span className={`text-[10px] font-semibold ${
                  t.is_active ? 'text-profit-600' : 'text-text-muted'
                }`}>
                  {t.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setQrTable(t)}
                  className="rounded-lg bg-warm-50 px-2.5 py-1.5 text-[10px] font-semibold text-warm-500 transition-colors hover:bg-warm-100"
                  title="Lihat QR"
                >
                  QR
                </button>
                <button
                  onClick={() => handleToggleActive(t.id, t.is_active)}
                  className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700"
                  title={t.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                >
                  {t.is_active ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
