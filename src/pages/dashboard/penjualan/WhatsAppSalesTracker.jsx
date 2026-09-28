import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import {
  calculateSummary,
  calculatePipeline,
  normalizeLead,
  normalizePhoneForWhatsApp,
  normalizePhoneForTel,
  formatCurrency,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
} from '../../../sections/WhatsAppSalesTracker/whatsappSalesUtils'
import WhatsAppLeadList from '../../../sections/WhatsAppSalesTracker/WhatsAppLeadList'
import WhatsAppLeadForm from '../../../sections/WhatsAppSalesTracker/WhatsAppLeadForm'
import WhatsAppLeadDetail from '../../../sections/WhatsAppSalesTracker/WhatsAppLeadDetail'
import FollowUpForm from '../../../sections/WhatsAppSalesTracker/FollowUpForm'
import BackButton from '../../../components/BackButton'

export default function WhatsAppSalesTracker() {
  const { business } = useAuth()

  // Data
  const [leads, setLeads] = useState([])
  const [followups, setFollowups] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [detailLead, setDetailLead] = useState(null)
  const [deletingLead, setDeletingLead] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showFollowupForm, setShowFollowupForm] = useState(false)
  const [followupLead, setFollowupLead] = useState(null)
  const [toast, setToast] = useState(null)

  // Load data
  const loadData = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError('')

    try {
      const [leadsRes, followupsRes, customersRes] = await Promise.all([
        supabase.from('whatsapp_leads').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        supabase.from('whatsapp_lead_followups').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name, phone, email').eq('business_id', business.id),
      ])

      if (leadsRes.error) throw leadsRes.error
      if (followupsRes.error) throw followupsRes.error
      if (customersRes.error) throw customersRes.error

      const customerList = customersRes.data || []
      const normalizedLeads = (leadsRes.data || []).map(l => normalizeLead(l, customerList))

      setLeads(normalizedLeads)
      setFollowups(followupsRes.data || [])
      setCustomers(customerList)
    } catch (err) {
      setError(err.message || 'Gagal memuat data')
    }

    setLoading(false)
  }, [business])

  useEffect(() => { loadData() }, [loadData])

  // Derived data
  const summary = useMemo(() => calculateSummary(leads), [leads])
  const pipeline = useMemo(() => calculatePipeline(leads), [leads])

  const followupsByLead = useMemo(() => {
    const map = {}
    for (const fu of followups) {
      if (!map[fu.lead_id]) map[fu.lead_id] = []
      map[fu.lead_id].push(fu)
    }
    return map
  }, [followups])

  // Toast
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Add / Edit lead
  async function handleSaveLead(formData, existing) {
    if (!business?.id) throw new Error('Business tidak ditemukan')

    const leadData = {
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      customer_id: formData.customer_id || null,
      product_interest: formData.product_interest,
      estimated_value: Number(formData.estimated_value) || 0,
      status: formData.status,
      priority: formData.priority,
      notes: formData.notes,
      lead_date: formData.lead_date || new Date().toISOString().slice(0, 10),
    }

    if (existing) {
      // If converting to won, set converted_at
      if (formData.status === 'won' && existing.status !== 'won') {
        leadData.converted_at = new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from('whatsapp_leads')
        .update({ ...leadData, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('business_id', business.id)

      if (updateError) throw updateError
      showToast('Lead berhasil diupdate')
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_leads')
        .insert({ business_id: business.id, ...leadData })

      if (insertError) throw insertError
      showToast('Lead berhasil ditambahkan')
    }

    setShowForm(false)
    setEditingLead(null)
    loadData()
  }

  // Delete lead
  async function handleConfirmDelete() {
    if (!deletingLead || !business?.id) return
    setDeleteLoading(true)

    try {
      const { error: deleteError } = await supabase
        .from('whatsapp_leads')
        .delete()
        .eq('id', deletingLead.id)
        .eq('business_id', business.id)

      if (deleteError) throw deleteError
      showToast('Lead berhasil dihapus')

      setDeletingLead(null)
      setDetailLead(null)
      loadData()
    } catch (err) {
      showToast(err.message || 'Gagal menghapus lead', 'error')
    }

    setDeleteLoading(false)
  }

  // Save follow-up
  async function handleSaveFollowup(formData) {
    if (!business?.id || !followupLead) throw new Error('Data tidak lengkap')

    const { error: insertError } = await supabase
      .from('whatsapp_lead_followups')
      .insert({
        business_id: business.id,
        lead_id: followupLead.id,
        method: formData.method,
        result: formData.result,
        next_follow_up_at: formData.next_follow_up_at || null,
        notes: formData.notes,
      })

    if (insertError) throw insertError

    // Update lead's last_contacted_at and next_follow_up_at
    const { error: updateError } = await supabase
      .from('whatsapp_leads')
      .update({
        last_contacted_at: new Date().toISOString(),
        next_follow_up_at: formData.next_follow_up_at || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', followupLead.id)
      .eq('business_id', business.id)

    if (updateError) throw updateError

    showToast('Follow-up berhasil dicatat')
    setShowFollowupForm(false)
    setFollowupLead(null)
    loadData()
  }

  // Quick actions
  function handleWhatsApp(lead) {
    if (!lead.phone) return
    const normalized = normalizePhoneForWhatsApp(lead.phone)
    window.open(`https://wa.me/${normalized}`, '_blank')
  }

  function handleCall(lead) {
    if (!lead.phone) return
    const normalized = normalizePhoneForTel(lead.phone)
    window.open(`tel:${normalized}`, '_self')
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-600'
            : 'border-profit-200 bg-profit-50 text-profit-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <BackButton
        fallbackUrl="/dashboard/penjualan"
        label={detailLead ? 'Kembali ke Daftar Leads' : 'Kembali'}
        onClick={detailLead ? () => setDetailLead(null) : undefined}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#10B981]">Penjualan & CRM</p>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-700">WhatsApp Sales Tracker</h1>
          <p className="mt-1 text-sm text-text-secondary">Kelola leads dan follow-up penjualan via WhatsApp.</p>
        </div>
        <button
          onClick={() => { setEditingLead(null); setShowForm(true) }}
          className="shrink-0 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          + Tambah Lead
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Leads" value={summary.total} />
        <SummaryCard label="Leads Baru" value={summary.newCount} color="text-blue-600" />
        <SummaryCard label="Follow-up Hari Ini" value={summary.todayFollowup} color="text-yellow-600" />
        <SummaryCard label="Follow-up Terlambat" value={summary.overdueCount} color="text-red-500" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Converted / Won" value={summary.wonCount} color="text-profit-600" />
        <SummaryCard label="Pipeline Value" value={formatCurrency(summary.pipelineValue)} />
        <SummaryCard label="Conversion Rate" value={`${summary.conversionRate}%`} color="text-purple-600" />
      </div>

      {/* Pipeline */}
      {Object.keys(pipeline).length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Pipeline</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(pipeline).map(([status, data]) => (
              <div key={status} className="rounded-lg border border-border bg-cream/50 px-3 py-2 text-center">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${LEAD_STATUS_COLORS[status] || ''}`}>
                  {LEAD_STATUS_LABELS[status] || status}
                </span>
                <p className="mt-1 text-sm font-bold text-navy-700">{data.count}</p>
                <p className="text-[10px] text-text-muted">{formatCurrency(data.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lead List */}
      <WhatsAppLeadList
        leads={leads}
        followupsByLead={followupsByLead}
        loading={loading}
        error={error}
        onRetry={loadData}
        onClick={(lead) => setDetailLead(lead)}
        onWhatsApp={handleWhatsApp}
        onCall={handleCall}
        onFollowup={(lead) => { setFollowupLead(lead); setShowFollowupForm(true) }}
        onEdit={(lead) => { setEditingLead(lead); setShowForm(true) }}
        onDelete={(lead) => setDeletingLead(lead)}
      />

      {/* Form Modal */}
      <WhatsAppLeadForm
        show={showForm}
        onClose={() => { setShowForm(false); setEditingLead(null) }}
        onSave={handleSaveLead}
        editingLead={editingLead}
        existingLeads={leads}
        customers={customers}
      />

      {/* Detail Modal */}
      <WhatsAppLeadDetail
        show={!!detailLead}
        lead={detailLead}
        followups={detailLead ? (followupsByLead[detailLead.id] || []) : []}
        onClose={() => setDetailLead(null)}
        onWhatsApp={handleWhatsApp}
        onCall={handleCall}
        onFollowup={(lead) => { setDetailLead(null); setFollowupLead(lead); setShowFollowupForm(true) }}
        onEdit={(lead) => { setDetailLead(null); setEditingLead(lead); setShowForm(true) }}
        onDelete={(lead) => { setDetailLead(null); setDeletingLead(lead) }}
      />

      {/* Follow-up Form Modal */}
      <FollowUpForm
        show={showFollowupForm}
        onClose={() => { setShowFollowupForm(false); setFollowupLead(null) }}
        onSave={handleSaveFollowup}
        lead={followupLead}
      />

      {/* Delete Confirmation */}
      {deletingLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
          onClick={() => !deleteLoading && setDeletingLead(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-navy-700">Hapus Lead</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Yakin ingin menghapus lead <strong>{deletingLead.name}</strong>? Semua data follow-up terkait juga akan dihapus.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => !deleteLoading && setDeletingLead(null)}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {deleteLoading ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color = 'text-navy-700' }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-bold text-text-muted uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>
    </div>
  )
}
