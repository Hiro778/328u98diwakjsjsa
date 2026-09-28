Langsung implementasikan, jangan hanya membuat dokumentasi.

Requirement:
Tambahkan NATIVE Excel BAR/LINE CHART ke file export ExcelJS pada Excel Penjualan Otomatis.

PENTING:
- Jangan mengubah canonicalSalesService.js.
- Jangan mengubah perhitungan Revenue, Produk Terjual, Produk Terlaris, Transaksi, AOV, atau Kerugian.
- Jangan mengubah source-of-truth.
- Jangan mengubah UI web.
- Jangan menghapus DataBar jika masih berguna sebagai visual tambahan.
- Fokus hanya pada export XLSX.
- Gunakan Context7 hanya untuk verifikasi API ExcelJS yang diperlukan.

Chart:
- Native Excel chart, bukan conditional formatting DataBar.
- Gunakan data harian dari sheet bulanan.
- X-axis = tanggal/hari.
- Y-axis = Revenue.
- Setiap hari menjadi satu data point.
- Hanya tampilkan hari yang sudah berjalan pada periode tersebut.
- Jangan membuat tanggal masa depan.
- Judul: "Revenue Harian".
- Chart harus tetap editable ketika XLSX dibuka di Microsoft Excel.
- Jangan hardcode nilai.
- Source range harus berasal dari tabel daily sales yang sudah dibuat oleh excelSalesService.
- Jika revenue semua Rp0, chart tetap valid tetapi tidak boleh membuat data palsu.

Layout:
- Letakkan chart di area Ringkasan atau area yang tidak menimpa tabel/KPI.
- Pastikan chart tidak menutupi KPI atau daily table.
- Ukuran chart responsif secukupnya untuk desktop Excel.
- Jangan membuat chart untuk setiap hari; satu chart revenue harian saja.

Tetap pertahankan:
1. Produk Terjual = SUM(order_items.quantity) dari final orders.
2. Produk Terlaris = produk dengan total quantity terbesar.
3. Revenue = SUM(orders.total) dari final orders.
4. Pending/cancelled/failed tidak dihitung.
5. Canonical source-of-truth tetap canonicalSalesService.js.

Verifikasi:
1. Export XLSX periode September 2026.
2. Pastikan hanya tanggal 1 sampai cutoff/current day yang muncul.
3. Buka hasil XLSX menggunakan unzip/XML inspection jika perlu.
4. Pastikan terdapat native chart XML/chart relationship, bukan hanya conditionalFormatting dataBar.
5. Pastikan chart series mengambil range daily revenue yang benar.
6. Pastikan tidak ada hardcoded revenue.
7. Jalankan test terkait Excel.
8. npm test.
9. npm run build.

Laporkan:
- file yang diubah
- API ExcelJS yang benar-benar digunakan
- range source chart
- jumlah test PASS
- build PASS
- bukti bahwa XLSX memiliki native chart, bukan DataBar saja.

Jangan berhenti di analisis atau membuat .md baru. Implementasikan langsung.
