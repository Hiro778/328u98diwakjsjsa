IMPLEMENT ADMIN CONTROL CENTER — STAGE 5: SUBSCRIPTION MANAGEMENT

PROJECT:
BisnisSehat — Platform UMKM Modern

CURRENT STATUS:
Stage 1 Admin RBAC              = PASS
Stage 2 Admin Layout + Overview = PASS
Stage 3 User Management         = PASS
Stage 4 Business Management     = PASS

STAGE 5 ONLY:
ADMIN SUBSCRIPTION MANAGEMENT

==================================================
1. HARD SCOPE LOCK
==================================================

Implement ONLY Subscription Management.

ALLOWED:
- subscription admin service
- subscription admin page
- subscription detail page jika memang diperlukan
- subscription-related RPC/database functions
- subscription admin tests
- AdminLayout navigation change:
  Subscriptions: SOON → ACTIVE
- App.jsx routes untuk subscription admin
- migration baru khusus Stage 5 jika benar-benar diperlukan

FORBIDDEN:
- jangan ubah User Management
- jangan ubah Business Management
- jangan ubah QRIS
- jangan ubah POS
- jangan ubah payment checkout customer
- jangan ubah Midtrans flow existing
- jangan ubah AI Usage
- jangan implement Support
- jangan implement Payments admin
- jangan implement Audit Logs page
- jangan implement Settings
- jangan mengubah RBAC Stage 1
- jangan mengubah banned-user security
- jangan mengubah Auth/GoTrue
- jangan membuat subscription system baru
- jangan membuat tabel subscription duplikat
- jangan mengubah entitlement logic existing kecuali audit menemukan bug kritis yang benar-benar diperlukan

STOP setelah Stage 5 selesai.

JANGAN lanjut Stage 6 otomatis.

==================================================
2. MANDATORY PREFLIGHT AUDIT
==================================================

SEBELUM MENULIS CODE:

Audit schema DATABASE REMOTE + migration lokal untuk:

- public.subscriptions
- public.subscription_payments
- public.profiles
- public.businesses
- payment-related tables/functions yang benar-benar berhubungan dengan subscription
- existing subscription services
- existing entitlement/plan logic
- existing cancellation logic
- existing payment status logic
- existing admin RPC/RBAC

Cari seluruh penggunaan:

subscriptions
subscription_payments
subscription_status
plan
PRO/FREE
trial
cancel
renew
expired
payment
entitlement

WAJIB gunakan schema aktual.

JANGAN mengarang kolom seperti:
- status
- plan
- price
- expired_at
- current_period_end
- payment_status

kalau kolom tersebut ternyata tidak ada.

Catat mapping:

subscription
→ owner/user/business
→ plan
→ status
→ period
→ payment history
→ entitlement

Jika existing application sudah memiliki service/function untuk subscription,
REUSE.

Jangan membuat logic kedua yang bertentangan dengan logic existing.

==================================================
3. DEFINE ADMIN CAPABILITIES
==================================================

Admin harus bisa melihat subscription secara terpusat.

Minimum:

- daftar seluruh subscription
- search
- filter plan
- filter status
- sorting
- pagination server-side
- owner/user
- business
- plan
- status
- periode
- created date
- updated date jika tersedia

Detail subscription harus menampilkan data aktual yang tersedia,
bukan fake/mock data.

Jika schema mendukung:

- subscription history
- payment history
- cancellation information
- renewal information
- current entitlement
- business owner
- business

Tampilkan hanya field yang benar-benar ada.

==================================================
4. SEARCH / FILTER / PAGINATION
==================================================

WAJIB database-side.

Search dapat mencakup field yang benar-benar tersedia,
misalnya:

- user email
- user name
- business name
- subscription identifier

Jangan melakukan:

SELECT seluruh database lalu filter di browser.

Pagination juga database-side.

==================================================
5. ADMIN ACTIONS
==================================================

Audit dulu existing subscription lifecycle.

Jika existing system memang memiliki operasi admin yang aman,
gunakan/reuse.

Potential admin actions yang BOLEH dipertimbangkan
HANYA jika schema + existing business logic mendukung:

- cancel subscription
- reactivate subscription
- change plan
- extend period
- manual entitlement correction

TAPI:

JANGAN membuat action hanya demi memenuhi UI.

Jika action memiliki risiko financial/entitlement,
harus:

1. server-side authorization
2. validasi target
3. atomic database operation
4. audit trail jika infrastructure audit memang sudah tersedia
5. tidak menerima trusted values dari client
6. tidak memungkinkan privilege escalation

Jika sebuah action belum memiliki business rule yang jelas,
READ-ONLY lebih baik daripada membuat logic baru.

==================================================
6. SECURITY
==================================================

Admin access HARUS tetap melalui:

public.is_admin()

dan architecture RBAC existing.

JANGAN:
- localStorage role
- hidden UI sebagai security
- client-side admin check saja
- service-role key di browser
- expose auth.users secara langsung ke client
- expose credential/token/payment secret

Untuk RPC:

SECURITY DEFINER
SET search_path=''

gunakan fully-qualified table/function names.

Pastikan unauthorized user tidak dapat:

- membaca seluruh subscription
- membaca subscription user lain
- memanggil admin RPC
- memanipulasi subscription ID
- mengubah plan/status/period tanpa authorization

Test minimal:

1. ADMIN → allowed
2. SUPER_ADMIN → allowed
3. normal USER → denied
4. anonymous → denied
5. cross-target manipulation → denied
6. invalid UUID → handled
7. nonexistent subscription → handled

==================================================
7. FINANCIAL / ENTITLEMENT SAFETY
==================================================

INI PENTING.

Subscription admin jangan sampai membuat:

