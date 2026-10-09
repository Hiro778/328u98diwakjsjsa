import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import {
  fetchBusinessSalesData,
  aggregateSalesMetrics,
  partitionOrdersByMonth,
  downloadSalesExcel,
} from '../../../services/excelSalesService'

export default function ExcelPenjualanPage() {
  const { business } = useAuth()
  const businessId = business?.id
  const businessName = business?.name || 'Bisnis Anda'

  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [error, setError] = useState(null)
  const [selectedMonthKey, setSelectedMonthKey] = useState('all')
  const [toastMessage, setToastMessage] = useState('')

  const loadData = useCallback(async () => {
    if (!businessId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await fetchBusinessSalesData(businessId)
      setOrders(data.orders || [])
      setInventory(data.inventory || [])
    } catch (err) {
      console.error('[ExcelPenjualanPage] Load data error:', err)
      setError(err.message || 'Gagal mengambil data penjualan aktual.')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Partisi bulanan
  const monthlyPartitions = useMemo(() => {
    return partitionOrdersByMonth(orders)
  }, [orders])

  // Filter orders berdasarkan pilihan bulan
  const activeOrders = useMemo(() => {
    if (selectedMonthKey === 'all') return orders
    const targetMonth = monthlyPartitions.find((m) => m.key === selectedMonthKey)
    return targetMonth ? targetMonth.orders : orders
  }, [orders, selectedMonthKey, monthlyPartitions])

  // Metrik teragregasi
  const summary = useMemo(() => {
    return aggregateSalesMetrics(activeOrders)
  }, [activeOrders])

  // Handler Export
  const handleExport = async (scope = 'all') => {
    try {
      setExporting(true)
      let exportOrders = orders

      if (scope === 'current') {
        const now = new Date()
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const currentPartition = monthlyPartitions.find((m) => m.key === currentMonthKey)
        exportOrders = currentPartition ? currentPartition.orders : []
      }

      await downloadSalesExcel({
        businessName,
        orders: exportOrders,
        inventory,
        filename: `Laporan_Excel_Penjualan_${businessName.replace(/\s+/g, '_')}_${scope === 'current' ? 'Bulan_Ini' : 'Semua_Data'}.xlsx`,
      })

      setToastMessage('Workbook Excel berhasil diunduh!')
      setTimeout(() => setToastMessage(''), 4000)
    } catch (err) {
      console.error('[ExcelPenjualanPage] Export error:', err)
      setError(`Gagal mengunduh Excel: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Data grafik penjualan harian atau bulanan
  const chartData = useMemo(() => {
    if (selectedMonthKey === 'all') {
      // Grafik per bulan
      return monthlyPartitions.map((m) => {
        const mMetrics = aggregateSalesMetrics(m.orders)
        return {
          label: m.label,
          total: mMetrics.totalOmzet,
          count: mMetrics.totalTransaksi,
        }
      })
    } else {
      // Grafik harian untuk bulan terpilih (dibatasi hari berjalan jika bulan berjalan)
      const targetMonth = monthlyPartitions.find((m) => m.key === selectedMonthKey)
      if (!targetMonth) return []

      const now = new Date()
      const isCurrentMonth = targetMonth.year === now.getFullYear() && targetMonth.monthIndex === now.getMonth()
      const daysInMonth = new Date(targetMonth.year, targetMonth.monthIndex + 1, 0).getDate()
      const maxDay = isCurrentMonth ? now.getDate() : daysInMonth

      const days = []
      for (let d = 1; d <= maxDay; d++) {
        days.push({ day: d, total: 0, count: 0 })
      }

      for (const ord of targetMonth.orders) {
        const dayNum = new Date(ord.created_at).getDate()
        if (dayNum >= 1 && dayNum <= maxDay && days[dayNum - 1]) {
          days[dayNum - 1].total += Number(ord.total) || 0
          days[dayNum - 1].count += 1
        }
      }

      return days.map((d) => ({
        label: `Tgl ${d.day}`,
        total: d.total,
        count: d.count,
      }))
    }
  }, [selectedMonthKey, monthlyPartitions])

  const maxChartValue = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.total), 0)
    return max > 0 ? max : 1
  }, [chartData])

  return (
    <div className="min-h-screen bg-bg-base text-text-primary px-4 py-6 md:px-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notifikasi */}
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed top-5 right-5 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </motion.div>
      )}

      {/* Navigasi Back */}
      <BackButton fallbackUrl="/dashboard/operasional" label="Kembali" />

      {/* Header Halaman */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
              Siap Digunakan
            </span>
            <span className="text-xs text-text-secondary">Data Realtime Database</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            Excel Penjualan Otomatis
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Kelola laporan penjualan bulanan dalam Excel yang rapi dan otomatis.
          </p>
        </div>

        {/* Action Export Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleExport('current')}
            disabled={exporting || loading}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-border bg-bg-card hover:bg-bg-hover text-text-primary transition-all disabled:opacity-50 shadow-sm"
          >
            Unduh Excel Bulan Ini
          </button>
          <button
            onClick={() => handleExport('all')}
            disabled={exporting || loading}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-50 shadow flex items-center gap-2"
          >
            {exporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Menyiapkan Workbook...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Unduh Excel Terbaru
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-400 text-sm flex items-center justify-between">
          <p>{error}</p>
          <button onClick={loadData} className="underline text-xs ml-4">Coba Lagi</button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-5 rounded-2xl border border-border bg-bg-card shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Total Revenue
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {loading ? '...' : `Rp ${(summary.totalRevenue ?? summary.totalOmzet ?? 0).toLocaleString('id-ID')}`}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Omzet riil dari database
          </p>
        </div>

        {/* Total Transaksi */}
        <div className="p-5 rounded-2xl border border-border bg-bg-card shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Total Transaksi
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {loading ? '...' : `${summary.totalTransaksi.toLocaleString('id-ID')} pesanan`}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Rata-rata: Rp {summary.rataRataNilaiTransaksi.toLocaleString('id-ID')} / order
          </p>
        </div>

        {/* Produk Terjual */}
        <div className="p-5 rounded-2xl border border-border bg-bg-card shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Produk Terjual
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {loading ? '...' : `${summary.totalProdukTerjual.toLocaleString('id-ID')} unit`}
          </p>
          <p className="mt-1 text-xs text-text-secondary truncate" title={summary.produkTerlaris}>
            Terlaris: <span className="font-medium text-text-primary">{summary.produkTerlaris}</span>
          </p>
        </div>

        {/* Total Kerugian */}
        <div className="p-5 rounded-2xl border border-border bg-bg-card shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Total Kerugian
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {loading ? '...' : `Rp ${(summary.totalKerugian || 0).toLocaleString('id-ID')}`}
          </p>
          <p className="mt-1 text-xs text-text-secondary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Refund / kerugian aktual
          </p>
        </div>
      </div>

      {/* Filter Periode & Preview Chart */}
      <div className="p-5 rounded-2xl border border-border bg-bg-card shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="font-semibold text-text-primary">Preview Diagram Batang Penjualan</h3>
            <p className="text-xs text-text-secondary">
              Visualisasi grafik penjualan yang sinkron dengan range data workbook Excel.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary font-medium">Filter Periode:</label>
            <select
              value={selectedMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              className="text-xs bg-bg-base border border-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Semua Periode (Bulanan)</option>
              {monthlyPartitions.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Visual Bar Chart */}
        {chartData.length === 0 ? (
          <div className="py-12 text-center text-text-secondary text-sm">
            Belum ada data penjualan tercatat pada periode ini.
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <div className="max-h-72 overflow-y-auto space-y-2 pr-2">
              {chartData.map((item, idx) => {
                const percentage = Math.round((item.total / maxChartValue) * 100)
                return (
                  <div key={idx} className="flex items-center gap-3 text-xs">
                    <span className="w-20 font-medium text-text-secondary truncate text-right">
                      {item.label}
                    </span>
                    <div className="flex-1 bg-bg-base rounded-full h-5 overflow-hidden p-0.5 border border-border/50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(percentage, 2)}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.02 }}
                        className="h-full rounded-full bg-emerald-500/80 flex items-center justify-end px-2"
                      >
                        {percentage > 25 && (
                          <span className="text-[10px] text-white font-medium">
                            Rp {item.total.toLocaleString('id-ID')}
                          </span>
                        )}
                      </motion.div>
                    </div>
                    <span className="w-28 text-right font-medium text-text-primary">
                      Rp {item.total.toLocaleString('id-ID')}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-text-secondary text-right pt-2 border-t border-border/50">
              * Di dalam file Excel, visual diagram batang ini terhubung langsung ke formula data range sheet bulanan.
            </p>
          </div>
        )}
      </div>

      {/* Tabel Preview Transaksi Aktual */}
      <div className="p-5 rounded-2xl border border-border bg-bg-card shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Sampel Transaksi Masuk</h3>
          <span className="text-xs text-text-secondary font-medium">
            Total {activeOrders.length} transaksi dimuat
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="py-2.5 px-3 font-semibold">Tanggal</th>
                <th className="py-2.5 px-3 font-semibold">No Order</th>
                <th className="py-2.5 px-3 font-semibold">Items</th>
                <th className="py-2.5 px-3 font-semibold text-right">Subtotal</th>
                <th className="py-2.5 px-3 font-semibold text-right">Diskon</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                <th className="py-2.5 px-3 font-semibold">Metode</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {activeOrders.slice(0, 10).map((o) => {
                const dateStr = new Date(o.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
                const itemsCount = o.items ? o.items.length : 1
                return (
                  <tr key={o.id} className="hover:bg-bg-hover transition-colors">
                    <td className="py-2.5 px-3 font-medium text-text-primary">{dateStr}</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-600 dark:text-emerald-400">
                      {o.order_number ? `#${o.order_number}` : String(o.id).slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">{itemsCount} jenis produk</td>
                    <td className="py-2.5 px-3 text-right">Rp {(Number(o.subtotal) || 0).toLocaleString('id-ID')}</td>
                    <td className="py-2.5 px-3 text-right text-text-secondary">
                      Rp {(Number(o.discount_amount) || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      Rp {(Number(o.total) || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 uppercase text-[11px] font-medium">{o.payment_method || 'CASH'}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                        {o.order_status || 'completed'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {activeOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-text-secondary">
                    Belum ada riwayat pesanan untuk bisnis ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
