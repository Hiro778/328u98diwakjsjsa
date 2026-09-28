AUDIT CEPAT — VALIDASI REALTIME DATA, JANGAN REDESIGN

Saya mau memastikan apakah 3 halaman ini benar-benar membaca
database aktual dan realtime:

1. /dashboard
2. /dashboard/analytics
3. /dashboard/operasional/excel-penjualan

JANGAN redesign UI.
JANGAN ubah schema.
JANGAN membuat fitur baru.
JANGAN full test suite.
Jangan membuat service baru jika service existing sudah benar.

DATA YANG TERLIHAT SAAT INI:

Excel Penjualan:
- Revenue Rp4.365.000
- 28 transaksi
- 27 produk terjual

Analytics:
- Revenue Rp4.365.000
- 28 transaksi
- 27 produk terjual

Dashboard:
- Revenue Rp0
- Inventory 0
- Customer 0

==================================================
TUJUAN
==================================================

Trace sumber data ketiga halaman tersebut.

Cari secara kode:

- service/query yang digunakan
- tabel Supabase
- business_id
- filter tanggal
- filter status order
- field revenue
- inventory source
- customer source
- realtime/subscription jika ada

Kemudian jawab berdasarkan KODE AKTUAL:

A. Apakah Rp4.365.000 benar-benar dihitung dari database?
B. Query tabel apa yang menghasilkan angka tersebut?
C. Apakah Excel dan Analytics menggunakan sumber data yang sama?
D. Apakah Dashboard menggunakan sumber data berbeda?
E. Apakah data benar-benar realtime atau hanya fetch ketika halaman dibuka/refresh?

==================================================
PENTING
==================================================

Jangan menyimpulkan "realtime" hanya karena datanya berasal dari
Supabase.

Bedakan:

1. DATABASE-LIVE:
   setiap fetch mengambil data terbaru dari Supabase.

2. REALTIME:
   halaman otomatis menerima perubahan ketika database berubah
   tanpa perlu refresh.

Jika saat ini hanya DATABASE-LIVE tetapi belum realtime subscription,
katakan dengan jelas.

==================================================
VALIDASI TANPA DATA PALSU
==================================================

Gunakan transaksi yang sudah ada.

Jangan hardcode Rp4.365.000.

Jika memungkinkan lakukan perubahan kecil yang aman pada database,
misalnya transaksi/test data yang sudah sesuai mekanisme aplikasi,
lalu cek apakah:

Analytics berubah otomatis?
Excel preview berubah setelah refetch?
Dashboard berubah otomatis?

Jangan mengubah data produksi sembarangan.

Kalau tidak aman melakukan mutation database,
cukup audit query + lifecycle fetch dan laporkan status realtime
sebenarnya.

==================================================
DASHBOARD UTAMA
==================================================

Cari root cause kenapa:

Dashboard = Rp0

sementara:

Analytics = Rp4.365.000
Excel = Rp4.365.000

Jika sumber data Analytics/Excel sudah benar,
gunakan service/query yang sama untuk Dashboard jika memang
secara semantik sesuai.

Jangan membuat query ketiga yang berbeda.

==================================================
HASIL YANG SAYA MAU
==================================================

Laporan singkat saja:

1. Rp4.365.000 berasal dari mana?
2. Tabel + field yang digunakan?
3. Excel realtime atau tidak?
4. Analytics realtime atau tidak?
5. Dashboard realtime atau tidak?
6. Kenapa Dashboard masih Rp0?
7. File yang perlu diperbaiki.

Kalau ada bug Dashboard, FIX bug tersebut saja.

Setelah itu:
- npm run build
- jalankan test yang relevan saja

STOP.
