import { supabase } from '../lib/supabase.js'

let _excelJsModule = null
async function getExcelJS() {
  if (!_excelJsModule) {
    const mod = await import('exceljs')
    _excelJsModule = mod.default || mod
  }
  return _excelJsModule
}

/**
 * Service Excel Penjualan Otomatis
 * Sesuai spesifikasi sheet.md & excell.md
 * - Tenant isolation via business_id
 * - Data riil dari orders, order_items, inventory
 * - Formula Excel native (=SUM, =COUNT, dll)
 * - Multi-sheet: Ringkasan + Sheet Bulanan Dinamis
 * - Laporan HARIAN (1 baris = 1 hari) dibatasi sampai tanggal cutoff / export
 * - KPI Nomenclature: Total Revenue, Total Transaksi, Total Produk Terjual, Produk Terlaris, Total Kerugian, Rata-rata Nilai Transaksi
 * - Kerugian per hari berbasis data riil / refund (Rp0 jika tidak ada)
 * - Diagram batang dinamis terhubung ke data range via dataBar
 */

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const SHORT_MONTH_NAMES_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

export function getMonthYearLabel(date) {
  const d = new Date(date)
  const monthName = MONTH_NAMES_ID[d.getMonth()]
  const year = d.getFullYear()
  return `${monthName} ${year}`
}

export function getDaysInMonth(year, monthIndex) {
  // monthIndex: 0-11. Menggunakan hari ke-0 dari bulan berikutnya
  return new Date(year, monthIndex + 1, 0).getDate()
}

import {
  isFinalTransaction,
  fetchCanonicalOrders,
  aggregateSalesMetrics,
  fetchBusinessSalesData,
  invalidateBusinessSalesDataCache,
} from './canonicalSalesService.js'
import { injectNativeChart } from './excelChartService.js'

export { isFinalTransaction, fetchCanonicalOrders, aggregateSalesMetrics, fetchBusinessSalesData, invalidateBusinessSalesDataCache, injectNativeChart }

/**
 * Bangun data laporan harian untuk satu bulan tertentu, dibatasi sampai batas tanggal cutoff
 * (Sesuai sheet.md: 1 baris = 1 hari, tanggal masa depan tidak digenerate)
 */
export function buildDailyReportData({ orders = [], year, monthIndex, cutoffDay = null }) {
  const daysInMonth = getDaysInMonth(year, monthIndex)
  const maxDay = cutoffDay ? Math.min(cutoffDay, daysInMonth) : daysInMonth

  // Inisialisasi map harian 1..maxDay
  const dailyMap = {}
  for (let day = 1; day <= maxDay; day++) {
    dailyMap[day] = {
      day,
      count: 0,
      itemsQty: 0,
      revenue: 0,
      kerugian: 0,
      productSales: {},
    }
  }

  for (const order of orders) {
    const isFinal = isFinalTransaction(order)
    const orderTotal = Number(order.total) || 0
    const isRefunded =
      String(order.payment_status || '').toLowerCase().trim() === 'refunded' ||
      orderTotal < 0

    if (!isFinal && !isRefunded) {
      continue
    }

    const d = new Date(order.created_at)
    if (d.getFullYear() === year && d.getMonth() === monthIndex) {
      const dayNum = d.getDate()
      if (dayNum >= 1 && dayNum <= maxDay) {
        const dData = dailyMap[dayNum]

        if (isRefunded) {
          dData.kerugian += Math.abs(orderTotal)
        }

        if (isFinal && !isRefunded) {
          dData.count += 1
          dData.revenue += orderTotal

          const items = order.items || []
          for (const item of items) {
            const qty = Number(item.quantity) || 0
            dData.itemsQty += qty
            const name = item.product_name || 'Tanpa Nama'
            dData.productSales[name] = (dData.productSales[name] || 0) + qty
          }
        }
      }
    }
  }

  const rows = []
  let sumTransaksi = 0
  let sumProdukTerjual = 0
  let sumRevenue = 0
  let sumKerugian = 0

  const monthShort = SHORT_MONTH_NAMES_ID[monthIndex]

  for (let day = 1; day <= maxDay; day++) {
    const dData = dailyMap[day]
    sumTransaksi += dData.count
    sumProdukTerjual += dData.itemsQty
    sumRevenue += dData.revenue
    sumKerugian += dData.kerugian

    let bestSeller = '-'
    let maxQty = 0
    for (const [prodName, qty] of Object.entries(dData.productSales)) {
      if (qty > maxQty) {
        maxQty = qty
        bestSeller = prodName
      }
    }

    rows.push({
      day,
      dateLabel: `${day} ${monthShort}`,
      count: dData.count,
      itemsQty: dData.itemsQty,
      bestSeller,
      revenue: dData.revenue,
      kerugian: dData.kerugian,
    })
  }

  return {
    rows,
    maxDay,
    totals: {
      count: sumTransaksi,
      itemsQty: sumProdukTerjual,
      revenue: sumRevenue,
      kerugian: sumKerugian,
    },
  }
}

