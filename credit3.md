IMPLEMENT ONLY — MOBILE-ONLY UI POLISH & RESPONSIVE FIX

GOAL:
Perbaiki tampilan BisnisSehat yang masih ke-cut / kurang rapi di Android dan iOS.

CRITICAL RULE:
DESKTOP SUDAH PAS.
JANGAN MENGUBAH TAMPILAN DESKTOP.

Desktop breakpoint harus dianggap LOCKED.

Semua perubahan responsive harus berlaku hanya pada mobile / small viewport.

==================================================
1. MOBILE TARGET
==================================================

WAJIB test minimal:

320 x 568
360 x 800
375 x 812
390 x 844
393 x 852
412 x 915
430 x 932

Target:
- Android Chrome
- Android browser viewport
- iOS Safari
- iOS viewport dengan safe-area
- device dengan notch / Dynamic Island

Jangan hanya mengandalkan desktop browser yang dikecilkan.

==================================================
2. DESKTOP LOCK
==================================================

JANGAN mengubah:
- desktop spacing
- desktop font size
- desktop grid
- desktop sidebar
- desktop card width
- desktop modal size
- desktop table layout
- desktop header
- desktop navigation
- desktop visual hierarchy

Jika perubahan CSS diperlukan:
gunakan mobile-first/default + breakpoint override dengan hati-hati,
atau @media max-width.

Jangan mengubah nilai desktop existing kecuali benar-benar diperlukan.

==================================================
3. AUDIT MOBILE DENGAN SCREENSHOT
==================================================

Audit semua halaman yang terlihat di mobile.

Prioritaskan:

- Landing Page
- Pricing
- Login/Register
- Dashboard
- Top Up / AI Credits
- Notification
- QR Menu Designer
- Public QR Menu
- POS
- Order Chat
- Creative Studio
- Help Center
- Settings
- Admin
- Admin Activation Codes
- Admin Users
- Admin Businesses
- Admin Payments
- Admin Subscriptions
- Admin AI Usage
- Admin Support
- Admin Audit Logs

Cari secara spesifik:

- content terpotong
- horizontal overflow
- button keluar layar
- modal terlalu lebar
- modal terlalu tinggi
- header bertabrakan
- sidebar menutup content
- text terlalu besar
- text terlalu kecil
- card terlalu padat
- grid tidak berubah menjadi mobile layout
- table tidak usable
- dropdown keluar viewport
- input terlalu kecil
- tombol terlalu kecil untuk touch
- icon bertabrakan
- footer overflow
- fixed element menutup content
- keyboard mobile menutup input/button
- safe-area iOS tidak diperhitungkan
- 100vh yang bermasalah di mobile Safari
- bottom navigation / fixed controls menutup content

==================================================
4. MOBILE UI QUALITY
==================================================

Jangan hanya membuat "tidak overflow".

Tampilan harus benar-benar nyaman digunakan di HP.

Mobile harus memiliki:

- padding horizontal konsisten
- spacing antar section yang cukup
- button touch target yang nyaman
- text hierarchy yang jelas
- card tidak terlalu padat
- input full-width jika diperlukan
- action button tidak berdempetan
- modal mudah dibaca
- scrolling natural
- tidak ada elemen yang terasa "desktop dipaksa masuk HP"

Minimal touch target:
sekitar 44px untuk tombol/icon interactive jika tidak merusak desain.

==================================================
5. SAFE AREA iOS
==================================================

Pastikan elemen fixed/sticky mempertimbangkan:

env(safe-area-inset-top)
env(safe-area-inset-bottom)
env(safe-area-inset-left)
env(safe-area-inset-right)

Terutama:
- header
- mobile navigation
- bottom action
- modal
- drawer
- notification
- floating buttons

Jangan menambahkan safe-area secara global jika tidak diperlukan.

==================================================
6. MOBILE HEADER
==================================================

Header harus tetap muat pada 320px.

Pastikan:
- logo tidak terpotong
- title/workspace bisa shrink
- notification icon tetap terlihat
- profile/avatar tetap terlihat
- hamburger/menu tetap accessible

Long workspace/business name:
gunakan truncate/wrap yang tepat.

Jangan mengubah desktop header.

==================================================
7. MOBILE SIDEBAR / DRAWER
==================================================

Desktop sidebar:
JANGAN DIUBAH.

Mobile:
- gunakan drawer
- drawer tidak boleh menyebabkan body overflow
- drawer width <= viewport
- close button accessible
- navigation item tidak terpotong
- content di belakang tidak ikut scroll ketika drawer terbuka jika memang drawer modal.

==================================================
8. MODALS
==================================================

Semua modal mobile:

width:
calc(100vw - 24px)

max-height:
calc(100dvh - 24px)

overflow:
internal scroll jika diperlukan.

