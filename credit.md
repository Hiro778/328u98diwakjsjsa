IMPLEMENT ONLY — MOBILE RESPONSIVE HARDENING + AI CREDIT WHATSAPP PURCHASE FLOW

PROJECT:
BisnisSehat
Vite + React + Tailwind + Supabase
Production domain:
https://bisnissehat.my.id

==================================================
PART A — GLOBAL MOBILE UI FIX
==================================================

Masalah saat ini:
- beberapa halaman masih ke-cut di HP
- beberapa elemen overflow horizontal
- card/table/button/modal/navbar tidak responsive
- beberapa text/button keluar viewport
- beberapa halaman desktop terlihat bagus tetapi mobile rusak
- ada beberapa bug UI lain yang hanya muncul pada viewport kecil

TARGET:
Seluruh aplikasi harus usable pada mobile tanpa horizontal page overflow.

IMPORTANT:
Jangan hanya menambahkan:
  overflow-x-hidden
untuk menutupi masalah.

Cari root cause setiap overflow.

Gunakan pendekatan mobile-first.

Target viewport minimum:
- 320px
- 360px
- 375px
- 390px
- 412px
- 430px

Desktop harus tetap tidak rusak.

==================================================
1. AUDIT SEMUA RESPONSIVE ISSUE
==================================================

Audit seluruh route/page/component terutama yang sebelumnya terlihat bermasalah:

- Landing page
- Pricing
- Dashboard
- Top Up / Credit
- QR Menu / QR Menu Designer
- Notification panel
- Admin
- Admin Activation Codes
- POS
- Public Menu
- Help Center
- Settings
- Subscription
- AI Usage
- Creative Studio
- semua modal/drawer/dropdown

Cari:
- fixed width
- min-width yang terlalu besar
- width hardcoded
- flex row yang tidak wrap
- grid yang terlalu banyak kolom
- absolute positioning keluar viewport
- transform yang menyebabkan overflow
- table overflow
- modal lebih lebar dari viewport
- button row terlalu panjang
- text nowrap
- long email/code/token tidak wrap
- image/canvas tidak responsive
- sidebar desktop yang tetap mengambil width mobile
- header yang overflow
- horizontal scrolling body
- viewport height issue
- z-index/overlay issue
- dropdown keluar viewport

==================================================
2. GLOBAL LAYOUT
==================================================

Pastikan:

html,
body,
#root

tidak menghasilkan horizontal page overflow.

Tetapi:
JANGAN menggunakan global overflow-x-hidden sebagai solusi utama.

Root layout harus:
- width: 100%
- max-width sesuai kebutuhan
- child flex/grid boleh shrink
- min-width: 0 pada flex/grid children yang diperlukan

Gunakan pattern yang benar seperti:
- w-full
- max-w-full
- min-w-0
- flex-wrap
- break-words
- overflow-wrap-anywhere
- responsive grid/flex
- overflow-x-auto hanya pada container yang memang membutuhkan horizontal scrolling seperti tabel.

==================================================
3. MOBILE NAVIGATION
==================================================

Desktop:
- sidebar seperti sekarang.

Mobile:
- sidebar tidak boleh memaksa content keluar layar.
- gunakan drawer/mobile menu yang sudah ada jika tersedia.
- header harus muat pada 320px.
- icon/button tidak boleh terpotong.
- logo + title harus bisa shrink.

Jangan mengubah desktop visual kecuali diperlukan.

==================================================
4. TABLES
==================================================

Semua tabel admin/user/business/payment/activation code/etc:

Desktop:
normal table.

Mobile:
jangan paksa seluruh tabel masuk 320px.

Gunakan:
overflow-x-auto
pada wrapper tabel.

Pastikan:
- wrapper yang scroll, bukan body
- scrollbar hanya muncul pada table container
- page tetap tidak horizontal overflow.

Untuk activation codes:
kolom panjang seperti:
- masked code
- email
- ID
- reason

harus wrap atau punya sensible truncation.

Action button tetap accessible.

==================================================
5. CARDS / GRID
==================================================

Desktop:
pertahankan layout sekarang.

Mobile:
ubah multi-column menjadi single-column atau 2-column hanya jika benar-benar muat.

Tidak boleh ada card dengan fixed width yang lebih besar dari viewport.

Gunakan responsive classes dengan mobile-first approach.

==================================================
6. MODALS / DRAWERS
==================================================

Semua modal harus:

mobile:
- max-width: calc(100vw - 24px)
- width: 100%
- max-height: calc(100dvh - 24px)
- content scrollable jika panjang
- footer button tidak keluar layar.

Desktop:
pertahankan ukuran yang sekarang.

Pastikan:
- close button tetap terlihat
- form tidak terpotong
- keyboard mobile tidak menyebabkan tombol submit hilang jika memungkinkan.

==================================================
7. LONG TEXT / EMAIL / CODE
==================================================

Pastikan:
email panjang
activation code
UUID
URL
error message
AI model name
transaction ID

tidak menyebabkan horizontal overflow.

Gunakan wrapping/truncation yang tepat.

Jangan merusak readability.

==================================================
8. QR MENU / DESIGNER
==================================================