/**
 * Partisi data transaksi per bulan (Multi-sheet akumulatif)
 */
export function partitionOrdersByMonth(orders = []) {
  const monthsMap = {}

  for (const order of orders) {
    const date = new Date(order.created_at)
    const year = date.getFullYear()
    const monthIndex = date.getMonth()
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    const label = `${MONTH_NAMES_ID[monthIndex]} ${year}`

    if (!monthsMap[key]) {
      monthsMap[key] = {
        key,
        year,
        monthIndex,
        label,
        orders: [],
      }
    }
    monthsMap[key].orders.push(order)
  }

  // Jika tidak ada pesanan, sertakan setidaknya bulan berjalan saat ini
  if (Object.keys(monthsMap).length === 0) {
    const now = new Date()
    const year = now.getFullYear()
    const monthIndex = now.getMonth()
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    const label = `${MONTH_NAMES_ID[monthIndex]} ${year}`
    monthsMap[key] = {
      key,
      year,
      monthIndex,
      label,
      orders: [],
    }
  }

  // Kembalikan array terurut kronologis
  return Object.values(monthsMap).sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Buat Workbook Excel sesuai spesifikasi sheet.md & Context7 ExcelJS
 */
export async function generateSalesWorkbook({
  businessName = 'BisnisSehat',
  orders = [],
  inventory = [],
  exportDate = new Date(),
  chartType = 'bar',
}) {
  const ExcelJS = await getExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'BisnisSehat'
  workbook.lastModifiedBy = businessName
  workbook.created = new Date()
  workbook.modified = new Date()

  const exportD = exportDate instanceof Date ? exportDate : new Date(exportDate || Date.now())
  const expYear = exportD.getFullYear()
  const expMonth = exportD.getMonth()
  const expDay = exportD.getDate()

  const monthlyPartitions = partitionOrdersByMonth(orders)
  const overallMetrics = aggregateSalesMetrics(orders)

  // Cari partisi untuk bulan export (atau partisi terakhir jika ada)
  const activePartition = monthlyPartitions.find(
    (m) => m.year === expYear && m.monthIndex === expMonth
  ) || monthlyPartitions[monthlyPartitions.length - 1]

  const activeCutoffDay = (activePartition.year === expYear && activePartition.monthIndex === expMonth)
    ? expDay
    : getDaysInMonth(activePartition.year, activePartition.monthIndex)

  const summaryDailyReport = buildDailyReportData({
    orders: activePartition.orders,
    year: activePartition.year,
    monthIndex: activePartition.monthIndex,
    cutoffDay: activeCutoffDay,
  })

  // ============================================================
  // 1. SHEET PERTAMA: "Ringkasan"
  // ============================================================
  const summarySheet = workbook.addWorksheet('Ringkasan', {
    views: [{ showGridLines: true }],
  })

  // Styling Header Ringkasan
  summarySheet.mergeCells('A1:F1')
  const titleCell = summarySheet.getCell('A1')
  titleCell.value = `LAPORAN PENJUALAN OTOMATIS - ${businessName.toUpperCase()}`
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Dark slate
  }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  summarySheet.getRow(1).height = 30

  // Metadata Usaha & Periode
  const periodText = `${activePartition.label} (1–${summaryDailyReport.maxDay} ${MONTH_NAMES_ID[activePartition.monthIndex]})`

  summarySheet.getCell('A3').value = 'Nama Usaha:'
  summarySheet.getCell('B3').value = businessName
  summarySheet.getCell('A3').font = { bold: true }

  summarySheet.getCell('A4').value = 'Periode Data:'
  summarySheet.getCell('B4').value = periodText
  summarySheet.getCell('A4').font = { bold: true }

  summarySheet.getCell('D3').value = 'Tanggal Unduh:'
  summarySheet.getCell('E3').value = exportD.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  summarySheet.getCell('D3').font = { bold: true }

  summarySheet.getCell('D4').value = 'Status Data:'
  summarySheet.getCell('E4').value = 'Aktual Database (Realtime)'
  summarySheet.getCell('D4').font = { bold: true }

  // KPI Summary Cards (6 Cards sesuai sheet.md):
  // 1. Total Revenue
  // 2. Total Transaksi
  // 3. Total Produk Terjual
  // 4. Produk Terlaris
  // 5. Total Kerugian
  // 6. Rata-rata Nilai Transaksi
  const kpiData = [
    { cell: 'A6', label: 'Total Revenue', val: overallMetrics.totalRevenue, fmt: '"Rp "#,##0' },
    { cell: 'B6', label: 'Total Transaksi', val: overallMetrics.totalTransaksi, fmt: '#,##0' },
    { cell: 'C6', label: 'Total Produk Terjual', val: overallMetrics.totalProdukTerjual, fmt: '#,##0' },
    { cell: 'D6', label: 'Produk Terlaris', val: overallMetrics.produkTerlaris, fmt: '@' },
    { cell: 'E6', label: 'Total Kerugian', val: overallMetrics.totalKerugian, fmt: '"Rp "#,##0' },
    { cell: 'F6', label: 'Rata-rata Nilai Transaksi', val: overallMetrics.rataRataNilaiTransaksi, fmt: '"Rp "#,##0' },
  ]

  for (const kpi of kpiData) {
    const colLetter = kpi.cell[0]
    const headerCell = summarySheet.getCell(`${colLetter}6`)
    headerCell.value = kpi.label
    headerCell.font = { size: 9, bold: true, color: { argb: 'FF64748B' } }
    headerCell.alignment = { horizontal: 'center' }

    const valueCell = summarySheet.getCell(`${colLetter}7`)
    valueCell.value = kpi.val
    valueCell.font = { size: 12, bold: true, color: { argb: 'FF0F172A' } }
    valueCell.alignment = { horizontal: 'center' }
    if (kpi.fmt !== '@') {
      valueCell.numFmt = kpi.fmt
    }

    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  }
  summarySheet.getRow(6).height = 18
  summarySheet.getRow(7).height = 24

  // Tabel Laporan Penjualan Harian di Sheet Ringkasan (1 baris = 1 hari)
  summarySheet.getCell('A9').value = `LAPORAN PENJUALAN HARIAN - ${activePartition.label.toUpperCase()} (1–${summaryDailyReport.maxDay} ${MONTH_NAMES_ID[activePartition.monthIndex].toUpperCase()})`
  summarySheet.getCell('A9').font = { bold: true, size: 11, color: { argb: 'FF1E293B' } }

  const dailyHeaders = ['Tanggal', 'Jumlah Transaksi', 'Produk Terjual', 'Produk Terlaris', 'Revenue', 'Kerugian']
  summarySheet.getRow(11).values = dailyHeaders
  summarySheet.getRow(11).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  summarySheet.getRow(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }

  let sumDailyRowIdx = 12
  for (const r of summaryDailyReport.rows) {
    const row = summarySheet.getRow(sumDailyRowIdx)
    row.values = [
      r.dateLabel,
      r.count,
      r.itemsQty,
      r.bestSeller,
      r.revenue,
      r.kerugian,
    ]
    summarySheet.getCell(`B${sumDailyRowIdx}`).numFmt = '#,##0'
    summarySheet.getCell(`C${sumDailyRowIdx}`).numFmt = '#,##0'
    summarySheet.getCell(`E${sumDailyRowIdx}`).numFmt = '"Rp "#,##0'
    summarySheet.getCell(`F${sumDailyRowIdx}`).numFmt = '"Rp "#,##0'
    sumDailyRowIdx++
  }

  const endSummaryDailyRow = sumDailyRowIdx - 1
  // Baris TOTAL di bawah tabel harian (Native Formula Excel)
  const summaryTotalRow = summarySheet.getRow(sumDailyRowIdx)
  summaryTotalRow.values = [
    'TOTAL',
    { formula: `SUM(B12:B${endSummaryDailyRow})`, result: summaryDailyReport.totals.count },
    { formula: `SUM(C12:C${endSummaryDailyRow})`, result: summaryDailyReport.totals.itemsQty },
    '-',
    { formula: `SUM(E12:E${endSummaryDailyRow})`, result: summaryDailyReport.totals.revenue },
    { formula: `SUM(F12:F${endSummaryDailyRow})`, result: summaryDailyReport.totals.kerugian },
  ]
  summaryTotalRow.font = { bold: true }
  summaryTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  summarySheet.getCell(`B${sumDailyRowIdx}`).numFmt = '#,##0'
  summarySheet.getCell(`C${sumDailyRowIdx}`).numFmt = '#,##0'
  summarySheet.getCell(`E${sumDailyRowIdx}`).numFmt = '"Rp "#,##0'
  summarySheet.getCell(`F${sumDailyRowIdx}`).numFmt = '"Rp "#,##0'

  // Diagram Batang Dinamis (dataBar terhubung langsung ke kolom Revenue E12..endSummaryDailyRow)
  if (summaryDailyReport.rows.length > 0) {
    summarySheet.addConditionalFormatting({
      ref: `E12:E${endSummaryDailyRow}`,
      rules: [
        {
          type: 'dataBar',
          cfvo: [{ type: 'min' }, { type: 'max' }],
          color: { argb: 'FF10B981' }, // Emerald green bar
          showValue: true,
          gradient: true,
        },
      ],
    })

    // Highlight merah jika ada Kerugian > 0
    summarySheet.addConditionalFormatting({
      ref: `F12:F${endSummaryDailyRow}`,
      rules: [
        {
          type: 'cellIs',
          operator: 'greaterThan',
          formulae: ['0'],
          style: {
            fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } },
            font: { color: { argb: 'FF721C24' }, bold: true },
          },
        },
      ],
    })
  }

  // ============================================================
  // Isolated Helper Data: Komposisi Penjualan Produk & Untung vs Rugi
  // Placed far right in hidden columns AA, AB, AC, AD (Never displayed in main view)
  // ============================================================
  const isBarMode = chartType === 'bar'
  const prodCatCol = isBarMode ? 'AC' : 'AA'
  const prodValCol = isBarMode ? 'AD' : 'AB'
  const barCatCol = isBarMode ? 'AA' : 'AC'
  const barValCol = isBarMode ? 'AB' : 'AD'

  // Kumpulkan komposisi produk terjual dari transaksi final periode aktif (g1.md)
  const productQtyMap = {}
  for (const order of activePartition.orders) {
    if (!isFinalTransaction(order)) continue
    const d = new Date(order.created_at)
    if (d.getFullYear() === activePartition.year && d.getMonth() === activePartition.monthIndex) {
      if (d.getDate() > activeCutoffDay) continue
    }
    for (const item of (order.items || [])) {
      const name = item.product_name || 'Tanpa Nama'
      const qty = Number(item.quantity) || 0
      if (qty > 0) {
        productQtyMap[name] = (productQtyMap[name] || 0) + qty
      }
    }
  }

  // Fallback ke overallMetrics jika activePartition.orders belum memiliki items
  if (Object.keys(productQtyMap).length === 0 && overallMetrics.productSalesMap) {
    for (const [name, pData] of Object.entries(overallMetrics.productSalesMap)) {
      if (pData.total_quantity > 0) {
        productQtyMap[name] = pData.total_quantity
      }
    }
  }

  const sortedProductEntries = Object.entries(productQtyMap).sort((a, b) => b[1] - a[1])

  summarySheet.getCell(`${prodCatCol}11`).value = 'Produk'
  summarySheet.getCell(`${prodValCol}11`).value = 'Qty Terjual'

  let productCategories = []
  let productValues = []
  let endProductRow = 12

  if (sortedProductEntries.length === 0) {
    productCategories = ['Belum ada penjualan']
    productValues = [0]
    summarySheet.getCell(`${prodCatCol}12`).value = 'Belum ada penjualan'
    summarySheet.getCell(`${prodValCol}12`).value = 0
    endProductRow = 12
  } else {
    productCategories = sortedProductEntries.map(([name]) => name)
    productValues = sortedProductEntries.map(([, qty]) => qty)
    sortedProductEntries.forEach(([name, qty], idx) => {
      const rIdx = 12 + idx
      summarySheet.getCell(`${prodCatCol}${rIdx}`).value = name
      summarySheet.getCell(`${prodValCol}${rIdx}`).value = qty
      summarySheet.getCell(`${prodValCol}${rIdx}`).numFmt = '#,##0'
    })
    endProductRow = 11 + sortedProductEntries.length
  }

  const productCategoriesRef = `'Ringkasan'!$${prodCatCol}$12:$${prodCatCol}$${endProductRow}`
  const productValuesRef = `'Ringkasan'!$${prodValCol}$12:$${prodValCol}$${endProductRow}`

  // Untung vs Rugi Helper Data
  const calculatedProfit = Math.max(0, summaryDailyReport.totals.revenue - summaryDailyReport.totals.kerugian)
  const calculatedLoss = summaryDailyReport.totals.kerugian

  summarySheet.getCell(`${barCatCol}11`).value = 'Status'
  summarySheet.getCell(`${barValCol}11`).value = 'Nilai'
  summarySheet.getCell(`${barCatCol}12`).value = 'Untung'
  summarySheet.getCell(`${barValCol}12`).value = {
    formula: `E${sumDailyRowIdx}-F${sumDailyRowIdx}`,
    result: calculatedProfit,
  }
  summarySheet.getCell(`${barValCol}12`).numFmt = '"Rp "#,##0'

  summarySheet.getCell(`${barCatCol}13`).value = 'Rugi'
  summarySheet.getCell(`${barValCol}13`).value = {
    formula: `F${sumDailyRowIdx}`,
    result: calculatedLoss,
  }
  summarySheet.getCell(`${barValCol}13`).numFmt = '"Rp "#,##0'

  const barCategoriesRef = `'Ringkasan'!$${barCatCol}$12:$${barCatCol}$13`
  const barValuesRef = `'Ringkasan'!$${barValCol}$12:$${barValCol}$13`

  // Lebar kolom Ringkasan (A-F: Laporan harian, G-I: Spacer, J-Q: Area Native Chart)
  summarySheet.columns = [
    { width: 16 }, // A: Tanggal
    { width: 18 }, // B: Jumlah Transaksi
    { width: 16 }, // C: Produk Terjual
    { width: 24 }, // D: Produk Terlaris
    { width: 20 }, // E: Revenue
    { width: 18 }, // F: Kerugian
    { width: 4 },  // G: Spacer
    { width: 4 },  // H: Spacer (H11:I13 kosong, bukan tabel)
    { width: 4 },  // I: Spacer
    { width: 12 }, // J: Chart Area start (J11)
    { width: 12 }, // K: Chart Area
    { width: 12 }, // L: Chart Area
    { width: 12 }, // M: Chart Area
    { width: 12 }, // N: Chart Area
    { width: 12 }, // O: Chart Area
    { width: 12 }, // P: Chart Area
    { width: 12 }, // Q: Chart Area end (Q28)
  ]

  // Explicitly hide helper columns AA, AB, AC, AD after columns assignment
  summarySheet.getColumn('AA').hidden = true
  summarySheet.getColumn('AB').hidden = true
  summarySheet.getColumn('AC').hidden = true
  summarySheet.getColumn('AD').hidden = true

  // ============================================================
  // 2. SHEET BULANAN (Setiap bulan memiliki sheet sendiri, data HARIAN)
  // ============================================================
  for (const month of monthlyPartitions) {
    const isExportMonth = (month.year === expYear && month.monthIndex === expMonth)
    const cutoff = isExportMonth ? expDay : getDaysInMonth(month.year, month.monthIndex)

    const monthDailyReport = buildDailyReportData({
      orders: month.orders,
      year: month.year,
      monthIndex: month.monthIndex,
      cutoffDay: cutoff,
    })

    const monthSheet = workbook.addWorksheet(month.label, {
      views: [{ showGridLines: true }],
    })

    // Header Sheet Bulanan
    monthSheet.mergeCells('A1:F1')
    const mTitleCell = monthSheet.getCell('A1')
    mTitleCell.value = `LAPORAN PENJUALAN - ${month.label.toUpperCase()}`
    mTitleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
    mTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Teal
    }
    mTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    monthSheet.getRow(1).height = 28

    // Tabel Harian di Sheet Bulanan
    monthSheet.getCell('A3').value = `LAPORAN PENJUALAN HARIAN (1–${monthDailyReport.maxDay} ${MONTH_NAMES_ID[month.monthIndex].toUpperCase()})`
    monthSheet.getCell('A3').font = { bold: true, size: 10, color: { argb: 'FF0F766E' } }

    monthSheet.getRow(4).values = ['Tanggal', 'Jumlah Transaksi', 'Produk Terjual', 'Produk Terlaris', 'Revenue', 'Kerugian']
    monthSheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    monthSheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

    let mDailyRowIdx = 5
    for (const r of monthDailyReport.rows) {
      const row = monthSheet.getRow(mDailyRowIdx)
      row.values = [
        r.dateLabel,
        r.count,
        r.itemsQty,
        r.bestSeller,
        r.revenue,
        r.kerugian,
      ]
      monthSheet.getCell(`B${mDailyRowIdx}`).numFmt = '#,##0'
      monthSheet.getCell(`C${mDailyRowIdx}`).numFmt = '#,##0'
      monthSheet.getCell(`E${mDailyRowIdx}`).numFmt = '"Rp "#,##0'
      monthSheet.getCell(`F${mDailyRowIdx}`).numFmt = '"Rp "#,##0'
      mDailyRowIdx++
    }

    const endMDailyRow = mDailyRowIdx - 1
    // Baris TOTAL di Sheet Bulanan
    const mDailyTotalRow = monthSheet.getRow(mDailyRowIdx)
    mDailyTotalRow.values = [
      'TOTAL',
      { formula: `SUM(B5:B${endMDailyRow})`, result: monthDailyReport.totals.count },
      { formula: `SUM(C5:C${endMDailyRow})`, result: monthDailyReport.totals.itemsQty },
      '-',
      { formula: `SUM(E5:E${endMDailyRow})`, result: monthDailyReport.totals.revenue },
      { formula: `SUM(F5:F${endMDailyRow})`, result: monthDailyReport.totals.kerugian },
    ]
    mDailyTotalRow.font = { bold: true }
    mDailyTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    monthSheet.getCell(`B${mDailyRowIdx}`).numFmt = '#,##0'
    monthSheet.getCell(`C${mDailyRowIdx}`).numFmt = '#,##0'
    monthSheet.getCell(`E${mDailyRowIdx}`).numFmt = '"Rp "#,##0'
    monthSheet.getCell(`F${mDailyRowIdx}`).numFmt = '"Rp "#,##0'

    // Diagram Batang Harian terhubung ke kolom Revenue
    if (monthDailyReport.rows.length > 0) {
      monthSheet.addConditionalFormatting({
        ref: `E5:E${endMDailyRow}`,
        rules: [
          {
            type: 'dataBar',
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: { argb: 'FF2563EB' }, // Royal Blue
            showValue: true,
            gradient: true,
          },
        ],
      })

      // Highlight kerugian jika > 0
      monthSheet.addConditionalFormatting({
        ref: `F5:F${endMDailyRow}`,
        rules: [
          {
            type: 'cellIs',
            operator: 'greaterThan',
            formulae: ['0'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } },
              font: { color: { argb: 'FF721C24' }, bold: true },
            },
          },
        ],
      })
    }

    // ============================================================
    // TABEL DETAIL TRANSAKSI RIIL (Section 2: Daftar Transaksi Aktual)
    // ============================================================
    const txStartRow = mDailyRowIdx + 3
    monthSheet.getCell(`A${txStartRow - 1}`).value = `DETAIL DAFTAR TRANSAKSI PENJUALAN - ${month.label.toUpperCase()}`
    monthSheet.getCell(`A${txStartRow - 1}`).font = { bold: true, size: 11, color: { argb: 'FF0F766E' } }

    const txRows = []
    for (const order of month.orders) {
      const orderDateStr = new Date(order.created_at).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
      const orderNumber = order.order_number ? `#${order.order_number}` : String(order.id).slice(0, 8)
      const payMethod = order.payment_method || 'CASH'
      const statusText = `${order.payment_status || 'paid'} / ${order.order_status || 'completed'}`

      const items = order.items && order.items.length > 0 ? order.items : [
        {
          product_name: 'Penjualan Umum',
          quantity: 1,
          unit_price: Number(order.subtotal) || Number(order.total) || 0,
          subtotal: Number(order.subtotal) || Number(order.total) || 0,
          variant_details: null,
        }
      ]

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        let variantText = '-'
        if (item.variant_details) {
          if (typeof item.variant_details === 'string') {
            variantText = item.variant_details
          } else if (item.variant_details.name || item.variant_details.title) {
            variantText = item.variant_details.name || item.variant_details.title
          } else {
            variantText = JSON.stringify(item.variant_details)
          }
        }

        const itemDiscount = i === 0 ? Number(order.discount_amount) || 0 : 0
        const itemTotal = Number(item.subtotal) - itemDiscount

        txRows.push([
          orderDateStr,
          orderNumber,
          item.product_name || 'Produk',
          variantText,
          Number(item.quantity) || 1,
          Number(item.unit_price) || 0,
          Number(item.subtotal) || 0,
          itemDiscount,
          itemTotal,
          payMethod.toUpperCase(),
          statusText.toUpperCase()
        ])
      }
    }

    if (txRows.length === 0) {
      txRows.push([
        '-', 'Belum ada transaksi', '-', '-', 0, 0, 0, 0, 0, '-', '-'
      ])
    }

    const tableName = `Tabel_${month.year}_${month.monthIndex + 1}_${Math.floor(Math.random() * 1000)}`
    monthSheet.addTable({
      name: tableName,
      ref: `A${txStartRow}`,
      headerRow: true,
      totalsRow: true,
      style: {
        theme: 'TableStyleMedium2',
        showRowStripes: true,
      },
      columns: [
        { name: 'Tanggal', totalsRowLabel: 'Total Bulanan:' },
        { name: 'Nomor Order', totalsRowFunction: 'count' },
        { name: 'Produk' },
        { name: 'Varian' },
        { name: 'Quantity', totalsRowFunction: 'sum' },
        { name: 'Harga' },
        { name: 'Subtotal', totalsRowFunction: 'sum' },
        { name: 'Diskon', totalsRowFunction: 'sum' },
        { name: 'Total', totalsRowFunction: 'sum' },
        { name: 'Metode Pembayaran' },
        { name: 'Status Pembayaran / Order' },
      ],
      rows: txRows,
    })

    monthSheet.getColumn(5).numFmt = '#,##0'
    monthSheet.getColumn(6).numFmt = '"Rp "#,##0'
    monthSheet.getColumn(7).numFmt = '"Rp "#,##0'
    monthSheet.getColumn(8).numFmt = '"Rp "#,##0'
    monthSheet.getColumn(9).numFmt = '"Rp "#,##0'

    // Lebar kolom sheet bulanan
    monthSheet.columns = [
      { width: 18 },
      { width: 16 },
      { width: 24 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 18 },
      { width: 18 },
      { width: 26 },
    ]
  }

  // ============================================================
  // 3. SHEET INVENTORI & STOK (Untuk Stok Menipis: KUNING)
  // ============================================================
  if (inventory.length > 0) {
    const invSheet = workbook.addWorksheet('Status Stok Inventori', {
      views: [{ showGridLines: true }],
    })

    invSheet.mergeCells('A1:E1')
    const invTitle = invSheet.getCell('A1')
    invTitle.value = 'STATUS STOK PRODUK & PERINGATAN REORDER'
    invTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
    invTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } } // Amber
    invTitle.alignment = { horizontal: 'center', vertical: 'middle' }
    invSheet.getRow(1).height = 26

    invSheet.getRow(3).values = ['Nama Produk', 'Lokasi Gudang', 'Stok Saat Ini', 'Batas Minimum Stok', 'Status']
    invSheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    invSheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

    const invRows = inventory.map((item) => {
      const currentStock = Number(item.quantity) || 0
      const minStock = Number(item.min_stock) || 0
      const statusLabel = currentStock <= minStock ? 'STOK MENIPIS' : 'AMAN'
      return [
        item.product?.name || 'Produk',
        item.location || 'Gudang Utama',
        currentStock,
        minStock,
        statusLabel,
      ]
    })

    let invRowIdx = 4
    for (const r of invRows) {
      invSheet.getRow(invRowIdx).values = r
      invRowIdx++
    }

    // Conditional formatting KUNING untuk stok menipis (C <= D)
    const endInvRow = invRowIdx - 1
    invSheet.addConditionalFormatting({
      ref: `C4:E${endInvRow}`,
      rules: [
        {
          type: 'expression',
          formulae: ['C4<=D4'],
          style: {
            fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF3CD' } }, // Kuning
            font: { color: { argb: 'FF856404' }, bold: true },
          },
        },
      ],
    })

    invSheet.columns = [
      { width: 28 },
      { width: 20 },
      { width: 16 },
      { width: 20 },
      { width: 18 },
    ]
  }

  // ============================================================
  // 4. NATIVE EXCEL CHART CONFIGURATION (g1.md: Pie/Doughnut Chart Komposisi Penjualan Produk)
  // ============================================================
  let chartConfig

  if (chartType === 'revenue_daily') {
    chartConfig = {
      sheetName: 'Ringkasan',
      chartType: 'bar',
      title: 'Revenue Harian',
      seriesName: 'Revenue',
      headerRef: `'Ringkasan'!$E$11`,
      categoriesRef: `'Ringkasan'!$A$12:$A$${endSummaryDailyRow}`,
      valuesRef: `'Ringkasan'!$E$12:$E$${endSummaryDailyRow}`,
      categories: summaryDailyReport.rows.map((d) => d.dateLabel),
      values: summaryDailyReport.rows.map((d) => d.revenue),
      from: { col: 9, row: 10 },
      to: { col: 16, row: 28 },
    }
  } else if (chartType === 'bar') {
    // Untung vs Rugi Bar Chart (Backwards compatibility)
    chartConfig = {
      sheetName: 'Ringkasan',
      chartType: 'bar',
      title: 'Untung vs Rugi',
      seriesName: 'Nilai',
      headerRef: `'Ringkasan'!$${barValCol}$11`,
      categoriesRef: barCategoriesRef,
      valuesRef: barValuesRef,
      categories: ['Untung', 'Rugi'],
      values: [calculatedProfit, calculatedLoss],
      from: { col: 9, row: 10 },
      to: { col: 16, row: 28 },
    }
  } else {
    // Default & 'doughnut' & 'pie': Komposisi Penjualan Produk (g1.md)
    const selectedChartType = chartType === 'pie' ? 'pie' : 'doughnut'
    chartConfig = {
      sheetName: 'Ringkasan',
      chartType: selectedChartType,
      title: 'Komposisi Penjualan Produk',
      seriesName: 'Produk Terjual',
      headerRef: `'Ringkasan'!$AB$11`,
      categoriesRef: productCategoriesRef,
      valuesRef: productValuesRef,
      categories: productCategories,
      values: productValues,
      holeSize: 50,
      from: { col: 9, row: 10 }, // Kolom J (index 9), Baris 11 (index 10)
      to: { col: 16, row: 28 },   // Kolom Q (index 16), Baris 29 (index 28)
    }
  }

  workbook.nativeChartConfig = chartConfig

  const originalWriteBuffer = workbook.xlsx.writeBuffer.bind(workbook.xlsx)
  workbook.xlsx.writeBuffer = async function (options) {
    const rawBuffer = await originalWriteBuffer(options)
    return await injectNativeChart(rawBuffer, chartConfig)
  }

  if (typeof workbook.xlsx.writeFile === 'function') {
    const originalWriteFile = workbook.xlsx.writeFile.bind(workbook.xlsx)
    workbook.xlsx.writeFile = async function (filePath, options) {
      const buffer = await workbook.xlsx.writeBuffer(options)
      if (typeof window === 'undefined') {
        const fsMod = await import(/* @vite-ignore */ 'node:fs')
        return fsMod.promises.writeFile(filePath, Buffer.from(buffer))
      }
      throw new Error('writeFile is only supported in Node.js environment')
    }
  }

  return workbook
}

/**
 * Trigger download file .xlsx langsung di browser
 */
export async function downloadSalesExcel({ businessName, orders, inventory, filename, exportDate }) {
  const d = exportDate || new Date()
  const defaultFilename = `Laporan_Excel_Penjualan_${(businessName || 'BisnisSehat').replace(/\s+/g, '_')}_${d.toISOString().slice(0, 10)}.xlsx`
  const targetFilename = filename || defaultFilename

  const workbook = await generateSalesWorkbook({ businessName, orders, inventory, exportDate: d })
  const buffer = await workbook.xlsx.writeBuffer()

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = targetFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