payment history ≠ entitlement

atau:

subscription status ≠ payment status

atau:

plan berubah tetapi entitlement tidak sinkron.

Audit existing architecture dan pertahankan separation:

PAYMENT HISTORY
≠
SUBSCRIPTION ENTITLEMENT

Jika subscription payment table hanya merupakan history,
jangan menjadikannya sumber entitlement.

Jika entitlement berasal dari subscriptions,
ikuti existing source of truth.

Jangan mengubah data payment provider hanya karena admin mengubah
subscription.

Jangan membuat fake payment transaction.

==================================================
8. UI
==================================================

Gunakan visual language Admin Control Center existing.

Dark theme.

Sidebar:

Subscriptions
→ ACTIVE

Bukan lagi:

Subscriptions
→ SOON

Page:

Subscription Management

Contoh struktur:

[Subscription Management]

Search...

[All Plans] [All Status] [Sort]

------------------------------------------------

USER / BUSINESS
PLAN
STATUS
PERIOD
PAYMENT
UPDATED
ACTION

------------------------------------------------

Gunakan:

- loading skeleton
- empty state
- error state
- retry
- responsive table
- status badges
- confirmation modal untuk destructive/high-impact action

Jangan gunakan fake metrics.

==================================================
9. DETAIL PAGE
==================================================

Jika diperlukan:

/admin/subscriptions/:id

Tampilkan:

Subscription
- identifier
- plan
- status
- period
- created/updated

Owner
- user
- email

Business
- business name
- business ID

Payment history
- gunakan schema existing
- jangan expose secret/raw credentials

Entitlement
- tampilkan source-of-truth existing

History/cancellation
- hanya jika datanya memang tersedia.

==================================================
10. DATABASE DESIGN
==================================================

Jangan membuat tabel baru jika existing schema sudah cukup.

Jika migration baru diperlukan:

buat migration baru dengan nomor berikutnya.

Jangan modify migration historical.

Jangan duplicate:

subscriptions
subscription_payments

Jangan membuat:

admin_subscriptions

hanya untuk kebutuhan UI.

Gunakan existing tables + secure RPC bila diperlukan.

==================================================
11. AUDIT LOG
==================================================

Audit log UI tetap OUT OF SCOPE.

Namun jika admin melakukan mutation dan architecture existing
memang mensyaratkan audit log:

gunakan public.admin_audit_logs yang sudah ada.

Jangan membuat audit_logs baru.

Jangan memberikan admin kemampuan UPDATE/DELETE audit log.

==================================================
12. TESTING
==================================================

Buat:

src/__tests__/admin_subscriptions.test.js

atau nama yang mengikuti convention existing project.

Test:

A. Schema/service
- query mapping
- normalization
- pagination
- search
- filters
- sorting

B. Authorization
- admin allowed
- super admin allowed
- normal user denied
- anonymous denied
- cross-target denied

C. Security
- ID manipulation
- invalid UUID
- nonexistent subscription
- no credential leakage
- no service-role key

D. Business logic
- existing plan/status mapping
- entitlement consistency
- payment history consistency

E. Mutation
Jika ada mutation:
- authorization
- atomicity
- idempotency
- invalid input
- audit behavior

F. Regression
Pastikan:
- Stage 1 admin RBAC tetap PASS
- Stage 2 overview tetap PASS
- Stage 3 users tetap PASS
- Stage 4 businesses tetap PASS
- existing subscription tests tetap PASS

==================================================
13. REQUIRED VALIDATION
==================================================

Run:

- targeted Stage 5 tests
- existing admin test suites
- subscription-related tests
- full npm test
- lint
- production build

Target:

0 test failures
0 test cancellations
0 test skips

Lint:

0 new errors.

Existing warnings boleh tetap ada,
tapi laporkan jumlah sebelum vs sesudah.

Build harus PASS.

==================================================
14. LIVE SUPABASE VERIFICATION
==================================================

Jangan hanya test mock.

Jika environment memungkinkan, verify against LIVE Supabase:

- subscription list
- detail
- admin authorization
- normal user denial
- subscription filtering
- pagination
- payment history mapping
- entitlement mapping

Jangan melakukan destructive live mutation
kecuali benar-benar diperlukan dan aman.

Jika membutuhkan mutation test,
gunakan data/test target yang aman dan cleanup setelah test.

==================================================
15. UI MANUAL VERIFICATION
==================================================

Verify:

/admin
/admin/subscriptions
/admin/subscriptions/:id jika dibuat
/admin/users
/admin/businesses
/dashboard
/

Pastikan AuthProvider hierarchy tidak berubah.

Pastikan:

RequireAuth
→ RequireAdmin
→ AdminLayout
→ Subscription Management

tetap konsisten dengan architecture existing.

==================================================
16. FINAL REPORT FORMAT
==================================================

Saat selesai, LAPORKAN:

1. STATUS:
PASS / BLOCKED

2. PREFLIGHT:
- actual subscription schema
- actual payment schema
- actual entitlement source
- existing services reused

3. FILES CREATED

4. FILES MODIFIED

5. DATABASE:
- migration
- RPC
- RLS
- policies
- indexes

6. FEATURES:
- search
- filter
- sorting
- pagination
- detail
- actions

7. SECURITY:
- admin authorization
- cross-user protection
- IDOR protection
- credential exposure check

8. TEST RESULTS:
- Stage 5 tests
- Admin regression
- Subscription regression
- Full npm test

9. LINT

10. BUILD

11. LIVE SUPABASE VERIFICATION

12. MANUAL UI VERIFICATION

13. KNOWN LIMITATIONS

14. EXACT SCOPE:
Confirm that Stage 6 was NOT implemented.

STOP.
