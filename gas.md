LANJUTKAN IMPLEMENTASI PRO ACTIVATION CODE — PHASE 1 ONLY.

Tujuan:
Ganti mekanisme pembayaran Pro subscription dari Midtrans menjadi:
ADMIN GENERATE ACTIVATION CODE → CUSTOMER MENERIMA CODE/QR → CUSTOMER REDEEM → PRO ACTIVE.

SCOPE LOCK:
- HANYA Phase 1 backend security.
- Jangan implement Admin UI.
- Jangan implement QR modal.
- Jangan ubah PricingPage UI dulu.
- Jangan ubah POS / QRIS merchant-direct.
- Jangan ubah QRGenerator.jsx.
- Jangan menghapus Midtrans dulu pada phase ini.
- Jangan mengubah subscription schema/entitlement existing kecuali memang diperlukan agar redeem bekerja aman.
- Audit existing schema/RPC sebelum membuat sesuatu yang duplicate.

==================================================
1. AUDIT EXISTING SUBSCRIPTION SYSTEM
==================================================

Inspect:
- public.subscriptions
- subscriptionService.js
- existing entitlement logic
- existing RLS
- existing admin RBAC
- existing audit log
- existing business/profile ownership

Gunakan schema ACTUAL remote Supabase sebagai source of truth.

Jangan membuat tabel/RPC duplicate jika sudah ada.

==================================================
2. CREATE pro_activation_codes
==================================================

Buat migration baru, gunakan nomor migration berikutnya yang benar-benar tersedia.

Table minimal:

public.pro_activation_codes

- id uuid primary key default gen_random_uuid()
- code_hash text unique not null
- status text not null default 'unused'
  CHECK status IN ('unused','redeemed','revoked','expired')
- expires_at timestamptz nullable
- redeemed_by uuid nullable references auth.users(id)
- redeemed_at timestamptz nullable
- created_by uuid not null references auth.users(id)
- created_at timestamptz not null default now()
- revoked_at timestamptz nullable
- revoked_by uuid nullable references auth.users(id)
- metadata jsonb not null default '{}'::jsonb

Tambahkan index yang memang diperlukan:
- unique/index code_hash
- status
- redeemed_by
- created_by

Jangan simpan plaintext activation code di database.

==================================================
3. CODE SECURITY — WAJIB
==================================================

Plaintext activation code hanya boleh muncul ketika admin melakukan GENERATE.

Database hanya menyimpan code_hash.

Target entropy minimal >= 128-bit.

PENTING:
Jika format menggunakan 6 group x 4 karakter, hitung entropy aktual berdasarkan alphabet.
Jangan klaim 128-bit kalau format tersebut sebenarnya hanya 96-bit.

Gunakan CSPRNG untuk generator.
Jangan:
- Math.random()
- timestamp-based code
- sequential code
- predictable UUID substring
- incremental number
- hash timestamp/email

Jika alphabet/format yang dipakai tidak mencapai >=128-bit,
ubah jumlah karakter/group atau gunakan alphabet yang cukup besar.

Normalize input secara konsisten:
- trim
- uppercase jika format memang uppercase
- reject malformed input

Hash dilakukan SERVER-SIDE.

Jangan pernah:
- log plaintext code
- console.log plaintext
- simpan plaintext ke DB
- simpan plaintext ke localStorage
- masukkan plaintext ke audit log
- return plaintext dari RPC redeem
- return database row yang mengandung secret

==================================================
4. REDEEM RPC — ATOMIC SINGLE USE
==================================================

Buat RPC:

redeem_pro_activation_code(p_code text)

Security requirements:

A. Harus authenticated user.
Anonymous redemption = DENY.

B. Cari berdasarkan code_hash.

C. Atomic row locking:
SELECT ... FOR UPDATE

D. Validasi:
- code exists
- status = unused
- belum expired
- input valid

E. Kalau valid:
- update activation code → redeemed
- redeemed_by = auth.uid()
- redeemed_at = now()
- update/create user's Pro subscription menggunakan mekanisme entitlement EXISTING
- transaction harus atomic

Jika proses subscription gagal:
activation code TIDAK BOLEH berubah menjadi redeemed.

Gunakan transaction semantics PostgreSQL.

F. Single-use:
dua concurrent redeem request untuk code yang sama:
- tepat SATU request sukses
- request lainnya harus gagal/idempotent sesuai desain
- TIDAK boleh menghasilkan dua subscription/payment entitlement.

==================================================
5. BRUTE FORCE / FUZZ PROTECTION — WAJIB
==================================================

Activation code harus dianggap secret.

Implementasikan rate limiting SERVER-SIDE.

Minimal protection:
- per authenticated user
- per time window
- gagal berulang → temporary lockout/throttle

Jangan hanya melakukan rate limit di React/frontend.

Test:
- 1 user mengirim banyak code random
- request harus ditolak setelah threshold
- menunggu window → dapat mencoba kembali

Jika architecture memungkinkan IP-based rate limit di Edge Function,
tambahkan layer IP + user rate limiting.

Tetapi jangan percaya header IP yang dikirim client secara mentah.

