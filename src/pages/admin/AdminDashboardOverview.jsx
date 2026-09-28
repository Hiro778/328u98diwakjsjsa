import { useState, useEffect, useCallback } from 'react'
import { fetchAdminOverviewStats } from '../../services/adminOverviewService.js'

function formatNumber(num) {
  if (num === null || num === undefined) return '—'
  return new Intl.NumberFormat('id-ID').format(num)
}

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function AdminDashboardOverview() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchErr } = await fetchAdminOverviewStats()
    if (fetchErr) {
      setError(fetchErr.message || 'Gagal mengambil statistik aktual database.')
    } else {
      setStats(data)
      setLastRefreshed(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let isMounted = true

    queueMicrotask(() => {
      if (isMounted) {
        loadOverview()
      }
    })

    return () => {
      isMounted = false
    }
  }, [loadOverview])

  return (
    <div className="space-y-6">
      {/* Control Center Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F2937] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Admin Overview Dashboard</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live DB Source
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Data aktual real-time dari database engine BisnisSehat. Tanpa data dummy atau proyeksi acak.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-[11px] text-gray-500 font-mono">
              Tersinkron: {lastRefreshed.toLocaleTimeString('id-ID')}
            </span>
          )}
          <button
            onClick={() => loadOverview()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[#1F2937] hover:bg-[#374151] text-gray-200 border border-[#374151] transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : 'text-gray-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{loading ? 'Menyinkronkan...' : 'Sinkronkan DB'}</span>
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadOverview()}
            className="text-xs font-bold underline hover:text-white"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* 1. Pengguna & Tenant Bisnis */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
          <span>1. Pengguna & Bisnis</span>
          <span className="text-[10px] font-normal text-gray-500">(Sumber: public.profiles & public.businesses)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-gray-400 font-medium">TOTAL USERS</span>
            <div className="text-2xl font-bold text-white mt-1">
              {loading ? <div className="h-8 w-16 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.users?.total)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Data aktual profiles</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-emerald-400 font-medium">ACTIVE USERS</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {loading ? <div className="h-8 w-16 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.users?.active)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Status akun aktif</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-amber-400 font-medium">SUSPENDED USERS</span>
            <div className="text-lg font-bold text-amber-400/90 mt-1">
              {loading ? <div className="h-8 w-16 bg-[#1F2937] animate-pulse rounded" /> : stats?.users?.suspended ?? 'Belum tersedia'}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {stats?.users?.suspended === null ? 'Kolom belum ada di skema' : 'Akun ditangguhkan'}
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-red-400 font-medium">BANNED USERS</span>
            <div className="text-lg font-bold text-red-400/90 mt-1">
              {loading ? <div className="h-8 w-16 bg-[#1F2937] animate-pulse rounded" /> : stats?.users?.banned ?? 'Belum tersedia'}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {stats?.users?.banned === null ? 'Kolom belum ada di skema' : 'Akses dicekal'}
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-gray-400 font-medium">FREE USERS</span>
            <div className="text-2xl font-bold text-white mt-1">
              {loading ? <div className="h-8 w-16 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.users?.free)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Plan Standar</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-emerald-400 font-medium">PRO USERS</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {loading ? <div className="h-8 w-16 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.users?.pro)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Active Pro subscription</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 col-span-2 sm:col-span-1 lg:col-span-2">
            <span className="text-xs text-gray-400 font-medium">ACTIVE BUSINESSES</span>
            <div className="text-2xl font-bold text-white mt-1">
              {loading ? <div className="h-8 w-16 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.businesses?.active)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Total entitas bisnis UMKM</div>
          </div>
        </div>
      </div>

      {/* 2. Penggunaan AI */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
          <span>2. Penggunaan AI</span>
          <span className="text-[10px] font-normal text-gray-500">(Sumber: public.creative_credits & creative_generations)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-gray-400 font-medium">AI CREDITS USED</span>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {loading ? <div className="h-8 w-20 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.ai?.credits_used)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Total kredit terkonsumsi</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-gray-400 font-medium">AI CREDITS REMAINING</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {loading ? <div className="h-8 w-20 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.ai?.credits_remaining)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Saldo kredit tersedia di user</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-gray-400 font-medium">AI REQUESTS TODAY</span>
            <div className="text-2xl font-bold text-white mt-1">
              {loading ? <div className="h-8 w-20 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.ai?.requests_today)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Generasi sejak 00:00 hari ini</div>
          </div>
        </div>
      </div>

      {/* 3. Support Tickets */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
          <span>3. Support Tickets</span>
          <span className="text-[10px] font-normal text-gray-500">(Sumber: public.support_tickets)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-blue-400 font-medium">NEW TICKETS</span>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              {loading ? <div className="h-8 w-12 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.support?.new)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Tiket baru</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-amber-400 font-medium">IN PROGRESS</span>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {loading ? <div className="h-8 w-12 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.support?.in_progress)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Sedang ditangani</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-purple-400 font-medium">WAITING USER</span>
            <div className="text-2xl font-bold text-purple-400 mt-1">
              {loading ? <div className="h-8 w-12 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.support?.waiting_user)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Menunggu balasan user</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-emerald-400 font-medium">RESOLVED</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {loading ? <div className="h-8 w-12 bg-[#1F2937] animate-pulse rounded" /> : formatNumber(stats?.support?.resolved)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Tiket terselesaikan</div>
          </div>
        </div>
      </div>

      {/* 4. Pembayaran & Subscription Revenue */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
          <span>4. Transaksi & Revenue</span>
          <span className="text-[10px] font-normal text-gray-500">(Sumber: public.subscription_payments & payments)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-gray-400 font-medium">PAYMENTS TODAY</span>
            <div className="text-2xl font-bold text-white mt-1">
              {loading ? <div className="h-8 w-28 bg-[#1F2937] animate-pulse rounded" /> : formatCurrency(stats?.payments?.today)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Transaksi sukses hari ini</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-gray-400 font-medium">PAYMENTS THIS MONTH</span>
            <div className="text-2xl font-bold text-white mt-1">
              {loading ? <div className="h-8 w-28 bg-[#1F2937] animate-pulse rounded" /> : formatCurrency(stats?.payments?.this_month)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Bulan berjalan</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
            <span className="text-xs text-emerald-400 font-medium">SUBSCRIPTION REVENUE</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {loading ? <div className="h-8 w-28 bg-[#1F2937] animate-pulse rounded" /> : formatCurrency(stats?.payments?.subscription_revenue)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Akumulasi revenue Midtrans Pro</div>
          </div>
        </div>
      </div>

      {/* 5. Recent Activity (Real Database Records Only) */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center justify-between">
          <span>Aktivitas Pengguna Terbaru (Database)</span>
          <span className="text-[10px] text-gray-500 font-mono">Limit 5 entri</span>
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-[#1F2937] animate-pulse rounded-lg" />
            ))}
          </div>
        ) : !stats?.recent_activities || stats.recent_activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-xs">
            Belum ada aktivitas tercatat di database profiles.
          </div>
        ) : (
          <div className="divide-y divide-[#1F2937]">
            {stats.recent_activities.map((act, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div>
                    <span className="font-semibold text-white">{act.title}</span>
                    <span className="text-gray-400 ml-2 hidden sm:inline">{act.description}</span>
                  </div>
                </div>
                <span className="text-gray-500 font-mono text-[11px] shrink-0">
                  {formatDate(act.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
