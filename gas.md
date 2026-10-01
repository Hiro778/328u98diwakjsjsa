JANGAN TANYA LAGI. LANGSUNG EKSEKUSI SELURUH SCOPE.

Jangan hanya audit Landing Page/POS/Dashboard lalu berhenti.

Kerjakan:
1. Audit seluruh halaman yang ada dalam scope.
2. Temukan root cause setiap masalah mobile.
3. Implementasikan perbaikannya langsung.
4. Fokus HANYA mobile Android/iOS.
5. DESKTOP LOCKED — jangan ubah layout/tampilan desktop yang sudah benar.
6. Test viewport 320, 360, 375, 390, 412, 430 px.
7. Periksa iOS safe-area, 100dvh, fixed/sticky, keyboard, notch/Dynamic Island.
8. Perbaiki clipping, overflow, modal, drawer, navbar, table, card, form, notification, POS, QR Designer, Admin, dll sesuai scope.
9. Jangan menggunakan global overflow-x-hidden sebagai solusi utama.
10. Jika ada halaman yang sudah benar di mobile, jangan ubah tanpa alasan.

WAJIB IMPLEMENTASI, BUKAN ROADMAP.

Setelah semua perubahan:
- npm test
- npm run lint
- npm run build

Dan kalau tersedia browser/Playwright, lakukan visual verification pada mobile viewport.

Jangan berhenti setelah audit satu halaman.
Jangan meminta konfirmasi lagi.
Kerjakan sampai selesai lalu berikan final report:
- file yang diubah
- masalah mobile yang ditemukan
- root cause
- fix
- viewport yang diverifikasi
- konfirmasi desktop tidak diubah
- test/lint/build result.

STOP hanya setelah implementasi selesai.
