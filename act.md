IMPLEMENT ONLY — REDESIGN PRO ACTIVATION CODE OWNERSHIP

Tujuan:
Ubah sistem kode aktivasi PRO agar setiap kode terikat ke email penerima dan dapat direvoke dari Admin.

CURRENT STATE:
- Existing public.pro_activation_codes
- Existing pro_activation_rate_limits
- Existing admin activation code page
- Existing redeem_pro_activation_code()
- Existing admin_generate_pro_activation_code()
- Existing get_admin_pro_activation_codes()
- Existing AdminActivationCodesPage.jsx
- Existing ActivationQrModal.jsx
- Existing admin RBAC / is_admin()
- Migration 092_pro_activation_codes.sql sudah deployed ke production

JANGAN membuat sistem token baru yang tidak diperlukan.
JANGAN membuat token deterministik berdasarkan email.
JANGAN menggunakan email sebagai plaintext token.
Token HARUS tetap cryptographically random.

==================================================
1. AUDIT EXISTING SCHEMA TERLEBIH DAHULU
==================================================

Periksa schema public.pro_activation_codes.

Identifikasi:
- code_hash
- status
- duration_days
- redeemed_by
- redeemed_at
- created_by
- metadata
- created_at
- expires_at jika ada

Jangan membuat tabel duplikat.

Jika perlu field target email, gunakan migration baru dengan nama:
093_pro_activation_email_binding.sql

==================================================
2. TARGET EMAIL
==================================================

Tambahkan:

target_email text

Dengan normalisasi:
lower(trim(email))

Target email WAJIB diisi ketika admin membuat kode.

Tambahkan index:
idx_pro_activation_codes_target_email

Jangan menyimpan email sebagai bagian dari token.

==================================================
3. GENERATE TOKEN
==================================================

Admin UI harus meminta:

Email penerima
Durasi PRO

Contoh:

Email:
customer@gmail.com

Durasi:
30 hari

Server kemudian membuat token RANDOM menggunakan CSPRNG.

Contoh format:

BS-PRO-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX

Token plaintext hanya dikembalikan SATU KALI ketika generate.

Database hanya menyimpan:
- code_hash
- target_email
- metadata/audit information

Jangan pernah menyimpan plaintext token.

==================================================
4. REDEEM SECURITY
==================================================

Modify redeem_pro_activation_code().

Saat user redeem:

1. auth.uid() wajib ada.
2. Ambil email user dari auth.users secara server-side.
3. Normalisasi lower(trim(email)).
4. Cari activation code berdasarkan hash.
5. Pastikan status = unused.
6. Pastikan target_email = authenticated user's email.
7. Jika email tidak cocok:
   DENY.

Error jangan membocorkan apakah token tersebut valid tetapi milik email lain.

Gunakan generic error seperti:

"Kode aktivasi tidak valid atau tidak ditujukan untuk akun ini."

Jangan menerima target email dari frontend sebagai sumber kebenaran.

Email penerima HARUS berasal dari auth.users.

Tetap gunakan row locking FOR UPDATE agar concurrent redemption hanya menghasilkan satu success.

==================================================
5. SATU EMAIL — SATU ACTIVE TOKEN
==================================================

Jangan otomatis menghapus history.

Jika admin membuat kode baru untuk email yang sama:

- kode lama yang masih unused boleh di-REVOKE secara atomik
  ATAU
- tolak generate jika masih ada active unused token.

Pilih mekanisme yang paling konsisten dengan schema existing.

Yang penting:
tidak ada dua kode aktif yang ambigu untuk email yang sama.

Semua perubahan harus masuk admin_audit_logs.

==================================================
6. REVOKE / HAPUS KODE
==================================================

Tambahkan admin RPC:

admin_revoke_pro_activation_code(
    p_code_id uuid,
    p_reason text
)

Rules:

- hanya authenticated admin
- gunakan public.is_admin()
- SECURITY DEFINER
- SET search_path = ''
- revoke public/anon execute
- hanya kode yang belum redeemed yang boleh direvoke
- jangan hard-delete record yang sudah digunakan
- simpan status = 'revoked'
- simpan revoked_by
- revoked_at
- revoke_reason

Audit event:

