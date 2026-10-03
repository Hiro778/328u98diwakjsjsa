AUDIT + IMPLEMENT — NEW 2-TIER PRICING MODEL BISNISSEHAT

FINAL PRICING MODEL:

FREE PLAN DIHAPUS DARI MODEL ENTITLEMENT.

TIER 1:
BASIC — Rp35.000 / bulan

TIER 2:
PRO — Rp130.000 / bulan

============================================================
CORE BUSINESS RULE
============================================================

BASIC Rp35K:

Berisi tools standalone yang dapat bekerja hanya berdasarkan input pengguna dan TIDAK membutuhkan:

- business database
- persistent business data
- POS data
- transaction history
- QRIS operational data
- CRM data
- financial business history
- AI analysis
- database-backed analytics
- operational realtime data

Konsep:

INPUT USER
→ CALCULATION/PROCESSING
→ RESULT

Tidak perlu membaca data bisnis dari database untuk menghasilkan hasil utama.

PRO Rp130K:

Mencakup SEMUA fitur Basic PLUS fitur yang membutuhkan:

- database bisnis
- business history
- transaction/order data
- persistent financial data
- analytics
- AI analysis
- operational modules
- POS
- QR Menu / QRIS
- CRM
- financial reporting
- data-driven business intelligence
- Creative Studio / AI features sesuai existing entitlement

IMPORTANT:

Jangan menebak klasifikasi tool hanya berdasarkan nama.

Audit implementasi aktual setiap tool.

============================================================
PHASE 1 — AUDIT ONLY
============================================================

SEBELUM MENGUBAH KODE:

Audit seluruh tools/routes/features BisnisSehat.

Cari:

- src/pages
- src/routes
- tool registry
- entitlement logic
- subscription logic
- plan checks
- feature flags
- pricing page
- RequireSubscription
- useSubscription
- subscriptionService
- existing PRO checks
- existing FREE checks
- creative credit entitlement
- Admin subscription management

Identifikasi SEMUA tool yang tersedia.

Untuk setiap tool catat:

1. Name
2. Route
3. Component
4. Existing entitlement
5. Requires database? YES/NO
6. Reads business data? YES/NO
7. Writes business data? YES/NO
8. Uses AI? YES/NO
9. Uses transaction/order data? YES/NO
10. Uses persistent history? YES/NO
11. Proposed tier:
    BASIC
    PRO
12. Reason

============================================================
PHASE 2 — CREATE ENTITLEMENT MATRIX
============================================================

Buat matrix final:

TOOL | ROUTE | BASIC | PRO | DATABASE | AI | REASON

Rules:

BASIC = standalone/no business DB dependency

PRO = database/data/AI/operational dependency

IMPORTANT:

Jangan memasukkan tool ke Basic hanya karena tool terlihat sederhana.

Periksa source code actual.

============================================================
PHASE 3 — IDENTIFY AMBIGUOUS FEATURES
============================================================

Jika ada tool yang tidak jelas:

JANGAN diam-diam memasukkannya ke Basic.

Masukkan:

"AMBIGUOUS — NEED OWNER DECISION"

dan jelaskan dependency aktualnya.

STOP setelah audit jika klasifikasi ambigu memengaruhi banyak fitur.

Namun jika klasifikasi dapat ditentukan dari source code dengan jelas, lanjutkan.

============================================================
PHASE 4 — ENTITLEMENT ARCHITECTURE
============================================================

Setelah matrix jelas:

Implement entitlement:

BASIC
PRO

Jangan menggunakan string:

FREE

sebagai tier aktif baru.

Tetapi hati-hati:

Jangan langsung menghapus enum/database FREE jika existing database masih membutuhkan backward compatibility.

Audit dahulu:

- subscriptions.plan
- existing subscription records
- database enum/check constraints
- RPCs
- RLS
- frontend plan checks
- admin subscription UI

Jika FREE masih diperlukan untuk legacy users/data migration:

pertahankan untuk compatibility tetapi:
- tidak ditampilkan sebagai pricing tier baru
- tidak ditawarkan sebagai paket baru
- existing FREE users harus punya behavior yang jelas dan aman

Jangan delete existing subscription data.

============================================================
PHASE 5 — BASIC ENTITLEMENT
============================================================

Basic users harus dapat:

- semua tool yang diklasifikasikan BASIC
- tanpa akses ke PRO-only tools

Basic tetap harus memiliki authentication/subscription entitlement yang benar.

Jangan menggunakan frontend-only gating.

============================================================
PHASE 6 — PRO ENTITLEMENT
============================================================

