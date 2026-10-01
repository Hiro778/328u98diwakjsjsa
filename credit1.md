LANGSUNG EKSEKUSI SEKARANG. JANGAN TANYA KONFIRMASI LAGI.

Implementasikan Bagian A + Bagian B sesuai scope yang sudah ditentukan.

PRIORITAS:
1. AI Credit → WhatsApp
2. Mobile responsive hardening
3. Test
4. Lint
5. Build

JANGAN berhenti di roadmap.

Untuk AI Credit:
- Beli Credit → langsung buka WhatsApp admin.
- Jangan buat payment gateway baru.
- Jangan menambah credit otomatis.
- Gunakan existing config/contact jika tersedia.
- Jika nomor WA admin belum ditemukan, jangan mengarang nomor. Gunakan VITE_AI_CREDIT_WHATSAPP_NUMBER dan report bahwa env tersebut perlu diisi.
- Pastikan paket, harga, dan email user masuk ke pesan WhatsApp.
- encodeURIComponent.
- Jangan merusak credit ledger, subscription, AI usage, atau PRO activation.

Untuk mobile:
- Perbaiki ROOT CAUSE overflow, bukan sekadar overflow-x-hidden.
- Audit dan perbaiki seluruh halaman yang ditemukan bermasalah.
- Minimum viewport 320px.
- Table boleh horizontal scroll hanya di wrapper tabel.
- Modal/drawer harus fit viewport.
- Long email/UUID/code harus wrap/truncate.
- QR designer harus responsive.
- Notification panel harus fit.
- Top-up/Credit page harus fit.
- Admin Activation Codes harus fit.
- Jangan redesign desktop yang sudah benar.

WAJIB:
- Jalankan test setelah implementasi.
- Jalankan lint.
- Jalankan build.
- Verifikasi tidak ada regression.

Jangan berhenti sebelum implementasi selesai.

Di final report tampilkan:
1. file yang diubah
2. mobile issue yang diperbaiki
3. AI Credit WhatsApp flow
4. nomor WA diambil dari mana
5. test result
6. lint result
7. build result
8. hal yang masih perlu saya konfigurasi jika ada

STOP setelah benar-benar selesai.
