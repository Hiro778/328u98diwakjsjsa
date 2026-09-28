IMPLEMENT CUSTOMER SUPPORT FLOATING WIDGET — ATLAS CLOUD STYLE

Saya ingin menambahkan floating Customer Support widget di BisnisSehat,
terinspirasi dari posisi dan UX Atlas Cloud pada screenshot referensi.

==================================================
1. POSISI
==================================================

Widget:
- position: fixed
- bottom: 24px
- right: 24px
- z-index tinggi tetapi tidak boleh menutupi modal/dialog
- tetap mengikuti viewport saat halaman di-scroll

Desktop:
bottom: 24px
right: 24px

Mobile:
bottom: 16px
right: 16px

==================================================
2. TAMPILAN UTAMA
==================================================

Buat satu tombol bulat floating:

[ icon CS/chat ]

Ukuran sekitar:
- desktop 52–56px
- mobile 50–54px

Gunakan style yang konsisten dengan design system BisnisSehat.

Visual:
- circular
- subtle shadow
- clean
- modern
- tidak terlalu besar
- icon customer support/chat/headset

Hover:
tooltip:
"Customer Support"

Jangan menggunakan teks "Atlas Cloud" atau meniru branding Atlas.

==================================================
3. SAAT DIKLIK
==================================================

Saat tombol CS diklik, buka small support panel/popover di atas tombol.

Contoh:

┌─────────────────────────────┐
│ Customer Support            │
│                             │
│ Butuh bantuan?              │
│ Tim kami siap membantu.     │
│                             │
│ [ WhatsApp ]                │
│ [ Hubungi CS ]              │
│ [ FAQ ]                     │
└─────────────────────────────┘
             [ CS ]

Panel:
- width sekitar 300–340px
- rounded corners
- shadow
- tidak fullscreen
- tidak mengganggu halaman
- bisa ditutup dengan X
- klik tombol CS lagi → close

==================================================
4. CHANNEL
==================================================

Untuk sekarang support:

WhatsApp
→ gunakan nomor CS yang berasal dari konfigurasi bisnis/platform,
JANGAN hardcode nomor random.

FAQ
→ arahkan ke halaman FAQ BisnisSehat jika route sudah tersedia.

Jika sistem belum memiliki konfigurasi nomor CS,
buat fallback configuration yang mudah diganti,
tetapi jangan membuat nomor palsu.

==================================================
5. RESPONSIVE
==================================================

Desktop:
floating button kanan bawah.

Mobile:
floating button kanan bawah tetapi beri safe spacing
agar tidak menutupi:
- tombol checkout
- tombol navigation
- bottom navigation
- modal action

Jika ada halaman yang memiliki fixed bottom action,
widget harus menaikkan posisi secara aman atau menggunakan
safe-area/inset.

==================================================
6. ACCESSIBILITY
==================================================

Button harus memiliki:

aria-label="Customer Support"

Keyboard:
- bisa difokuskan
- Enter/Space membuka support panel
- Escape menutup panel

Tooltip tidak boleh menjadi satu-satunya informasi.

==================================================
7. ANIMATION
==================================================

Gunakan animasi ringan:

closed:
scale(1)

hover:
scale(1.03)

open:
support panel fade + translateY ringan

Jangan gunakan animasi berlebihan.

Tidak boleh mengganggu performance.

==================================================
8. IMPORTANT — JANGAN GANGGU UI EXISTING
==================================================

Audit terlebih dahulu apakah BisnisSehat sudah memiliki:
- notification floating button
- WhatsApp button
- help button
- chat widget

Jangan membuat duplicate widget.

Jangan menutupi:
- checkout
- POS
- modal
- dropdown
- sidebar
- toast
- bottom navigation

==================================================
9. DESIGN
==================================================

Referensi UX:
Atlas Cloud customer support floating button.

Tetapi implementasi harus mengikuti:
BisnisSehat design system.

Jangan copy branding, logo, warna, atau asset Atlas Cloud.

==================================================
10. TEST
==================================================

Tambahkan regression test:

1. Widget muncul.
2. Widget fixed di viewport.
3. Klik → panel terbuka.
4. Klik lagi → panel tertutup.
5. Escape → panel tertutup.
6. WhatsApp link benar.
7. FAQ link benar.
8. Tidak duplicate dengan existing support widget.
9. Mobile tidak menutupi bottom action.
10. Build berhasil.

Setelah selesai:
- laporkan component yang dibuat/diubah
- route/channel CS yang digunakan
- test result
- npm run build