Pastikan:
- preview tidak lebih lebar dari viewport
- QR tetap proporsional
- canvas/image responsive
- controls tidak keluar layar
- buttons wrap
- form fields 100% width pada mobile.

Desktop preview tetap seperti sekarang.

==================================================
9. NOTIFICATION PANEL
==================================================

Mobile:
- panel/dropdown harus fit viewport.
- tidak boleh melewati kanan layar.
- content scrollable.
- long notification text wrap.
- close button accessible.

==================================================
10. TOP UP / CREDIT UI
==================================================

Mobile:
- pricing/card tidak terpotong.
- amount/credit card responsive.
- button full-width atau wrap dengan benar.
- payment/contact UI tidak overflow.

==================================================
PART B — AI CREDIT PURCHASE → WHATSAPP
==================================================

CURRENT DESIRED FLOW:

User memilih paket AI Credit.

Contoh:
"Buy 100 AI Credits"

Klik:
"Beli Credit"

User langsung diarahkan ke WhatsApp ADMIN.

Tidak menggunakan Midtrans/payment gateway baru untuk flow ini.

==================================================
11. WHATSAPP DESTINATION
==================================================

Jangan hardcode nomor WhatsApp di banyak component.

Buat/reuse centralized config.

Contoh:

AI_CREDIT_WHATSAPP_NUMBER

Gunakan nomor admin yang sudah ditentukan oleh owner.

IMPORTANT:
Jika nomor WhatsApp belum ditemukan dari existing project/config:
JANGAN mengarang nomor.

Temukan existing support/contact/WhatsApp configuration terlebih dahulu.

Jika belum ada nomor khusus:
buat satu centralized config placeholder yang jelas,
misalnya:

VITE_AI_CREDIT_WHATSAPP_NUMBER

Jangan commit nomor palsu.

==================================================
12. WHATSAPP MESSAGE
==================================================

Generate message otomatis.

Contoh:

Halo Admin BisnisSehat,

Saya ingin membeli AI Credit.

Paket: 100 AI Credits
Harga: RpXX.XXX
User email: user@email.com

Mohon informasi pembayaran dan proses top up credit.

Terima kasih.

Message harus di-encode dengan encodeURIComponent.

WhatsApp URL:

https://wa.me/<NUMBER>?text=<ENCODED_MESSAGE>

Gunakan window.location.href / window.open sesuai pola existing app.

==================================================
13. USER EXPERIENCE
==================================================

Flow:

AI Credit page
   ↓
Pilih paket
   ↓
Klik "Beli Credit"
   ↓
WhatsApp terbuka
   ↓
Message sudah terisi otomatis
   ↓
User chat admin
   ↓
User melakukan pembayaran sesuai instruksi admin
   ↓
Admin melakukan top up credit melalui existing admin system

JANGAN:
- otomatis menambah credit ketika tombol diklik
- menganggap user sudah bayar
- membuat fake payment success
- mengubah saldo credit dari frontend
- membuat order paid tanpa pembayaran.

Credit hanya bertambah melalui existing secure admin/server flow setelah pembayaran dikonfirmasi.

==================================================
14. CREDIT BUTTON STATES
==================================================

Button:
"Beli Credit"

Mobile:
width 100% jika diperlukan.

Loading tidak diperlukan jika hanya membuka WhatsApp.

Jika nomor WhatsApp tidak dikonfigurasi:
tampilkan error yang jelas,
jangan generate wa.me URL yang invalid.

==================================================
15. DO NOT BREAK EXISTING CREDIT SYSTEM
==================================================

Jangan ubah:
- creative credits schema
- credit ledger
- subscription entitlement
- PRO activation
- existing admin credit adjustment
- AI usage
- existing credit deduction
- existing AI generation flow

Hanya ubah PURCHASE ENTRY FLOW.

==================================================
16. RESPONSIVE TESTING
==================================================

Gunakan browser/dev server untuk verify:

320x568
360x800
375x812
390x844
412x915
430x932
768px
1024px
1440px

Untuk setiap viewport:

- document width tidak melebihi viewport
- tidak ada horizontal page scroll
- buttons accessible
- modal accessible
- navbar accessible
- cards fit
- tables scroll inside container
- forms fit
- text does not get cut
- images/QR fit.

Jika tersedia Playwright/browser test, gunakan.

==================================================
17. MOBILE REGRESSION TEST
==================================================

Tambahkan test untuk helper/component yang relevan.

Minimal verify:
- WhatsApp URL generation
- encoded message
- missing number handling
- package name/price included
- email included when authenticated
- no credit mutation from purchase click

==================================================
18. BUILD / REGRESSION
==================================================

Run:

npm test
npm run lint
npm run build

Fix only regressions caused by this scope.

Do NOT modify:
- payment security
- QRIS security
- order processing
- subscription entitlement
- activation code security
- Admin RBAC
- Supabase migrations
unless absolutely required for this exact scope.

==================================================
19. FINAL VERIFICATION
==================================================

Report:

MOBILE:
- routes audited
- overflow issues fixed
- modal fixes
- table fixes
- navbar fixes
- QR designer fixes
- notification fixes
- top-up fixes

WHATSAPP:
- destination source
- package flow
- generated message
- credit mutation behavior

TEST:
- mobile tests
- WhatsApp tests
- npm test
- lint
- build

STOP after this scope.
