import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import {
  calculateSummary, normalizeProgram, normalizeReward, getTopMembers, getRecentActivity,
  formatPoints, formatDate, formatDateTime, formatCurrency,
  LEDGER_TYPE_LABELS, LEDGER_TYPE_COLORS, calculateEarnedPoints, isDuplicateEarning,
  safeInt,
} from '../../../sections/LoyaltyProgram/loyaltyUtils'
import LoyaltySettings from '../../../sections/LoyaltyProgram/LoyaltySettings'
import LoyaltyMemberList from '../../../sections/LoyaltyProgram/LoyaltyMemberList'
import LoyaltyMemberDetail from '../../../sections/LoyaltyProgram/LoyaltyMemberDetail'
import RewardCatalog, { RewardForm } from '../../../sections/LoyaltyProgram/RewardCatalog'
import RedeemForm from '../../../sections/LoyaltyProgram/RedeemForm'
import PointAdjustForm from '../../../sections/LoyaltyProgram/PointAdjustForm'
import BackButton from '../../../components/BackButton'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'members', label: 'Members' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'redemptions', label: 'Redemptions' },
]

export default function LoyaltyProgram() {
  const { business } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')

  // Data
  const [program, setProgram] = useState(null)
  const [customers, setCustomers] = useState([])
  const [rewards, setRewards] = useState([])
  const [ledger, setLedger] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // UI state
  const [showSettings, setShowSettings] = useState(false)
  const [showRewardForm, setShowRewardForm] = useState(false)
  const [editingReward, setEditingReward] = useState(null)
  const [deletingReward, setDeletingReward] = useState(null)
  const [detailCustomer, setDetailCustomer] = useState(null)
  const [adjustCustomer, setAdjustCustomer] = useState(null)
  const [showAdjustForm, setShowAdjustForm] = useState(false)
  const [redeemCustomer, setRedeemCustomer] = useState(null)
  const [showRedeemForm, setShowRedeemForm] = useState(false)
  const [toast, setToast] = useState(null)

  const loadData = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError('')
    try {
      const [progRes, custRes, rewRes, ledRes, redRes] = await Promise.all([
        supabase.from('loyalty_programs').select('*').eq('business_id', business.id).maybeSingle(),
        supabase.from('customers').select('*').eq('business_id', business.id),
        supabase.from('loyalty_rewards').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        supabase.from('loyalty_points_ledger').select('*').eq('business_id', business.id),
        supabase.from('loyalty_redemptions').select('*, reward:loyalty_rewards(name, points_required), customer:customers(name)').eq('business_id', business.id).order('created_at', { ascending: false }),
      ])
      if (progRes.error) throw progRes.error
      if (custRes.error) throw custRes.error
      if (rewRes.error) throw rewRes.error
      if (ledRes.error) throw ledRes.error
      if (redRes.error) throw redRes.error

      setProgram(progRes.data ? normalizeProgram(progRes.data) : null)
      setCustomers(custRes.data || [])
      setRewards((rewRes.data || []).map(normalizeReward))
      setLedger(ledRes.data || [])
      setRedemptions(redRes.data || [])
    } catch (err) {
      setError(err.message || 'Gagal memuat data')
    }
    setLoading(false)
  }, [business])

  useEffect(() => { loadData() }, [loadData])

  const summary = calculateSummary(customers, rewards, ledger)
  const topMembers = getTopMembers(customers, 5)
  const recentActivity = getRecentActivity(ledger, 10)

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // --- Program Settings ---
  async function handleSaveProgram(formData) {
    if (!business?.id) throw new Error('Business tidak ditemukan')
    if (program) {
      const { error } = await supabase.from('loyalty_programs').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', program.id).eq('business_id', business.id)
      if (error) throw error
      showToast('Program berhasil diupdate')
    } else {
      const { error } = await supabase.from('loyalty_programs').insert({ business_id: business.id, ...formData })
      if (error) throw error
      showToast('Program berhasil dibuat')
    }
    setShowSettings(false)
    await loadData()
  }

  // --- Reward CRUD ---
  function handleAddReward() { setEditingReward(null); setShowRewardForm(true) }
  function handleEditReward(r) { setEditingReward(r); setShowRewardForm(true) }

  async function handleSaveReward(formData, existing) {
    if (!business?.id) throw new Error('Business tidak ditemukan')
    if (existing) {
      const { error } = await supabase.from('loyalty_rewards').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('business_id', business.id)
      if (error) throw error
      showToast('Reward berhasil diupdate')
    } else {
      const { error } = await supabase.from('loyalty_rewards').insert({ business_id: business.id, ...formData })
      if (error) throw error
      showToast('Reward berhasil ditambahkan')
    }
    setShowRewardForm(false)
    setEditingReward(null)
    await loadData()
  }

  function handleDeleteReward(r) { setDeletingReward(r) }

  async function confirmDeleteReward() {
    if (!deletingReward || !business?.id) return
    const { error } = await supabase.from('loyalty_rewards').delete().eq('id', deletingReward.id).eq('business_id', business.id)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Reward berhasil dihapus')
    setDeletingReward(null)
    await loadData()
  }

  // --- Point Adjustment ---
  function handleAdjust(c) { setAdjustCustomer(c); setShowAdjustForm(true) }

  async function handleSaveAdjustment(formData) {
    if (!business?.id || !adjustCustomer) throw new Error('Data tidak lengkap')
    const newBalance = formData.type === 'ADJUSTMENT_ADD'
      ? safeInt(adjustCustomer.loyalty_points_balance) + formData.points
      : safeInt(adjustCustomer.loyalty_points_balance) - formData.points

    // Insert ledger
    const { error: ledErr } = await supabase.from('loyalty_points_ledger').insert({
      business_id: business.id,
      customer_id: adjustCustomer.id,
      type: formData.type,
      points: formData.points,
      balance_after: newBalance,
      reference_type: 'manual',
      description: formData.reason,
    })
    if (ledErr) throw ledErr

    // Update customer
    const updateData = { loyalty_points_balance: newBalance, updated_at: new Date().toISOString() }
    if (formData.type === 'ADJUSTMENT_ADD') {
      updateData.loyalty_lifetime_points = safeInt(adjustCustomer.loyalty_lifetime_points) + formData.points
    } else {
      updateData.loyalty_total_redeemed = safeInt(adjustCustomer.loyalty_total_redeemed) + formData.points
    }

    const { error: custErr } = await supabase.from('customers').update(updateData).eq('id', adjustCustomer.id).eq('business_id', business.id)
    if (custErr) throw custErr

    showToast(`Poin berhasil ${formData.type === 'ADJUSTMENT_ADD' ? 'ditambahkan' : 'dikurangi'}`)
    setShowAdjustForm(false)
    setAdjustCustomer(null)
    await loadData()
  }

  // --- Redeem ---
  function handleRedeem(c) { setRedeemCustomer(c); setShowRedeemForm(true) }

  async function handleSaveRedemption({ reward, customer: cust }) {
    if (!business?.id) throw new Error('Data tidak lengkap')
    const newBalance = safeInt(cust.loyalty_points_balance) - reward.points_required

    // Insert redemption
    const { data: redData, error: redErr } = await supabase.from('loyalty_redemptions').insert({
      business_id: business.id,
      customer_id: cust.id,
      reward_id: reward.id,
      points_spent: reward.points_required,
      status: 'completed',
    }).select().single()
    if (redErr) throw redErr

    // Insert ledger
    const { error: ledErr } = await supabase.from('loyalty_points_ledger').insert({
      business_id: business.id,
      customer_id: cust.id,
      type: 'REDEEM',
      points: reward.points_required,
      balance_after: newBalance,
      reference_type: 'redemption',
      reference_id: redData.id,
      description: `Tukar: ${reward.name}`,
    })
    if (ledErr) throw ledErr

    // Update customer
    const { error: custErr } = await supabase.from('customers').update({
      loyalty_points_balance: newBalance,
      loyalty_total_redeemed: safeInt(cust.loyalty_total_redeemed) + reward.points_required,
      updated_at: new Date().toISOString(),
    }).eq('id', cust.id).eq('business_id', business.id)
    if (custErr) throw custErr

    // Update stock
    if (reward.stock != null) {
      await supabase.from('loyalty_rewards').update({ stock: reward.stock - 1, updated_at: new Date().toISOString() }).eq('id', reward.id).eq('business_id', business.id)
    }

    showToast('Poin berhasil ditukar')
    setShowRedeemForm(false)
    setRedeemCustomer(null)
    await loadData()
  }

  // --- Earn Points (manual award from sale) ---
  async function handleEarnPoints(customer, saleId, amount) {
    if (!business?.id || !program) return 0
    const pts = calculateEarnedPoints(amount, program)
    if (pts <= 0) return 0
    if (isDuplicateEarning(ledger, saleId)) return 0

    const newBalance = safeInt(customer.loyalty_points_balance) + pts

    await supabase.from('loyalty_points_ledger').insert({
      business_id: business.id,
      customer_id: customer.id,
      type: 'EARN',
      points: pts,
      balance_after: newBalance,
      reference_type: 'sale',
      reference_id: saleId,
      description: `Transaksi ${formatCurrency(amount)}`,
    })

    await supabase.from('customers').update({
      loyalty_points_balance: newBalance,
      loyalty_lifetime_points: safeInt(customer.loyalty_lifetime_points) + pts,
      loyalty_is_member: true,
      updated_at: new Date().toISOString(),
    }).eq('id', customer.id).eq('business_id', business.id)

    return pts
  }

  // Expose earnPoints for external use
  useEffect(() => {
    window.__loyaltyEarnPoints = handleEarnPoints
    return () => { delete window.__loyaltyEarnPoints }
  }, [program, ledger, business])

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-600' : 'border-profit-200 bg-profit-50 text-profit-600'
        }`}>{toast.message}</div>
      )}

      {/* Header */}
      <BackButton fallbackUrl="/dashboard/penjualan" label="Kembali" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#10B981]">Penjualan & CRM</p>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-700">Loyalty Program</h1>
          <p className="mt-1 text-sm text-text-secondary">Kelola program loyalitas pelanggan bisnis Anda.</p>
        </div>
        <button onClick={() => setShowSettings(true)}
          className="shrink-0 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30">
          ⚙ Pengaturan
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              activeTab === tab.key ? 'bg-warm-50 text-warm-500 border border-warm-200' : 'text-text-muted hover:bg-cream'
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* Loading/Error */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="text-lg font-semibold text-red-500">Gagal memuat data</p>
          <p className="mt-2 text-sm text-text-muted">{error}</p>
          <button onClick={loadData} className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30">Coba Lagi</button>
        </div>
      ) : (
        <>
          {/* ====== DASHBOARD TAB ====== */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Program Info */}
              {!program ? (
                <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
                  <p className="text-sm font-medium text-navy-700">Belum ada program loyalitas</p>
                  <p className="mt-2 text-xs text-text-muted">Buat program untuk mulai memberikan poin kepada pelanggan.</p>
                  <button onClick={() => setShowSettings(true)}
                    className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30">
                    + Buat Program
                  </button>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-surface p-4">
                      <p className="text-xs font-bold text-text-muted uppercase">Total Member</p>
                      <p className="mt-1 text-2xl font-extrabold text-navy-700">{summary.totalMembers}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-surface p-4">
                      <p className="text-xs font-bold text-text-muted uppercase">Total Poin Beredar</p>
                      <p className="mt-1 text-2xl font-extrabold text-warm-500">{formatPoints(summary.totalPoints)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-surface p-4">
                      <p className="text-xs font-bold text-text-muted uppercase">Reward Tersedia</p>
                      <p className="mt-1 text-2xl font-extrabold text-profit-600">{summary.availableRewards}</p>
                    </div>
                  </div>

                  {/* Top Members */}
                  {topMembers.length > 0 && (
                    <div className="mt-6">
                      <p className="text-xs font-bold text-text-muted uppercase">Top Member</p>
                      <div className="mt-3 space-y-2">
                        {topMembers.map((m, i) => (
                          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                            <span className="text-sm font-bold text-text-muted w-5">#{i + 1}</span>
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warm-50 text-xs font-bold text-warm-500">
                              {(m.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-navy-700 truncate">{m.name}</p>
                              <p className="text-[10px] text-text-muted">{m.total_transactions || 0} transaksi · {formatCurrency(m.total_spent || 0)}</p>
                            </div>
                            <p className="text-sm font-bold text-warm-500">{formatPoints(m.loyalty_points_balance)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity */}
                  {recentActivity.length > 0 && (
                    <div className="mt-6">
                      <p className="text-xs font-bold text-text-muted uppercase">Aktivitas Terbaru</p>
                      <div className="mt-3 space-y-1.5">
                        {recentActivity.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2">
                            <div className="min-w-0">
                              <span className={`text-xs font-semibold ${LEDGER_TYPE_COLORS[entry.type] || ''}`}>
                                {LEDGER_TYPE_LABELS[entry.type] || entry.type}
                              </span>
                              {entry.description && <span className="ml-2 text-[10px] text-text-muted">{entry.description}</span>}
                            </div>
                            <span className="text-[10px] text-text-muted shrink-0">{formatDateTime(entry.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ====== MEMBERS TAB ====== */}
          {activeTab === 'members' && (
            <LoyaltyMemberList members={customers} loading={false} error="" onRetry={loadData}
              onClick={(c) => setDetailCustomer(c)} onAdjust={handleAdjust} onRedeem={handleRedeem} />
          )}

          {/* ====== REWARDS TAB ====== */}
          {activeTab === 'rewards' && (
            <RewardCatalog rewards={rewards} loading={false} onAdd={handleAddReward} onEdit={handleEditReward} onDelete={handleDeleteReward} />
          )}

          {/* ====== REDEMPTIONS TAB ====== */}
          {activeTab === 'redemptions' && (
            <div>
              <p className="mt-6 text-xs text-text-muted">{redemptions.length} penukaran</p>
              {redemptions.length === 0 ? (
                <div className="mt-8 rounded-2xl border border-border bg-surface p-12 text-center">
                  <p className="text-lg font-semibold text-navy-700">Belum ada penukaran</p>
                  <p className="mt-2 text-sm text-text-muted">Riwayat penukaran poin akan muncul di sini.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {redemptions.map(r => (
                    <div key={r.id} className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-navy-700 truncate">{r.customer?.name || 'Customer'}</p>
                        <p className="text-[11px] text-text-muted">{r.reward?.name || 'Reward'} · {formatDateTime(r.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-red-500">-{formatPoints(r.points_spent)}</p>
                        <span className={`text-[9px] font-bold ${r.status === 'completed' ? 'text-profit-600' : 'text-red-500'}`}>
                          {r.status === 'completed' ? 'Berhasil' : 'Dibatalkan'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <LoyaltySettings show={showSettings} onClose={() => setShowSettings(false)} onSave={handleSaveProgram} program={program} />
      <RewardForm show={showRewardForm} onClose={() => { setShowRewardForm(false); setEditingReward(null) }} onSave={handleSaveReward} editingReward={editingReward} />
      <LoyaltyMemberDetail show={!!detailCustomer} customer={detailCustomer} ledger={ledger} onClose={() => setDetailCustomer(null)} onAdjust={handleAdjust} onRedeem={handleRedeem} />
      <PointAdjustForm show={showAdjustForm} onClose={() => { setShowAdjustForm(false); setAdjustCustomer(null) }} onSave={handleSaveAdjustment} customer={adjustCustomer} />
      <RedeemForm show={showRedeemForm} onClose={() => { setShowRedeemForm(false); setRedeemCustomer(null) }} onSave={handleSaveRedemption} customer={redeemCustomer} rewards={rewards} program={program} />

      {/* Delete Reward Confirmation */}
      {deletingReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5" onClick={() => setDeletingReward(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold text-navy-700">Hapus Reward</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Yakin ingin menghapus <span className="font-semibold text-navy-700">{deletingReward.name}</span>?
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeletingReward(null)} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-cream">Batal</button>
              <button onClick={confirmDeleteReward} className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
