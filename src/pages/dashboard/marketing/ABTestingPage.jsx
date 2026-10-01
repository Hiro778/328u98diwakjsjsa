import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import DateInput from '../../../components/DateInput'
import useToast from '../../../hooks/useToast'
import {
  CHANNELS,
  METRICS,
  STATUSES,
  listExperiments,
  createExperiment,
  getExperiment,
  updateExperiment,
  startExperiment,
  completeExperiment,
  archiveExperiment,
  deleteExperiment,
  saveResults,
  calculateMetrics,
  compareMetric,
  validateExperiment,
  isEditable,
  canRecordResults,
  isReadOnly,
  canDelete,
} from '../../../services/abTestingService'

// ─────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.draft}`}>
      {STATUSES[status] || status}
    </span>
  )
}

// ─────────────────────────────────────────────────────────
// EMPTY FORM STATE
// ─────────────────────────────────────────────────────────

function emptyForm() {
  return {
    name: '',
    objective: '',
    channel: '',
    primary_metric: '',
    custom_metric: '',
    start_at: '',
    end_at: '',
    variantA: { name: '', content: '' },
    variantB: { name: '', content: '' },
  }
}

function emptyResultForm() {
  return {
    impressions: '',
    clicks: '',
    conversions: '',
    engagement: '',
    leads: '',
    revenue: '',
    purchases: '',
  }
}

// ─────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────

function fmt(num, decimals = 2) {
  if (num === null || num === undefined) return '—'
  return Number(num).toFixed(decimals)
}

