FIX CUSTOMER SUPPORT / HELP CENTER — FAQ + RULES + BUG REPORT

PROJECT:
BisnisSehat — Platform UMKM Modern

TUJUAN:
Ubah widget "Customer Support" di dashboard menjadi pusat bantuan
yang benar-benar berguna untuk user BisnisSehat.

SCOPE ONLY:
- Help Center / FAQ
- penjelasan semua tools yang benar-benar tersedia
- panduan penggunaan
- Rules / Ketentuan Penggunaan
- Bug Report via EMAIL
- hapus opsi WhatsApp dari Customer Support

JANGAN:
- membuat fitur support ticket backend
- membuat live chat
- membuat WhatsApp integration
- mengubah auth
- mengubah subscription
- mengubah payment
- mengubah admin
- mengubah QRIS
- mengubah POS
- membuat fake support data

==================================================
1. AUDIT FITUR TERLEBIH DAHULU
==================================================

SEBELUM CODING, audit project secara menyeluruh untuk mengetahui
SEMUA tools/fungsi yang benar-benar tersedia di BisnisSehat.

Cari dari:

- App.jsx
- router
- sidebar
- Semua Tools
- kategori tools
- pages/components
- tool registry jika tersedia
- feature flags
- subscription/PRO entitlement

Jangan mengarang nama tool.

Buat inventory:

CATEGORY
→ TOOL NAME
→ ROUTE
→ FUNGSI SINGKAT
→ FREE / PRO jika dapat diverifikasi

Gunakan hasil audit tersebut sebagai sumber FAQ.

Jika ada tool yang memang ada di project tetapi tidak muncul
di sidebar, tetap pertimbangkan sebagai tool jika memang
user-facing dan aktif.

JANGAN mengubah tool hanya karena proses audit.

==================================================
2. HELP CENTER / FAQ
==================================================

Klik:

"Pusat Bantuan & FAQ"

harus membuka halaman/modal Help Center yang proper.

Struktur:

HELP CENTER

[Search FAQ...]

Kategori:

- Mulai Menggunakan BisnisSehat
- Keuangan
- Operasional
- Penjualan & CRM
- Marketing
- Legal & Compliance
- Kurs
- Analytics
- POS
- QR Menu
- Akun & Subscription
- Troubleshooting

Gunakan kategori hanya jika memang relevan dengan tools yang
benar-benar ada.

==================================================
3. FAQ SEMUA TOOLS
==================================================

SETIAP TOOL YANG BENAR-BENAR ADA harus mempunyai FAQ/help entry.

Minimal:

### Apa fungsi tool ini?
Penjelasan singkat dan jelas.

### Kapan digunakan?
Contoh situasi UMKM yang relevan.

### Bagaimana cara menggunakannya?
Langkah singkat.

### Apa arti hasilnya?
Jika tool menghasilkan angka/score/proyeksi,
jelaskan interpretasinya.

### Apakah tersedia untuk FREE atau PRO?
Hanya jika status entitlement dapat diverifikasi dari source code.

Jangan menjelaskan fitur yang tidak ada.

Jangan membuat klaim bahwa sebuah tool menggunakan AI
jika implementasinya tidak menggunakan AI.

==================================================
4. TOOL DESCRIPTION HARUS AKURAT
==================================================

Untuk setiap tool:

Jangan copy nama saja.

Contoh format:

"HPP Calculator"

Apa itu?
Menghitung biaya pokok produk berdasarkan komponen biaya
yang dimasukkan user.

Cara pakai:
1. Masukkan bahan/biaya.
2. Masukkan jumlah produksi.
3. Sistem menghitung HPP.
4. Gunakan hasilnya sebagai dasar penentuan harga.

Catatan:
Hasil bergantung pada data yang dimasukkan user.

Gunakan pola serupa untuk semua tools.

JANGAN mengarang rumus jika source code tidak diverifikasi.

==================================================
5. PANDUAN UMUM
==================================================

Tambahkan FAQ:

"Bagaimana cara memulai?"

"Bagaimana membuat bisnis?"

"Bagaimana menambahkan produk?"

"Bagaimana menggunakan POS?"

"Bagaimana menggunakan QR Menu?"

"Bagaimana melihat laporan?"

"Bagaimana menggunakan tools keuangan?"

"Bagaimana cara upgrade BisnisSehat Pro?"

"Bagaimana jika fitur tidak bisa digunakan?"

Jawaban harus mengikuti implementasi aktual project.

==================================================
6. RULES / KETENTUAN PENGGUNAAN
==================================================

Tambahkan section:

"KETENTUAN PENGGUNAAN"

Minimal jelaskan secara sederhana:

1. Akun
- user bertanggung jawab atas akun dan kredensialnya
- jangan membagikan akses akun

2. Data Bisnis
- user bertanggung jawab atas kebenaran data bisnis yang dimasukkan
- hasil kalkulator/analitik merupakan hasil berdasarkan data input

3. Tools & Perhitungan
- BisnisSehat menyediakan alat bantu pengelolaan bisnis
- hasil bukan jaminan keuntungan atau hasil finansial tertentu
- user tetap bertanggung jawab atas keputusan bisnis

4. Pembayaran & Subscription
- subscription mengikuti status pembayaran dan ketentuan layanan
- jangan menjanjikan refund/benefit yang tidak didukung sistem aktual