Jangan membuat rate limiter yang bisa dibypass hanya dengan:
- mengganti casing
- whitespace
- mengganti user-agent
- mengganti request body
- mengganti query parameter
- mengubah code menjadi URL encoded
- concurrent requests

==================================================
6. FUZZ / INPUT VALIDATION
==================================================

Test input:

- ''
- null
- whitespace
- lowercase
- uppercase
- malformed prefix
- terlalu pendek
- terlalu panjang
- unicode
- SQL injection strings
- HTML
- JSON-like input
- random strings
- duplicated separators
- URL encoded payload
- extremely long payload

Semua harus:
- tidak crash
- tidak leak database error
- tidak mengubah subscription
- tidak bypass rate limit
- tidak menghasilkan successful redemption

Jangan expose:
- PGRST error
- PostgreSQL error
- table name
- column name
- RPC internals
- whether a specific random code partially matched

Error response harus generic untuk invalid/unknown code.

==================================================
7. RACE CONDITION TEST
==================================================

Buat automated test yang mengirim >=10 concurrent redeem requests
menggunakan plaintext activation code yang sama.

Expected:

SUCCESS = 1

REDEEMED ROWS = 1

PRO ENTITLEMENT EFFECT = 1

Tidak boleh:
- duplicate subscription
- duplicate entitlement
- duplicate redemption
- race-condition bypass

==================================================
8. RLS / RPC SECURITY
==================================================

Activation codes tidak boleh dapat dibaca user biasa.

Anon:
- SELECT = DENY
- INSERT = DENY
- UPDATE = DENY
- DELETE = DENY

Authenticated normal user:
- SELECT activation codes = DENY
- INSERT = DENY
- UPDATE = DENY
- DELETE = DENY

Admin:
- nanti akan membutuhkan generate/manage,
  tetapi UI/admin RPC JANGAN dibuat pada phase ini kecuali
  memang diperlukan dependency backend.

Redeem RPC:
- hanya authenticated user
- tidak boleh menerima user_id/business_id dari client sebagai authority
- gunakan auth.uid() server-side.

Jangan percaya:
p_user_id
p_business_id
p_profile_id
dari client untuk menentukan pemilik entitlement.

==================================================
9. AUDIT LOG
==================================================

Gunakan existing public.admin_audit_logs.

Jangan membuat tabel audit baru.

Admin generation/revoke nanti akan diaudit pada phase Admin UI.

Redeem user boleh dicatat jika existing audit architecture memang mendukung,
tetapi JANGAN simpan plaintext activation code.

Jika mencatat identifier:
gunakan activation code UUID / safe hash identifier,
bukan plaintext.

==================================================
10. SUBSCRIPTION ENTITLEMENT
==================================================

Jangan membuat entitlement system baru.

Gunakan existing:
subscriptions
dan existing entitlement logic.

Redeem yang sukses harus menghasilkan:

plan = pro
status = active
expires_at = sesuai durasi activation code / konfigurasi yang disepakati

Jangan mengubah payment history seolah-olah ada transaksi Midtrans.

Activation code redemption adalah entitlement grant,
BUKAN payment record.

Jangan insert fake payment ke subscription_payments.

==================================================
11. SECURITY TESTS WAJIB
==================================================

Buat test khusus:

pro_activation_security.test.js

Minimal:

1. anonymous redeem denied
2. authenticated invalid code denied
3. valid code succeeds
4. same code second redeem denied
5. expired code denied
6. revoked code denied
7. malformed input denied
8. SQL injection denied
9. oversized input denied
10. normal user cannot SELECT codes
11. normal user cannot INSERT codes
12. normal user cannot UPDATE codes
13. normal user cannot DELETE codes
14. concurrent redemption = exactly 1 success
15. brute-force threshold enforced
16. subscription created/updated correctly
17. failed subscription transaction does not consume code
18. no plaintext code stored
19. no plaintext code returned by RPC
20. cross-user manipulation denied
21. cross-business manipulation denied if business binding exists
22. repeated concurrent invalid requests cannot bypass limiter

==================================================
12. IMPORTANT ENTROPY VERIFICATION
==================================================

Print/verify mathematically:

alphabet size
number of random characters
entropy = length * log2(alphabet size)

DO NOT simply claim "128-bit".

The final report MUST explicitly state:

Code format:
Alphabet:
Length:
Calculated entropy:
Storage:
Plaintext persistence:
Rate limit:
Concurrent redemption:
Single-use guarantee:

==================================================
13. MIGRATION / REMOTE VERIFICATION
==================================================

After implementation:

npx supabase db push

Then verify remote database directly.

Check:
- table exists
- indexes
- constraints
- RLS
- RPC
- grants
- SECURITY DEFINER
- search_path=''
- public/anon EXECUTE revoked where appropriate

Run:
- Phase 1 tests
- relevant subscription regression tests
- existing admin regression
- QRIS/POS regression

Then:
npm test
npm run lint
npm run build

STOP AFTER PHASE 1.

FINAL REPORT MUST INCLUDE:
- exact migration filename
- exact RPC name
- actual remote schema
- entropy calculation
- rate-limit design
- concurrency result
- brute-force result
- RLS result
- subscription entitlement result
- test counts
- lint result
- build result
- files changed

DO NOT proceed to Admin UI / QR / Pricing / Midtrans removal yet.