Pastikan:
- title tidak terpotong
- close button tidak keluar
- form fields full width
- footer button wrap/stack jika diperlukan
- keyboard tidak menutupi tombol penting.

Desktop modal:
JANGAN DIUBAH.

==================================================
9. TABLES
==================================================

Mobile table:

JANGAN membuat seluruh body horizontal scroll.

Gunakan wrapper:

overflow-x-auto

Hanya table yang boleh horizontal scroll.

Pastikan:
- scrollbar berada di table container
- page tidak ikut melebar
- email/code/UUID tidak memaksa body melebar
- Action column tetap bisa diakses.

Untuk data yang cocok, boleh ubah table menjadi mobile card/list.

Pilih berdasarkan usability, bukan sekadar CSS.

Desktop table:
TETAP seperti sekarang.

==================================================
10. CARDS / GRID
==================================================

Desktop grid:
LOCKED.

Mobile:
- 1 column untuk card besar
- 2 column hanya jika benar-benar muat
- gap/padding disesuaikan
- no fixed desktop width.

Jangan menggunakan transform/scale untuk mengecilkan seluruh desktop UI.

==================================================
11. FORMS
==================================================

Mobile:
- input width 100%
- label jelas
- select tidak terpotong
- textarea usable
- button full width jika action utama
- button group boleh stack.

Pastikan browser iOS tidak melakukan zoom aneh pada input.

Gunakan ukuran font input yang sesuai agar iOS tidak memaksa zoom.

Desktop form:
JANGAN DIUBAH.

==================================================
12. QR MENU / QR DESIGNER
==================================================

Mobile:
- QR preview fit viewport
- canvas responsive
- image tidak overflow
- controls stack
- social links fit
- banner editor fit
- buttons accessible
- preview tidak memaksa horizontal scroll.

Desktop designer:
LOCKED.

==================================================
13. POS
==================================================

Mobile POS harus benar-benar mobile UX.

Jangan memaksa:
Katalog + Cart berdampingan.

Gunakan:
- tab
atau
- stacked sections
atau
- mobile drawer

Pastikan cart/order action mudah diakses.

Desktop POS:
JANGAN DIUBAH.

==================================================
14. NOTIFICATION
==================================================

Mobile notification panel:

- fit viewport
- tidak keluar kanan
- tidak keluar kiri
- internal scroll
- long notification wrap
- close button accessible
- tidak menutup seluruh UI secara tidak sengaja.

==================================================
15. ADMIN MOBILE
==================================================

Semua Admin pages harus usable mobile.

Prioritas:
- Activation Codes
- Users
- Businesses
- Subscriptions
- Payments
- AI Usage
- Support
- Audit Logs
- Settings

Admin desktop:
LOCKED.

Mobile:
- table/card responsive
- filters stack
- search full-width
- action buttons wrap
- modals fit
- badges tidak overflow
- long IDs/emails wrap/truncate.

==================================================
16. IOS-SPECIFIC CHECK
==================================================

Periksa:

- 100vh
- 100dvh
- safe-area
- position: fixed
- position: sticky
- overflow containers
- keyboard behavior
- Safari address bar behavior
- notch/Dynamic Island

Gunakan 100dvh untuk modal/viewport-sensitive UI bila sesuai.

Jangan membuat global hacks.

==================================================
17. ANDROID-SPECIFIC CHECK
==================================================

Periksa:
- Chrome viewport
- bottom browser controls
- touch target
- dropdown positioning
- keyboard
- fixed bottom controls
- overscroll.

==================================================
18. IMPORTANT — DO NOT TOUCH DESKTOP
==================================================

Before changing each component:

cek existing desktop class/layout.

If desktop currently correct:
preserve it.

Use responsive overrides only.

After implementation compare:

Desktop:
1440px
1280px
1024px

Mobile:
320px
360px
375px
390px
412px
430px

Expected:
Desktop visual remains effectively unchanged.
Mobile significantly improves.

==================================================
19. VISUAL REGRESSION
==================================================

If Playwright/browser automation exists:
take screenshots at:

320x568
375x812
390x844
430x932
1440x900

Check:
- no horizontal page overflow
- no clipped content
- no inaccessible buttons
- no modal clipping
- no header collision
- no fixed element collision.

Do not claim mobile is fixed based only on build success.

==================================================
20. TEST
==================================================

Run:

npm test
npm run lint
npm run build

Fix only issues related to this scope.

==================================================
21. FINAL REPORT
==================================================

Report:

1. Pages audited
2. Mobile issues found
3. Root cause per important issue
4. Mobile fixes
5. iOS-specific fixes
6. Android-specific fixes
7. Confirmation that desktop layout was preserved
8. Viewports tested
9. npm test
10. lint
11. build

IMPORTANT:
Do not finish with only "responsive classes added".

The acceptance criterion is:
MOBILE LOOKS GOOD + NO CUT/OFF + DESKTOP UNCHANGED.

STOP after this scope.