function fmtPct(num) {
  if (num === null || num === undefined) return '—'
  const sign = num > 0 ? '+' : ''
  return `${sign}${Number(num).toFixed(2)}%`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ─────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────

export default function ABTestingPage() {
  const navigate = useNavigate()
  const { id: routeId } = useParams()
  const { toast, showToast } = useToast()
  const { business } = useAuth()
  const businessId = business?.id

  // ── view: 'list' | 'create' | 'edit' | 'detail'
  const [view, setView] = useState(routeId ? 'detail' : 'list')

  // ── list state
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState(null)

  // ── detail state
  const [currentExp, setCurrentExp] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  // ── form state (create / edit)
  const [form, setForm] = useState(emptyForm())
  const [formErrors, setFormErrors] = useState({})
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // ── result form state
  const [resultFormA, setResultFormA] = useState(emptyResultForm())
  const [resultFormB, setResultFormB] = useState(emptyResultForm())
  const [resultSaving, setResultSaving] = useState(false)
  const [resultError, setResultError] = useState(null)
  const [resultSuccess, setResultSuccess] = useState(null)

  // ── action loading
  const [actionLoading, setActionLoading] = useState(null) // experiment id being actioned
  const [confirmDelete, setConfirmDelete] = useState(null)

  // ─────────────────────────────────────────────────────
  // LOAD LIST & ROUTE SYNC
  // ─────────────────────────────────────────────────────

  useEffect(() => {
    if (businessId) {
      loadList()
    }
  }, [businessId])

  useEffect(() => {
    if (businessId && routeId) {
      setView('detail')
      loadDetail(routeId)
    } else if (businessId && !routeId && view === 'detail') {
      setView('list')
    }
  }, [businessId, routeId])

  async function loadList() {
    setLoading(true)
    setListError(null)
    const { data, error } = await listExperiments(businessId)
    setLoading(false)
    if (error) {
      setListError('Gagal memuat daftar eksperimen. Silakan coba lagi.')
    } else {
      setExperiments(data)
    }
  }

  // ─────────────────────────────────────────────────────
  // LOAD DETAIL
  // ─────────────────────────────────────────────────────

  async function loadDetail(id) {
    setDetailLoading(true)
    setDetailError(null)
    const { data, error } = await getExperiment(id, businessId)
    setDetailLoading(false)
    if (error) {
      setDetailError('Gagal memuat detail eksperimen.')
    } else {
      setCurrentExp(data)
      // Pre-populate result forms from existing results
      if (data.results && data.variants) {
        const varA = data.variants.find(v => v.variant_key === 'A')
        const varB = data.variants.find(v => v.variant_key === 'B')
        const resA = data.results.find(r => r.variant_id === varA?.id)
        const resB = data.results.find(r => r.variant_id === varB?.id)
        if (resA) setResultFormA(toResultFormState(resA))
        if (resB) setResultFormB(toResultFormState(resB))
      }
    }
  }

  function toResultFormState(res) {
    return {
      impressions: res.impressions ?? '',
      clicks: res.clicks ?? '',
      conversions: res.conversions ?? '',
      engagement: res.engagement ?? '',
      leads: res.leads ?? '',
      revenue: res.revenue ?? '',
      purchases: res.purchases ?? '',
    }
  }

  // ─────────────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────────────

  function openCreate() {
    setForm(emptyForm())
    setFormErrors({})
    setFormError(null)
    setView('create')
  }

  function openEdit(exp) {
    const varA = exp.variants?.find(v => v.variant_key === 'A') || {}
    const varB = exp.variants?.find(v => v.variant_key === 'B') || {}
    setForm({
      name: exp.name || '',
      objective: exp.objective || '',
      channel: exp.channel || '',
      primary_metric: exp.primary_metric || '',
      custom_metric: exp.custom_metric || '',
      start_at: exp.start_at ? exp.start_at.slice(0, 10) : '',
      end_at: exp.end_at ? exp.end_at.slice(0, 10) : '',
      variantA: { name: varA.name || '', content: varA.content || '' },
      variantB: { name: varB.name || '', content: varB.content || '' },
    })
    setFormErrors({})
    setFormError(null)
    setCurrentExp(exp)
    setView('edit')
  }

  async function openDetail(exp) {
    setView('detail')
    setResultFormA(emptyResultForm())
    setResultFormB(emptyResultForm())
    setResultError(null)
    setResultSuccess(null)
    navigate(`/dashboard/marketing/ab-testing/${exp.id}`)
    await loadDetail(exp.id)
  }

  function goToList() {
    setView('list')
    setCurrentExp(null)
    setDetailError(null)
    setResultSuccess(null)
    setResultError(null)
    navigate('/dashboard/marketing/ab-testing')
  }

  // ─────────────────────────────────────────────────────
  // FORM HANDLERS
  // ─────────────────────────────────────────────────────

  function handleFormChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function handleVariantChange(variant, field, value) {
    setForm(prev => ({
      ...prev,
      [variant]: { ...prev[variant], [field]: value },
    }))
    const errKey = `${variant}_${field}`
    if (formErrors[errKey]) setFormErrors(prev => ({ ...prev, [errKey]: undefined }))
  }

  async function handleCreate() {
    const validation = validateExperiment(form)
    if (!validation.valid) {
      setFormErrors(validation.errors)
      return
    }
    setFormSaving(true)
    setFormError(null)
    const payload = {
      ...form,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
      custom_metric: form.primary_metric === 'Custom' ? form.custom_metric : null,
    }
    const { data, error } = await createExperiment(businessId, payload)
    setFormSaving(false)
    if (error) {
      setFormError(`Gagal membuat eksperimen: ${error.message}`)
    } else {
      await loadList()
      await openDetail(data)
    }
  }

  async function handleUpdate() {
    if (!currentExp) return
    const validation = validateExperiment(form)
    if (!validation.valid) {
      setFormErrors(validation.errors)
      return
    }
    setFormSaving(true)
    setFormError(null)
    const payload = {
      ...form,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
      custom_metric: form.primary_metric === 'Custom' ? form.custom_metric : null,
    }
    const { error } = await updateExperiment(currentExp.id, businessId, payload)
    setFormSaving(false)
    if (error) {
      setFormError(`Gagal menyimpan perubahan: ${error.message}`)
    } else {
      await loadList()
      await openDetail(currentExp)
    }
  }

  // ─────────────────────────────────────────────────────
  // LIFECYCLE ACTIONS
  // ─────────────────────────────────────────────────────

  async function handleStart(exp) {
    setActionLoading(exp.id)
    const { error } = await startExperiment(exp.id, businessId)
    setActionLoading(null)
    if (error) {
      showToast(`Gagal memulai eksperimen: ${error.message}`, 'error')
    } else {
      showToast('Eksperimen berhasil dimulai.', 'success')
      await loadList()
      if (currentExp?.id === exp.id) await loadDetail(exp.id)
    }
  }

  async function handleComplete(exp) {
    if (!window.confirm('Selesaikan eksperimen ini? Status akan berubah ke Completed.')) return
    setActionLoading(exp.id)
    const { error } = await completeExperiment(exp.id, businessId)
    setActionLoading(null)
    if (error) {
      showToast(`Gagal menyelesaikan eksperimen: ${error.message}`, 'error')
    } else {
      showToast('Eksperimen berhasil diselesaikan.', 'success')
      await loadList()
      if (currentExp?.id === exp.id) await loadDetail(exp.id)
    }
  }

  async function handleArchive(exp) {
    if (!window.confirm('Arsipkan eksperimen ini? Eksperimen tidak dapat diedit setelah diarsipkan.')) return
    setActionLoading(exp.id)
    const { error } = await archiveExperiment(exp.id, businessId)
    setActionLoading(null)
    if (error) {
      showToast(`Gagal mengarsipkan eksperimen: ${error.message}`, 'error')
    } else {
      showToast('Eksperimen berhasil diarsipkan.', 'success')
      await loadList()
      if (currentExp?.id === exp.id) await loadDetail(exp.id)
    }
  }

  async function handleDelete(exp) {
    if (!exp) return
    setConfirmDelete(null)
    setActionLoading(exp.id)
    const { error } = await deleteExperiment(exp.id, businessId)
    setActionLoading(null)
    if (error) {
      showToast('Eksperimen gagal dihapus. Coba lagi.', 'error')
    } else {
      showToast('Eksperimen berhasil dihapus.', 'success')
      if (view === 'detail' || routeId) {
        navigate('/dashboard/marketing/ab-testing')
        goToList()
      }
      await loadList()
    }
  }

  // ─────────────────────────────────────────────────────
  // RESULT SAVE
  // ─────────────────────────────────────────────────────

  async function handleSaveResults() {
    if (!currentExp) return
    const varA = currentExp.variants?.find(v => v.variant_key === 'A')
    const varB = currentExp.variants?.find(v => v.variant_key === 'B')
    if (!varA || !varB) return

    setResultSaving(true)
    setResultError(null)
    setResultSuccess(null)

    const [resA, resB] = await Promise.all([
      saveResults(currentExp.id, varA.id, businessId, resultFormA),
      saveResults(currentExp.id, varB.id, businessId, resultFormB),
    ])

    setResultSaving(false)

    if (resA.error || resB.error) {
      setResultError('Gagal menyimpan data. Periksa koneksi dan coba lagi.')
    } else {
      setResultSuccess('Data berhasil disimpan.')
      await loadDetail(currentExp.id)
    }
  }

  // ─────────────────────────────────────────────────────
  // RENDER: LOADING SKELETON
  // ─────────────────────────────────────────────────────

  if (!businessId) {
    return (
      <div className="p-6 text-center text-text-muted">
        Silakan login dan selesaikan onboarding untuk mengakses fitur ini.
      </div>
    )
  }

  // ─────────────────────────────────────────────────────
  // RENDER: FORM (Create / Edit)
  // ─────────────────────────────────────────────────────

  if (view === 'create' || view === 'edit') {
    const isEdit = view === 'edit'
    return (
      <div className="p-6 max-w-3xl mx-auto">
        {toast && (
          <div className={`fixed top-4 right-4 z-[70] rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:border-emerald-800 dark:text-emerald-300'
          }`}>
            {toast.message}
          </div>
        )}
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={isEdit ? () => openDetail(currentExp) : goToList}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-navy-700 dark:hover:text-white mb-3"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali
          </button>
          <h1 className="text-2xl font-extrabold text-navy-700 dark:text-white">
            {isEdit ? 'Edit Eksperimen' : 'Buat Eksperimen A/B'}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {isEdit
              ? 'Hanya eksperimen berstatus Draft yang dapat diedit.'
              : 'Isi form berikut untuk memulai eksperimen A/B baru.'}
          </p>
        </div>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-navy-700 dark:text-white uppercase tracking-wide">
              Informasi Dasar
            </h2>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Nama Eksperimen <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => handleFormChange('name', e.target.value)}
                placeholder="e.g. Test Judul Promo Ramadhan"
                className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary ${formErrors.name ? 'border-red-400' : 'border-border'}`}
              />
              {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Tujuan / Hipotesis <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.objective}
                onChange={e => handleFormChange('objective', e.target.value)}
                placeholder="e.g. Menguji apakah CTA 'Beli Sekarang' lebih baik dari 'Dapatkan Diskon'"
                rows={3}
                className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary resize-none ${formErrors.objective ? 'border-red-400' : 'border-border'}`}
              />
              {formErrors.objective && <p className="mt-1 text-xs text-red-500">{formErrors.objective}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Channel / Platform <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.channel}
                  onChange={e => handleFormChange('channel', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary ${formErrors.channel ? 'border-red-400' : 'border-border'}`}
                >
                  <option value="">Pilih channel</option>
                  {CHANNELS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {formErrors.channel && <p className="mt-1 text-xs text-red-500">{formErrors.channel}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Metrik Utama <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.primary_metric}
                  onChange={e => handleFormChange('primary_metric', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary ${formErrors.primary_metric ? 'border-red-400' : 'border-border'}`}
                >
                  <option value="">Pilih metrik</option>
                  {METRICS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {formErrors.primary_metric && <p className="mt-1 text-xs text-red-500">{formErrors.primary_metric}</p>}
              </div>
            </div>

            {form.primary_metric === 'Custom' && (
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Nama Metrik Kustom <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.custom_metric}
                  onChange={e => handleFormChange('custom_metric', e.target.value)}
                  placeholder="e.g. Sign-ups, Form Submissions"
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary ${formErrors.custom_metric ? 'border-red-400' : 'border-border'}`}
                />
                {formErrors.custom_metric && <p className="mt-1 text-xs text-red-500">{formErrors.custom_metric}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Tanggal Mulai</label>
                <DateInput
                  value={form.start_at}
                  onChange={e => handleFormChange('start_at', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Tanggal Akhir</label>
                <DateInput
                  value={form.end_at}
                  onChange={e => handleFormChange('end_at', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary ${formErrors.end_at ? 'border-red-400' : 'border-border'}`}
                />
                {formErrors.end_at && <p className="mt-1 text-xs text-red-500">{formErrors.end_at}</p>}
              </div>
            </div>
          </div>

          {/* Variants */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Variant A */}
            <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-xs font-bold flex items-center justify-center">A</span>
                <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Variant A</h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Nama <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.variantA.name}
                  onChange={e => handleVariantChange('variantA', 'name', e.target.value)}
                  placeholder="e.g. CTA: Beli Sekarang"
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary ${formErrors.variantA_name ? 'border-red-400' : 'border-border'}`}
                />
                {formErrors.variantA_name && <p className="mt-1 text-xs text-red-500">{formErrors.variantA_name}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Konten / Deskripsi <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.variantA.content}
                  onChange={e => handleVariantChange('variantA', 'content', e.target.value)}
                  placeholder="Jelaskan isi atau penawaran Variant A"
                  rows={4}
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary resize-none ${formErrors.variantA_content ? 'border-red-400' : 'border-border'}`}
                />
                {formErrors.variantA_content && <p className="mt-1 text-xs text-red-500">{formErrors.variantA_content}</p>}
              </div>
            </div>

            {/* Variant B */}
            <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-bold flex items-center justify-center">B</span>
                <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Variant B</h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Nama <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.variantB.name}
                  onChange={e => handleVariantChange('variantB', 'name', e.target.value)}
                  placeholder="e.g. CTA: Dapatkan Diskon"
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary ${formErrors.variantB_name ? 'border-red-400' : 'border-border'}`}
                />
                {formErrors.variantB_name && <p className="mt-1 text-xs text-red-500">{formErrors.variantB_name}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Konten / Deskripsi <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.variantB.content}
                  onChange={e => handleVariantChange('variantB', 'content', e.target.value)}
                  placeholder="Jelaskan isi atau penawaran Variant B"
                  rows={4}
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary resize-none ${formErrors.variantB_content ? 'border-red-400' : 'border-border'}`}
                />
                {formErrors.variantB_content && <p className="mt-1 text-xs text-red-500">{formErrors.variantB_content}</p>}
              </div>
            </div>
          </div>

          {/* Error */}
          {formError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={isEdit ? () => openDetail(currentExp) : goToList}
              className="px-5 py-2 text-sm text-text-muted hover:text-navy-700 dark:hover:text-white transition-colors"
            >
              Batal
            </button>
            <button
              onClick={isEdit ? handleUpdate : handleCreate}
              disabled={formSaving}
              className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {formSaving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Buat Eksperimen'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────
  // RENDER: DETAIL VIEW
  // ─────────────────────────────────────────────────────

  if (view === 'detail') {
    if (detailLoading) {
      return (
        <div className="p-6 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-text-muted">Memuat detail eksperimen…</p>
        </div>
      )
    }

    if (detailError) {
      return (
        <div className="p-6 max-w-2xl mx-auto text-center">
          <p className="text-red-500 mb-4">{detailError}</p>
          <button onClick={goToList} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
            Kembali ke Daftar
          </button>
        </div>
      )
    }

    if (!currentExp) return null

    const varA = currentExp.variants?.find(v => v.variant_key === 'A')
    const varB = currentExp.variants?.find(v => v.variant_key === 'B')
    const resA = currentExp.results?.find(r => r.variant_id === varA?.id)
    const resB = currentExp.results?.find(r => r.variant_id === varB?.id)
    const metricsA = calculateMetrics(resA)
    const metricsB = calculateMetrics(resB)

    const readOnly = isReadOnly(currentExp.status)
    const canRecord = canRecordResults(currentExp.status)
    const editable = isEditable(currentExp.status)

    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {toast && (
          <div className={`fixed top-4 right-4 z-[70] rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:border-emerald-800 dark:text-emerald-300'
          }`}>
            {toast.message}
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <button
              onClick={goToList}
              className="flex items-center gap-1.5 text-sm text-text-muted hover:text-navy-700 dark:hover:text-white mb-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Daftar Eksperimen
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold text-navy-700 dark:text-white">{currentExp.name}</h1>
              <StatusBadge status={currentExp.status} />
            </div>
            <p className="text-sm text-text-muted mt-1">
              {currentExp.channel} · {currentExp.primary_metric}
              {currentExp.custom_metric ? ` (${currentExp.custom_metric})` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {editable && (
              <>
                <button
                  onClick={() => openEdit(currentExp)}
                  className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-surface transition-colors text-text-primary"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleStart(currentExp)}
                  disabled={actionLoading === currentExp.id}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === currentExp.id ? 'Memulai…' : 'Mulai Eksperimen'}
                </button>
              </>
            )}
            {currentExp.status === 'running' && (
              <button
                onClick={() => handleComplete(currentExp)}
                disabled={actionLoading === currentExp.id}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === currentExp.id ? 'Memproses…' : 'Selesaikan'}
              </button>
            )}
            {(currentExp.status === 'completed' || currentExp.status === 'running') && (
              <button
                onClick={() => handleArchive(currentExp)}
                disabled={actionLoading === currentExp.id}
                className="px-4 py-2 border border-amber-400 text-amber-600 dark:text-amber-400 text-sm rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
              >
                Arsipkan
              </button>
            )}
            {canDelete(currentExp.status) && (
              <button
                onClick={() => setConfirmDelete(currentExp)}
                disabled={actionLoading === currentExp.id}
                className="px-4 py-2 border border-red-300 text-red-600 dark:text-red-400 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                Hapus
              </button>
            )}
          </div>
        </div>

        {/* Info card */}
        <div className="bg-surface border border-border rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-text-muted mb-0.5">Channel</p>
            <p className="font-medium text-text-primary">{currentExp.channel}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">Metrik Utama</p>
            <p className="font-medium text-text-primary">
              {currentExp.primary_metric}
              {currentExp.custom_metric ? ` — ${currentExp.custom_metric}` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">Mulai</p>
            <p className="font-medium text-text-primary">{fmtDate(currentExp.start_at)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">Akhir</p>
            <p className="font-medium text-text-primary">{fmtDate(currentExp.end_at)}</p>
          </div>
        </div>

        {/* Objective */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs font-medium text-text-muted mb-1">Tujuan / Hipotesis</p>
          <p className="text-sm text-text-primary">{currentExp.objective}</p>
        </div>

        {/* Variant descriptions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-xs font-bold flex items-center justify-center">A</span>
              <span className="text-sm font-semibold text-text-primary">{varA?.name || 'Variant A'}</span>
            </div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{varA?.content || '—'}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-bold flex items-center justify-center">B</span>
              <span className="text-sm font-semibold text-text-primary">{varB?.name || 'Variant B'}</span>
            </div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{varB?.content || '—'}</p>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Performa saat ini</h2>
              <p className="text-xs text-text-muted mt-0.5">Belum merupakan bukti signifikansi statistik.</p>
            </div>
            <span className="text-xs text-text-muted">Data yang dicatat</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-text-muted text-xs font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Metrik</th>
                  <th className="px-4 py-3 text-right">{varA?.name || 'Variant A'}</th>
                  <th className="px-4 py-3 text-right">{varB?.name || 'Variant B'}</th>
                  <th className="px-4 py-3 text-right">Selisih (B−A)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { label: 'Impressions', keyA: resA?.impressions, keyB: resB?.impressions, isRaw: true },
                  { label: 'Clicks', keyA: resA?.clicks, keyB: resB?.clicks, isRaw: true },
                  { label: 'CTR (%)', keyA: metricsA.ctr, keyB: metricsB.ctr },
                  { label: 'Conversions', keyA: resA?.conversions, keyB: resB?.conversions, isRaw: true },
                  { label: 'Conversion Rate (%)', keyA: metricsA.conversionRate, keyB: metricsB.conversionRate },
                  { label: 'Engagement', keyA: resA?.engagement, keyB: resB?.engagement, isRaw: true },
                  { label: 'Engagement Rate (%)', keyA: metricsA.engagementRate, keyB: metricsB.engagementRate },
                  { label: 'Leads', keyA: resA?.leads, keyB: resB?.leads, isRaw: true },
                  { label: 'Purchases', keyA: resA?.purchases, keyB: resB?.purchases, isRaw: true },
                  { label: 'Revenue (Rp)', keyA: resA?.revenue, keyB: resB?.revenue, isRaw: true },
                  { label: 'Revenue/Impression', keyA: metricsA.revenuePerImpression, keyB: metricsB.revenuePerImpression },
                  { label: 'Revenue/Click', keyA: metricsA.revenuePerClick, keyB: metricsB.revenuePerClick },
                ].map(row => {
                  const { diff, pctDiff } = compareMetric(row.keyA ?? null, row.keyB ?? null)
                  const diffColor = diff === null
                    ? 'text-text-muted'
                    : diff > 0
                    ? 'text-green-600 dark:text-green-400'
                    : diff < 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-text-muted'
                  return (
                    <tr key={row.label} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                      <td className="px-4 py-2.5 text-text-secondary font-medium">{row.label}</td>
                      <td className="px-4 py-2.5 text-right text-text-primary font-mono">
                        {row.isRaw ? fmt(row.keyA, 0) : fmt(row.keyA)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-primary font-mono">
                        {row.isRaw ? fmt(row.keyB, 0) : fmt(row.keyB)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${diffColor}`}>
                        {diff === null
                          ? '—'
                          : `${diff > 0 ? '+' : ''}${row.isRaw ? fmt(diff, 0) : fmt(diff)}${pctDiff !== null ? ` (${fmtPct(pctDiff)})` : ''}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Result Entry Form (only for Running experiments) */}
        {canRecord && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Masukkan Data yang dicatat</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Data ini diinput secara manual dari platform masing-masing. Bukan data otomatis.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Form A */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-xs font-bold flex items-center justify-center">A</span>
                  <span className="text-xs font-semibold text-text-primary">{varA?.name || 'Variant A'}</span>
                </div>
                <ResultFieldsForm
                  values={resultFormA}
                  onChange={(field, val) => setResultFormA(prev => ({ ...prev, [field]: val }))}
                />
              </div>

              {/* Form B */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-bold flex items-center justify-center">B</span>
                  <span className="text-xs font-semibold text-text-primary">{varB?.name || 'Variant B'}</span>
                </div>
                <ResultFieldsForm
                  values={resultFormB}
                  onChange={(field, val) => setResultFormB(prev => ({ ...prev, [field]: val }))}
                />
              </div>
            </div>

            {resultError && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {resultError}
              </div>
            )}
            {resultSuccess && (
              <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-sm text-green-700 dark:text-green-300">
                {resultSuccess}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveResults}
                disabled={resultSaving}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {resultSaving ? 'Menyimpan…' : 'Simpan Data'}
              </button>
            </div>
          </div>
        )}

        {/* Archived notice */}
        {readOnly && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Eksperimen ini telah diarsipkan dan bersifat read-only.
          </div>
        )}

        {/* Delete Confirm Modal */}
        {confirmDelete && (
          <ConfirmDialog
            title="Hapus eksperimen?"
            message="Eksperimen, variant, dan seluruh hasil yang terkait akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
            confirmLabel="Hapus Permanen"
            cancelLabel="Batal"
            onConfirm={() => handleDelete(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
            danger
          />
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────
  // RENDER: LIST VIEW (default)
  // ─────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <BackButton fallbackUrl="/dashboard/marketing" label="Kembali" />
      {toast && (
        <div className={`fixed top-4 right-4 z-[70] rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:border-emerald-800 dark:text-emerald-300'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700 dark:text-white">A/B Testing</h1>
          <p className="text-sm text-text-muted mt-1">
            Bandingkan dua variasi konten atau penawaran dan catat hasilnya secara nyata.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Buat Eksperimen
        </button>
      </div>

      {/* Educational info section */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-sm">
            <h3 className="font-semibold text-navy-700 dark:text-white">
              Bandingkan dua versi konten atau penawaran menggunakan hasil nyata
            </h3>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              <strong>Cara menggunakan:</strong> 1. Buat eksperimen &bull; 2. Tentukan Variant A dan B &bull; 3. Jalankan eksperimen &bull; 4. Masukkan hasil aktual masing-masing variant &bull; 5. Bandingkan metrik &bull; 6. Tandai selesai atau arsipkan.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
              Penting: A/B Testing saat ini menggunakan data hasil yang dimasukkan secara manual. Data dari platform (Instagram, Meta, Google, TikTok) belum terintegrasi otomatis.
            </p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-text-muted">Memuat eksperimen…</p>
        </div>
      )}

      {/* Error */}
      {listError && !loading && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-5 py-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{listError}</span>
          <button onClick={loadList} className="ml-4 underline text-xs">Coba lagi</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !listError && experiments.length === 0 && (
        <div className="text-center py-20 bg-surface border border-border rounded-xl">
          <div className="w-16 h-16 mx-auto bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-navy-700 dark:text-white mb-2">Belum ada eksperimen</h2>
          <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">
            Buat eksperimen A/B pertama Anda untuk membandingkan efektivitas dua variasi konten atau penawaran.
          </p>
          <button
            onClick={openCreate}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Buat Eksperimen Pertama
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !listError && experiments.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[650px]">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-text-muted text-xs font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Nama</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Channel</th>
                  <th className="px-4 py-3 text-left">Metrik</th>
                  <th className="px-4 py-3 text-left">Variant A / B</th>
                  <th className="px-4 py-3 text-left">Periode</th>
                  <th className="px-4 py-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {experiments.map(exp => (
                  <ExperimentRow
                    key={exp.id}
                    exp={exp}
                    onView={() => openDetail(exp)}
                    onEdit={() => {
                      // Need variants — load detail first
                      getExperiment(exp.id, businessId).then(({ data }) => {
                        if (data) openEdit(data)
                      })
                    }}
                    onStart={() => handleStart(exp)}
                    onComplete={() => handleComplete(exp)}
                    onArchive={() => handleArchive(exp)}
                    onDelete={() => setConfirmDelete(exp)}
                    actionLoading={actionLoading === exp.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirm modal (from list) */}
      {confirmDelete && view === 'list' && (
        <ConfirmDialog
          title="Hapus eksperimen?"
          message="Eksperimen, variant, dan seluruh hasil yang terkait akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
          confirmLabel="Hapus Permanen"
          cancelLabel="Batal"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          danger
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// EXPERIMENT ROW
// ─────────────────────────────────────────────────────────

function ExperimentRow({ exp, onView, onEdit, onStart, onComplete, onArchive, onDelete, actionLoading }) {
  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
      <td className="px-4 py-3">
        <button
          onClick={onView}
          className="text-left font-medium text-navy-700 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 max-w-[200px] truncate block"
          title={exp.name}
        >
          {exp.name}
        </button>
        <p className="text-xs text-text-muted truncate max-w-[200px]">{exp.objective}</p>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={exp.status} />
      </td>
      <td className="px-4 py-3 text-text-secondary">{exp.channel}</td>
      <td className="px-4 py-3 text-text-secondary">
        {exp.primary_metric}
        {exp.custom_metric ? <span className="text-xs text-text-muted block">{exp.custom_metric}</span> : null}
      </td>
      <td className="px-4 py-3 text-text-muted text-xs">
        — {/* Variants shown in detail */}
        <span className="block text-text-muted">Lihat detail</span>
      </td>
      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
        <div>{fmtDate(exp.start_at)}</div>
        {exp.end_at && <div>→ {fmtDate(exp.end_at)}</div>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onView}
            className="px-2.5 py-1 text-xs border border-border rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-text-primary"
          >
            Detail
          </button>
          {isEditable(exp.status) && (
            <>
              <button
                onClick={onEdit}
                className="px-2.5 py-1 text-xs border border-border rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-text-primary"
              >
                Edit
              </button>
              <button
                onClick={onStart}
                disabled={actionLoading}
                className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                Mulai
              </button>
            </>
          )}
          {exp.status === 'running' && (
            <button
              onClick={onComplete}
              disabled={actionLoading}
              className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Selesai
            </button>
          )}
          {(exp.status === 'completed' || exp.status === 'running') && (
            <button
              onClick={onArchive}
              disabled={actionLoading}
              className="px-2.5 py-1 text-xs border border-amber-400 text-amber-600 dark:text-amber-400 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
            >
              Arsip
            </button>
          )}
          {canDelete(exp.status) && (
            <button
              onClick={onDelete}
              disabled={actionLoading}
              className="px-2.5 py-1 text-xs border border-red-300 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
            >
              Hapus
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────
// RESULT FIELDS FORM
// ─────────────────────────────────────────────────────────

function ResultFieldsForm({ values, onChange }) {
  const fields = [
    { key: 'impressions', label: 'Impressions' },
    { key: 'clicks', label: 'Clicks' },
    { key: 'conversions', label: 'Conversions' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'leads', label: 'Leads' },
    { key: 'revenue', label: 'Revenue (Rp)' },
    { key: 'purchases', label: 'Purchases' },
  ]
  return (
    <div className="space-y-2">
      {fields.map(f => (
        <div key={f.key} className="flex items-center gap-3">
          <label className="w-32 text-xs text-text-muted shrink-0">{f.label}</label>
          <input
            type="number"
            min="0"
            value={values[f.key]}
            onChange={e => onChange(f.key, e.target.value)}
            className="flex-1 px-2.5 py-1.5 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-background text-text-primary"
            placeholder="0"
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// CONFIRM DIALOG
// ─────────────────────────────────────────────────────────

function ConfirmDialog({ title = 'Hapus eksperimen?', message = 'Eksperimen, variant, dan seluruh hasil yang terkait akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.', confirmLabel = 'Hapus Permanen', cancelLabel = 'Batal', onConfirm, onCancel, danger = true }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 text-text-primary max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <h3 className="text-base font-bold text-navy-700 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-navy-700 dark:hover:text-white transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