PRO_ACTIVATION_CODE_REVOKED

Audit harus menyimpan:
- code id
- masked identifier
- target email
- actor admin
- reason

Jangan simpan plaintext token di audit log.

==================================================
7. ADMIN LIST
==================================================

AdminActivationCodesPage harus menampilkan:

KODE / IDENTIFIER
EMAIL PENERIMA
PAKET & DURASI
STATUS
DIBUAT TANGGAL
DIBUAT OLEH
DIGUNAKAN OLEH
TANGGAL REDEEM
ACTION

Contoh:

BS-PRO-••••-••••-b9f4
customer@gmail.com
PRO — 30 Hari
Aktif / Belum Dipakai

Action:

Revoke

Untuk status revoked:

REVOKED

dan tampilkan alasan.

Jangan tampilkan plaintext token lama.

==================================================
8. GENERATE MODAL
==================================================

Ubah modal Generate Kode & QR:

Email penerima:
[________________________]

Durasi:
[30 hari ▼]

[Generate Kode & QR]

Setelah berhasil:

Tampilkan:

Kode Aktivasi
BS-PRO-XXXX-XXXX-...

Untuk:
customer@gmail.com

Durasi:
30 Hari

QR Code

[Salin Kode]
[Download QR]

Warning:

"Kode aktivasi hanya ditampilkan sekali.
Simpan atau kirimkan kode ini kepada penerima."

Plaintext jangan pernah muncul lagi setelah modal ditutup/reload.

==================================================
9. QR PAYLOAD
==================================================

Tetap gunakan:

https://bisnissehat.my.id/pricing?activate=<PLAINTEXT_TOKEN>

QR hanya membawa token random.

Jangan masukkan email ke query parameter.

PricingPage tetap:

PREFILL ONLY.

Tidak boleh auto-redeem.

==================================================
10. REDEEM UI
==================================================

Jika email user tidak cocok dengan target email:

Jangan mengungkap:

"Kode ini milik email X."

Cukup:

"Kode aktivasi tidak valid atau tidak ditujukan untuk akun ini."

Jika cocok:

Aktivasi PRO berhasil.

==================================================
11. SECURITY TESTS
==================================================

Tambahkan/update tests:

1. Admin generate code untuk email A → PASS
2. User email A redeem → PASS
3. User email B redeem kode A → DENIED
4. Anonymous redeem → DENIED
5. Same token second redeem → DENIED
6. Concurrent redeem → exactly 1 success
7. Admin revoke unused code → PASS
8. Revoked code redeem → DENIED
9. Redeemed code cannot be revoked
10. Normal user cannot revoke
11. Normal user cannot list activation codes
12. Token plaintext never stored
13. Token remains cryptographically random
14. Email normalization works:
   TEST@GMAIL.COM == test@gmail.com
15. No plaintext token in admin_audit_logs
16. IDOR: admin cannot manipulate arbitrary user identity during redeem
17. Frontend cannot override target_email
18. Direct RPC security tests
19. Existing QRGenerator.jsx POS/QRIS remains untouched

==================================================
12. MIGRATION DEPLOYMENT
==================================================

After implementation:

npm test
npm run lint
npm run build

Then:

npx supabase db push
npx supabase migration list

Verify local = remote.

Test LIVE production RPC.

==================================================
13. GIT + VERCEL
==================================================

After all tests pass:

git status
git add .
git commit -m "feat: bind PRO activation codes to recipient email"
git push origin main

Verify:

git status
git log -1 --oneline
git remote -v

Working tree must be clean.

Do NOT claim Vercel deployment succeeded unless the Git push succeeded.

==================================================
SCOPE LOCK
==================================================

Do NOT modify:

- QRGenerator.jsx
- POS QRIS flow
- Midtrans/payment
- subscriptions entitlement logic except activation-code redemption integration
- Admin RBAC
- Maintenance Mode
- Announcement Banner
- Support
- AI Usage
- unrelated settings
- unrelated migrations

STOP after implementation + production verification.

FINAL REPORT MUST INCLUDE:
- files changed
- migration name
- exact RPCs
- target email behavior
- revoke behavior
- security test result
- npm test result
- lint result
- build result
- Supabase local/remote migration status
- git commit hash
- push result
