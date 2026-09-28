JANGAN ubah fitur lain. Jangan full test suite.

Ada 1 requirement yang BELUM terpenuhi:

Saat ini "Diagram Batang" dibuat menggunakan:
dataBar conditional formatting.

ITU BUKAN native Excel chart.

Saya membutuhkan NATIVE EXCEL BAR/COLUMN CHART OBJECT
yang tersimpan di dalam file .xlsx.

Pertahankan semua implementasi yang sudah benar.

Sekarang fokus HANYA mengganti bagian chart:

1. Temukan implementasi dataBar yang disebut sebagai diagram.
2. Jangan hapus conditional formatting hijau/kuning/merah.
3. Tambahkan/ganti dengan native Excel chart object.
4. Chart harus menggunakan data penjualan aktual.
5. X-axis = tanggal/periode.
6. Y-axis = total penjualan.
7. Chart harus tersimpan di file .xlsx.
8. Saat .xlsx dibuka di Microsoft Excel, chart harus muncul sebagai
   chart normal yang bisa dipilih/diedit, bukan bar warna di dalam cell.

Jika ExcelJS yang sekarang digunakan TIDAK mendukung native chart,
JANGAN kembali menggunakan DataBar sebagai pengganti.

Gunakan library/pendekatan yang benar-benar dapat menghasilkan
native Excel chart dalam .xlsx.

Jangan membuat dokumentasi.
Jangan membuat artifact.
Jangan Context7 kecuali memang diperlukan untuk mencari API
implementasi chart.
Jangan redesign UI.
Jangan menyentuh QR Menu/POS/Checkout.

Setelah selesai:

- npm run build
- generate 1 file .xlsx nyata
- buka/inspect workbook tersebut
- verifikasi bahwa ada native chart object.

Laporan akhir WAJIB menyebut:
library yang digunakan,
jenis chart,
sheet chart,
dan bagaimana chart terhubung ke source data.

Jangan bilang PASS kalau yang dibuat masih DataBar.
