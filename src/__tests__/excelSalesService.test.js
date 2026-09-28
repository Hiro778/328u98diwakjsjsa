import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { CATEGORIES } from '../data/categories.js'
import {
  getMonthYearLabel,
  getDaysInMonth,
  aggregateSalesMetrics,
  partitionOrdersByMonth,
  generateSalesWorkbook,
  fetchBusinessSalesData,
  buildDailyReportData,
} from '../services/excelSalesService.js'

describe('Excel Penjualan Otomatis Test Suite (sheet.md & excell.md)', () => {
  // ============================================================
  // 1. KATALOG OPERASIONAL
  // ============================================================
  it('1. Telegram Operasional is removed and replaced with Excel Penjualan Otomatis in catalog', () => {
    const operationsTools = CATEGORIES.operations.tools

    const telegramTool = operationsTools.find((t) => t.name === 'Telegram Operasional')
    assert.equal(telegramTool, undefined, 'Telegram Operasional must NOT be active in catalog')

    const excelTool = operationsTools.find((t) => t.name === 'Excel Penjualan Otomatis')
    assert.ok(excelTool, 'Excel Penjualan Otomatis must be present in operations.tools')
    assert.equal(excelTool.path, '/dashboard/operasional/excel-penjualan')
    assert.equal(operationsTools.length, 6, 'Operations category must strictly have 6 tools')
  })

  // ============================================================
  // 2. ROUTE INTEGRATION
  // ============================================================
  it('2. Route operasional/excel-penjualan is registered in App.jsx', () => {
    const appSrc = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
    assert.ok(appSrc.includes('operasional/excel-penjualan'), 'App.jsx must configure route operasional/excel-penjualan')
    assert.ok(appSrc.includes('ExcelPenjualanPage'), 'App.jsx must import ExcelPenjualanPage')
  })

  // ============================================================
  // 3. TENANT ISOLATION
  // ============================================================
  it('3. fetchBusinessSalesData enforces tenant isolation (rejects missing businessId)', async () => {
    await assert.rejects(
      async () => {
        await fetchBusinessSalesData(null)
      },
      {
        name: 'Error',
        message: /Tenant isolation: business_id wajib disertakan/,
      }
    )
  })

  // ============================================================
  // 4. METRICS AGGREGATION & 6 KPI NOMENCLATURE
  // ============================================================
  it('4. aggregateSalesMetrics correctly computes Total Revenue, Transaksi, Qty, Best Seller, and Kerugian', () => {
    const mockOrders = [
      {
        total: 100000,
        discount_amount: 10000,
        items: [
          { product_name: 'Kopi Susu Gula Aren', quantity: 2 },
          { product_name: 'Roti Bakar Cokelat', quantity: 1 },
        ],
      },
      {
        total: 75000,
        discount_amount: 5000,
        items: [
          { product_name: 'Kopi Susu Gula Aren', quantity: 3 },
        ],
      },
    ]

    const metrics = aggregateSalesMetrics(mockOrders)
    assert.equal(metrics.totalRevenue, 175000)
    assert.equal(metrics.totalOmzet, 175000)
    assert.equal(metrics.totalDiskon, 15000)
    assert.equal(metrics.totalTransaksi, 2)
    assert.equal(metrics.totalProdukTerjual, 6)
    assert.equal(metrics.totalKerugian, 0)
    assert.equal(metrics.rataRataNilaiTransaksi, 87500)
    assert.ok(metrics.produkTerlaris.includes('Kopi Susu Gula Aren (5 terjual)'))
  })

  // ============================================================
  // 5. CALENDAR DAYS ACCURACY (No assuming 30 days)
  // ============================================================
  it('5. getDaysInMonth accurately uses actual calendar days per month', () => {
    // September has 30 days
    assert.equal(getDaysInMonth(2026, 8), 30, 'September must have 30 days')
    // October has 31 days
    assert.equal(getDaysInMonth(2026, 9), 31, 'October must have 31 days')
    // February 2026 has 28 days (not leap)
    assert.equal(getDaysInMonth(2026, 1), 28, 'February 2026 must have 28 days')
    // February 2028 has 29 days (leap)
    assert.equal(getDaysInMonth(2028, 1), 29, 'February 2028 must have 29 days')
  })

  // ============================================================
  // 6. MONTHLY PARTITIONING & ACCUMULATIVE MULTI-SHEET
  // ============================================================
  it('6. partitionOrdersByMonth partitions chronologically and preserves multiple periods', () => {
    const mockOrders = [
      { id: '1', created_at: '2026-09-10T10:00:00Z', total: 50000 },
      { id: '2', created_at: '2026-09-22T14:30:00Z', total: 60000 },
      { id: '3', created_at: '2026-10-05T09:15:00Z', total: 90000 },
    ]

    const partitions = partitionOrdersByMonth(mockOrders)
    assert.equal(partitions.length, 2, 'Must have 2 separate month partitions')
    assert.equal(partitions[0].label, 'September 2026')
    assert.equal(partitions[0].orders.length, 2)
    assert.equal(partitions[1].label, 'Oktober 2026')
    assert.equal(partitions[1].orders.length, 1)
  })

  // ============================================================
  // 7. DAILY REPORT BUILDER (1 ROW = 1 DAY, DYNAMIC CUTOFF, NO FUTURE DAYS)
  // ============================================================
  it('7. buildDailyReportData restricts days up to cutoff (1..24 Sep only, no 25..30)', () => {
    const mockOrders = [
      {
        created_at: '2026-09-01T10:00:00Z',
        total: 200000,
        items: [{ product_name: 'Nasi Goreng', quantity: 4 }],
      },
      {
        created_at: '2026-09-03T11:00:00Z',
        total: 450000,
        items: [{ product_name: 'Kopi', quantity: 8 }],
      },
      {
        created_at: '2026-09-24T15:00:00Z',
        total: 4365000,
        items: [{ product_name: 'hai', quantity: 27 }],
      },
    ]

    // Export on 24 September 2026: cutoffDay = 24
    const report = buildDailyReportData({
      orders: mockOrders,
      year: 2026,
      monthIndex: 8, // September
      cutoffDay: 24,
    })

    assert.equal(report.maxDay, 24, 'Max day must be strictly 24')
    assert.equal(report.rows.length, 24, 'Must have exactly 24 rows for 1..24 Sep')

    // 1 Sep check
    const row1 = report.rows[0]
    assert.equal(row1.dateLabel, '1 Sep')
    assert.equal(row1.count, 1)
    assert.equal(row1.itemsQty, 4)
    assert.equal(row1.bestSeller, 'Nasi Goreng')
    assert.equal(row1.revenue, 200000)
    assert.equal(row1.kerugian, 0)

    // 2 Sep check (0 transactions -> Produk Terlaris = '-')
    const row2 = report.rows[1]
    assert.equal(row2.dateLabel, '2 Sep')
    assert.equal(row2.count, 0)
    assert.equal(row2.itemsQty, 0)
    assert.equal(row2.bestSeller, '-')
    assert.equal(row2.revenue, 0)
    assert.equal(row2.kerugian, 0)

    // 24 Sep check
    const row24 = report.rows[23]
    assert.equal(row24.dateLabel, '24 Sep')
    assert.equal(row24.count, 1)
    assert.equal(row24.itemsQty, 27)
    assert.equal(row24.bestSeller, 'hai')
    assert.equal(row24.revenue, 4365000)
    assert.equal(row24.kerugian, 0)

    // Totals verification
    assert.equal(report.totals.count, 3)
    assert.equal(report.totals.itemsQty, 39)
    assert.equal(report.totals.revenue, 5015000)
    assert.equal(report.totals.kerugian, 0)
  })

  // ============================================================
  // 8. WORKBOOK GENERATION & STRUCTURE (sheet.md Minimal Verifikasi 1..11)
  // ============================================================
  it('8. generateSalesWorkbook generates 1..24 Sep, proper KPI, daily tables, and formulas', async () => {
    const mockOrders = [
      {
        id: 'ord-001',
        order_number: 101,
        created_at: '2026-09-01T10:00:00Z',
        subtotal: 200000,
        discount_amount: 0,
        total: 200000,
        payment_method: 'CASH',
        order_status: 'completed',
        payment_status: 'paid',
        items: [
          {
            product_name: 'Nasi Goreng',
            quantity: 4,
            unit_price: 50000,
            subtotal: 200000,
            variant_details: null,
          },
        ],
      },
      {
        id: 'ord-002',
        order_number: 102,
        created_at: '2026-09-03T14:00:00Z',
        subtotal: 450000,
        discount_amount: 0,
        total: 450000,
        payment_method: 'QRIS',
        order_status: 'completed',
        payment_status: 'paid',
        items: [
          {
            product_name: 'Kopi',
            quantity: 8,
            unit_price: 56250,
            subtotal: 450000,
            variant_details: null,
          },
        ],
      },
    ]

    const mockInventory = [
      {
        product: { name: 'Biji Kopi Arabika', business_id: 'biz-1' },
        quantity: 3,
        min_stock: 5,
        location: 'Rak A1',
      },
    ]

    const exportDate = new Date(2026, 8, 24) // 24 September 2026

    const workbook = await generateSalesWorkbook({
      businessName: 'Kopi Kenangan Sehat',
      orders: mockOrders,
      inventory: mockInventory,
      exportDate,
    })

    // Sheet 1: Ringkasan
    const ringkasanSheet = workbook.getWorksheet('Ringkasan')
    assert.ok(ringkasanSheet, 'Sheet Ringkasan harus ada')

    // 10. KPI atas tetap tampil dan benar (6 cards)
    assert.equal(ringkasanSheet.getCell('A6').value, 'Total Revenue')
    assert.equal(ringkasanSheet.getCell('B6').value, 'Total Transaksi')
    assert.equal(ringkasanSheet.getCell('C6').value, 'Total Produk Terjual')
    assert.equal(ringkasanSheet.getCell('D6').value, 'Produk Terlaris')
    assert.equal(ringkasanSheet.getCell('E6').value, 'Total Kerugian')
    assert.equal(ringkasanSheet.getCell('F6').value, 'Rata-rata Nilai Transaksi')

    assert.equal(ringkasanSheet.getCell('A7').value, 650000)
    assert.equal(ringkasanSheet.getCell('B7').value, 2)
    assert.equal(ringkasanSheet.getCell('C7').value, 12)
    assert.equal(ringkasanSheet.getCell('E7').value, 0)

    // Verifikasi bahwa TIDAK ADA tabel helper di sheet Ringkasan (H11:I13 bersih)
    assert.equal(ringkasanSheet.getCell('H11').value, null, 'H11 tidak boleh menampilkan tabel helper')
    assert.equal(ringkasanSheet.getCell('I11').value, null, 'I11 tidak boleh menampilkan tabel helper')
    assert.equal(ringkasanSheet.getCell('H12').value, null, 'H12 tidak boleh menampilkan tabel helper')
    assert.equal(ringkasanSheet.getCell('I12').value, null, 'I12 tidak boleh menampilkan tabel helper')

    // Verifikasi Sheet September 2026
    const sepSheet = workbook.getWorksheet('September 2026')
    assert.ok(sepSheet, 'Sheet September 2026 harus ada')

    // 2. Sheet September 2026 hanya memiliki tanggal 1–24 (Row 5 s.d. 28)
    assert.equal(sepSheet.getCell('A5').value, '1 Sep')
    assert.equal(sepSheet.getCell('A28').value, '24 Sep')

    // 7. Total bawah = SUM seluruh hari (Row 29)
    assert.equal(sepSheet.getCell('A29').value, 'TOTAL')
    const formulaCell = sepSheet.getCell('B29').value
    assert.ok(formulaCell.formula.includes('SUM(B5:B28)'))

    // 9. Tidak ada data tanggal 25–30 (Row 30 bukan data tanggal 25)
    assert.notEqual(sepSheet.getCell('A30').value, '25 Sep')
    assert.notEqual(sepSheet.getCell('A31').value, '26 Sep')

    // 11. XLSX buffer valid
    const buffer = await workbook.xlsx.writeBuffer()
    assert.ok(buffer.length > 1000, 'XLSX buffer must be generated and non-empty')
    const uint8 = new Uint8Array(buffer)
    assert.equal(uint8[0], 0x50, 'File harus berformat ZIP/XLSX (header P)')
    assert.equal(uint8[1], 0x4b, 'File harus berformat ZIP/XLSX (header K)')
  })

  // ============================================================
  // 9. NATIVE EXCEL BAR/COLUMN CHART: UNTUNG VS RUGI (J11:O28)
  // ============================================================
  it('9. XLSX output contains Native Excel Column Chart "Untung vs Rugi" in area J11:O28 with hidden helper', async () => {
    const mockOrders = [
      {
        id: 'ord-101',
        created_at: '2026-09-02T10:00:00Z',
        total: 1500000,
        order_status: 'completed',
        payment_status: 'paid',
        items: [{ product_name: 'Espresso', quantity: 5 }],
      },
      {
        id: 'ord-102',
        created_at: '2026-09-15T15:00:00Z',
        total: 300000,
        order_status: 'completed',
        payment_status: 'refunded',
        items: [{ product_name: 'Latte', quantity: 2 }],
      },
    ]

    const exportDate = new Date(2026, 8, 24) // 24 September 2026
    const workbook = await generateSalesWorkbook({
      businessName: 'Cafe Sehat Mandiri',
      orders: mockOrders,
      inventory: [],
      exportDate,
      // default chartType is 'bar' -> Untung vs Rugi
    })

    const ringkasanSheet = workbook.getWorksheet('Ringkasan')

    // 1. Verifikasi H11:I13 BUKAN tabel helper (harus bersih/null)
    assert.equal(ringkasanSheet.getCell('H11').value, null, 'H11 tidak boleh menampilkan tabel helper')
    assert.equal(ringkasanSheet.getCell('I11').value, null, 'I11 tidak boleh menampilkan tabel helper')
    assert.equal(ringkasanSheet.getCell('H12').value, null, 'H12 tidak boleh menampilkan tabel helper')
    assert.equal(ringkasanSheet.getCell('I12').value, null, 'I12 tidak boleh menampilkan tabel helper')

    // 2. Verifikasi Helper Data di kolom tersembunyi AA & AB
    assert.equal(ringkasanSheet.getColumn('AA').hidden, true, 'Kolom AA harus hidden')
    assert.equal(ringkasanSheet.getColumn('AB').hidden, true, 'Kolom AB harus hidden')
    assert.equal(ringkasanSheet.getCell('AA12').value, 'Untung')
    assert.equal(ringkasanSheet.getCell('AA13').value, 'Rugi')

    // 3. Verifikasi Formula Untung: Profit = Revenue - Kerugian
    // Revenue = 1.500.000, Kerugian = 300.000 -> Profit = 1.200.000
    const profitFormulaCell = ringkasanSheet.getCell('AB12').value
    assert.ok(String(profitFormulaCell.formula).includes('-'), 'Untung harus menggunakan formula Revenue - Kerugian')
    assert.equal(profitFormulaCell.result, 1200000, 'Hasil Untung harus 1.500.000 - 300.000 = 1.200.000')

    const lossFormulaCell = ringkasanSheet.getCell('AB13').value
    assert.equal(lossFormulaCell.result, 300000, 'Hasil Rugi harus 300.000')

    const buffer = await workbook.xlsx.writeBuffer()
    assert.ok(buffer && buffer.length > 1000, 'Buffer must be valid')

    // Unzip & inspect OpenXML structures
    const zip = await JSZip.loadAsync(buffer)

    // 4. Verify chart and drawing files exist in zip
    assert.ok(zip.file('xl/charts/chart1.xml'), 'xl/charts/chart1.xml must exist in .xlsx archive')
    assert.ok(zip.file('xl/drawings/drawing1.xml'), 'xl/drawings/drawing1.xml must exist in .xlsx archive')
    assert.ok(zip.file('xl/drawings/_rels/drawing1.xml.rels'), 'drawing1 rels must exist')
    assert.ok(zip.file('xl/worksheets/_rels/sheet1.xml.rels'), 'sheet1 rels must exist')

    // 5. Verify chart XML contents
    const chartXml = await zip.file('xl/charts/chart1.xml').async('text')
    assert.ok(chartXml.includes('<c:barChart>'), 'chart1.xml must contain native <c:barChart>')
    assert.ok(chartXml.includes('<c:barDir val="col"/>'), 'Chart must be column orientation')
    assert.ok(chartXml.includes('Untung vs Rugi'), 'Chart title must be "Untung vs Rugi"')

    // Category X-axis must point to hidden AA12:AA13
    assert.ok(chartXml.includes('&apos;Ringkasan&apos;!$AA$12:$AA$13'), 'Chart category series must reference Ringkasan AA12:AA13')

    // Value Y-axis must point to hidden AB12:AB13
    assert.ok(chartXml.includes('&apos;Ringkasan&apos;!$AB$12:$AB$13'), 'Chart value series must reference Ringkasan AB12:AB13')

    // Data labels & Rupiah format
    assert.ok(chartXml.includes('<c:showVal val="1"/>'), 'Data labels must show values')
    assert.ok(chartXml.includes('&quot;Rp &quot;#,##0'), 'Data labels must be formatted as Rupiah')

    // 6. Verify drawing coordinates: J11:O28
    // Col J = index 9, Row 11 = index 10; Col P = index 15, Row 29 = index 28
    const drawingXml = await zip.file('xl/drawings/drawing1.xml').async('text')
    assert.ok(drawingXml.includes('<xdr:col>9</xdr:col>'), 'Drawing anchor starts at Column J (index 9)')
    assert.ok(drawingXml.includes('<xdr:row>10</xdr:row>'), 'Drawing anchor starts at Row 11 (index 10)')
  })

  // ============================================================
  // 10. EDGE CASE: Zero Revenue still produces valid Untung vs Rugi chart
  // ============================================================
  it('10. Zero revenue scenario produces valid native Untung vs Rugi chart without error', async () => {
    const exportDate = new Date(2026, 8, 24)
    const workbook = await generateSalesWorkbook({
      businessName: 'Toko Baru',
      orders: [], // no sales
      inventory: [],
      exportDate,
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const zip = await JSZip.loadAsync(buffer)

    assert.ok(zip.file('xl/charts/chart1.xml'), 'Chart XML must exist even with 0 revenue')
    const chartXml = await zip.file('xl/charts/chart1.xml').async('text')
    assert.ok(chartXml.includes('<c:barChart>'), 'Chart is valid bar chart')
    assert.ok(chartXml.includes('Untung vs Rugi'), 'Chart title is Untung vs Rugi')
    assert.ok(chartXml.includes('&apos;Ringkasan&apos;!$AB$12:$AB$13'), 'Values point to AB cells')
  })

  // ============================================================
  // 11. REVENUE DAILY CHART SUPPORT (chartType: 'revenue_daily')
  // ============================================================
  it('11. revenue_daily chartType still supported for daily revenue chart', async () => {
    const mockOrders = [
      {
        id: 'ord-201',
        created_at: '2026-09-05T10:00:00Z',
        total: 1500000,
        order_status: 'completed',
        payment_status: 'paid',
        items: [{ product_name: 'Produk A', quantity: 10 }],
      },
    ]

    const exportDate = new Date(2026, 8, 24)
    const workbook = await generateSalesWorkbook({
      businessName: 'UMKM Mandiri',
      orders: mockOrders,
      inventory: [],
      exportDate,
      chartType: 'revenue_daily',
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const zip = await JSZip.loadAsync(buffer)

    const chartXml = await zip.file('xl/charts/chart1.xml').async('text')
    assert.ok(chartXml.includes('<c:barChart>'), 'Must be native bar chart')
    assert.ok(chartXml.includes('Revenue Harian'), 'Must have title Revenue Harian')
    assert.ok(chartXml.includes('&apos;Ringkasan&apos;!$E$12:$E$35'), 'Values reference daily revenue range')
  })
})