5. Penyalahgunaan
Dilarang:
- mencoba mengakses akun/data bisnis orang lain
- melakukan eksploitasi sistem
- melakukan abuse terhadap API
- memasukkan malware/kode berbahaya
- mencoba bypass authorization/entitlement

6. Bug & Security
- vulnerability/security issue jangan dieksploitasi
- laporkan melalui email resmi

7. Perubahan Layanan
- fitur dapat diperbarui/perubahan dilakukan sesuai perkembangan
  platform

JANGAN membuat klaim hukum spesifik yang belum ada dasar/legal policy
di project.

==================================================
7. BUG REPORT
==================================================

HAPUS:

"Chat WhatsApp CS"

dan nomor WhatsApp dari UI.

Jangan ada tombol WhatsApp di Customer Support.

Ganti dengan:

"Lapor Bug"

atau:

"Laporkan Masalah"

CTA:

"Email Support"

Ketika diklik, buka mail client menggunakan:

mailto:<SUPPORT_EMAIL>

PENTING:

Audit dulu apakah project sudah mempunyai support email resmi
di:

- environment/config
- constants
- settings
- existing footer
- existing contact information

Jika sudah ada, REUSE email tersebut.

JANGAN mengarang alamat email baru.

Jika tidak ada support email yang authoritative di project,
STOP sebelum hardcode email dan laporkan bahwa email resmi
perlu diberikan.

==================================================
8. BUG REPORT TEMPLATE
==================================================

Jika memungkinkan gunakan mailto dengan subject:

[BisnisSehat Bug Report]

dan body template:

Halo Tim BisnisSehat,

Saya ingin melaporkan bug.

Fitur:
[isi fitur]

Masalah:
[jelaskan masalah]

Langkah reproduksi:
1.
2.
3.

Hasil yang diharapkan:
...

Hasil yang terjadi:
...

Browser/device:
...

Terima kasih.

Jangan memasukkan password, token, API key, atau data sensitif
ke template email.

==================================================
9. CUSTOMER SUPPORT WIDGET
==================================================

Widget dashboard tetap boleh muncul.

Ubah isi menjadi:

Customer Support
"Pusat bantuan BisnisSehat"

[ 🔎 Cari Bantuan ]

[ Pusat Bantuan & FAQ ]

[ Lapor Bug via Email ]

Tambahkan mungkin:

"Temukan panduan penggunaan tools, akun, subscription,
dan troubleshooting."

HAPUS:

Chat WhatsApp CS
nomor WhatsApp
CTA WhatsApp
status "Tim Siap Membantu" jika itu memberikan kesan
live support yang sebenarnya tidak ada.

Jangan membuat klaim:
"respon < 15 menit"
jika tidak ada SLA nyata.

==================================================
10. FAQ SEARCH
==================================================

Search FAQ harus client-side jika dataset FAQ kecil/static.

Search berdasarkan:

- title
- category
- keywords
- description

Contoh:

user mengetik:
"HPP"

→ HPP Calculator muncul.

"stok"

→ inventory/stock-related tools muncul.

"subscription"

→ subscription FAQ muncul.

"bug"

→ bug reporting muncul.

Tidak perlu backend jika tidak diperlukan.

==================================================
11. UI
==================================================

Ikuti design system BisnisSehat existing.

Dark theme.

Mobile responsive.

Gunakan:

- accordion
- search
- category filter
- clear hierarchy
- readable typography

Jangan membuat halaman penuh dengan card berlebihan.

FAQ harus cepat dipindai.

==================================================
12. SECURITY
==================================================

Help Center boleh bersifat public/user-facing.

Jangan expose:

- API key
- Supabase service role
- internal admin routes
- database schema sensitif
- secret configuration
- credentials

Jangan membuat FAQ yang membocorkan detail security implementation.

==================================================
13. TESTING
==================================================

Tambahkan test yang relevan.

Minimal verify:

- Help Center dapat dibuka
- FAQ search bekerja
- kategori bekerja
- semua tool inventory memiliki help entry
- tidak ada WhatsApp CTA
- tidak ada nomor WhatsApp
- bug report membuka mailto
- subject email benar
- body email benar
- tidak ada secret di frontend
- existing dashboard tetap bekerja

Run:

npm test
lint
production build

Jangan merusak test existing.

==================================================
14. MANUAL CHECK
==================================================

Verify langsung:

/dashboard

Customer Support widget

→ Pusat Bantuan & FAQ
→ semua kategori
→ search
→ beberapa FAQ tool
→ Rules
→ Lapor Bug
→ Email client

Pastikan:

WhatsApp = TIDAK ADA.

==================================================
15. SCOPE LOCK
==================================================

INI HANYA:

HELP CENTER / FAQ / RULES / BUG REPORT EMAIL

Jangan implement:

- Admin Support
- Support Ticket backend
- AI support chatbot
- WhatsApp automation
- live chat
- Stage Admin berikutnya
- subscription changes
- payment changes
- QRIS changes
- POS changes

STOP setelah selesai.

==================================================
FINAL REPORT
==================================================

Laporkan:

1. STATUS PASS/BLOCKED
2. Jumlah tools yang ditemukan
3. Daftar kategori FAQ
4. Daftar tool yang diberi FAQ
5. Rules yang ditambahkan
6. Support email yang digunakan + sumbernya
7. WhatsApp benar-benar dihapus atau tidak
8. Files created
9. Files modified
10. Tests
11. Lint
12. Build
13. Manual verification
14. Known limitations

STOP.