PRO users:

- dapat semua BASIC tools
- dapat semua PRO tools

Existing PRO behavior harus tetap berjalan.

============================================================
PHASE 7 — SERVER-SIDE ENFORCEMENT
============================================================

Critical PRO functionality harus tetap memiliki server-side enforcement.

Jangan hanya:

if (plan === 'PRO') ...

di React.

Untuk fitur yang memiliki:
- RPC
- Edge Function
- database mutation
- AI consumption
- business data access

pastikan unauthorized BASIC user tidak bisa bypass dengan:

- direct RPC
- REST/PostgREST
- direct Edge Function invocation
- manipulated request body
- manipulated URL
- modified frontend state

Gunakan existing entitlement/RLS/security architecture.

Jangan membuat security system baru jika existing system dapat diperluas.

============================================================
PHASE 8 — PRICING PAGE
============================================================

Ubah pricing UI menjadi:

BASIC
Rp35.000 / bulan

PRO
Rp130.000 / bulan

FREE tidak ditampilkan sebagai pricing option baru.

Basic description harus menjelaskan bahwa ini adalah paket tools standalone.

Pro description harus menjelaskan bahwa ini mencakup:
- Basic
- database-backed tools
- analytics
- AI
- operational/business features

Jangan mengklaim fitur yang ternyata belum aktif.

============================================================
PHASE 9 — EXISTING PAYMENT/SUBSCRIPTION SYSTEM
============================================================

Audit existing subscription/payment implementation sebelum mengubah.

Jangan mengubah:
- Midtrans subscription lifecycle
- payment history
- admin subscription management
- cancellation logic
- entitlement expiration

kecuali diperlukan langsung untuk mendukung BASIC/PRO.

Jika harga package berasal dari server/database/config:

ubah source-of-truth yang benar.

Jangan hanya mengubah text:

"Rp130.000"

di frontend.

============================================================
PHASE 10 — ADMIN SUBSCRIPTION MANAGEMENT
============================================================

Admin harus dapat melihat:

BASIC
PRO

dengan benar.

Jika legacy FREE user masih ada:
tampilkan sebagai legacy/free status sesuai existing data.

Jangan menghapus historical subscription/payment records.

============================================================
PHASE 11 — TESTS
============================================================

WAJIB buat/update tests:

1. Basic user:
   BASIC tool → ALLOWED

2. Basic user:
   PRO tool → BLOCKED

3. Pro user:
   BASIC tool → ALLOWED

4. Pro user:
   PRO tool → ALLOWED

5. Expired Pro:
   PRO tool → BLOCKED

6. Cancelled Pro:
   PRO tool → BLOCKED

7. Unauthenticated:
   protected tool → existing auth behavior

8. Direct RPC:
   Basic user cannot bypass PRO entitlement.

9. Direct Edge Function:
   Basic user cannot bypass PRO AI feature.

10. URL manipulation:
    Basic user cannot open PRO-only tool by direct route.

11. Client state manipulation:
    changing frontend plan state does not grant PRO access.

12. Existing creative credit entitlement remains correct.

13. Existing subscription expiration remains correct.

14. Existing admin subscription management remains correct.

============================================================
PHASE 12 — REGRESSION
============================================================

Run relevant tests:

- subscription tests
- entitlement tests
- admin subscription tests
- creative/AI tests
- security tests
- QRIS tests
- POS tests
- maintenance tests

Then:

npm test

Then:

npm run build

============================================================
SCOPE LOCK
============================================================

DO NOT modify:

- Maintenance Mode
- Admin RBAC
- QRIS architecture
- POS order flow
- manual credit activation
- Financial Reports calculations
- Financial Health Score calculations
- Creative Studio logic

unless a direct entitlement dependency is proven.

Do NOT create fake data.

Do NOT silently classify ambiguous tools.

============================================================
FINAL REPORT
============================================================

Return:

### PRICING
Basic = Rp35.000/month
Pro = Rp130.000/month

### ENTITLEMENT MATRIX
Full list:

Tool | Route | Basic | Pro | DB | AI | Reason

### DATABASE
- subscription schema changes
- enum/check changes
- migration(s)

### FRONTEND
- pricing changes
- entitlement changes

### SERVER SECURITY
- RPC enforcement
- Edge Function enforcement
- RLS changes

### BACKWARD COMPATIBILITY
Explain how existing FREE users/subscriptions are handled.

### TESTS
Exact pass/fail counts.

### BUILD
npm run build result.

### REGRESSION
npm test result.

STOP AFTER COMPLETION.
