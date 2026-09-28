AUTHORIZED SECURITY AUDIT — BISNISSEHAT
FULL APPLICATION ADVERSARIAL SECURITY / API / RLS / ENTITLEMENT AUDIT

Konteks:
Ini adalah audit keamanan terhadap aplikasi BisnisSehat milik project ini sendiri.
Tujuan: menemukan dan memperbaiki bypass authorization, IDOR, tenant isolation failure,
subscription/entitlement bypass, admin privilege escalation, API/RPC abuse, storage leakage,
dan endpoint yang dapat diakses tanpa otorisasi yang benar.

JANGAN membuat fitur baru.
JANGAN mengubah UI kecuali diperlukan untuk memperbaiki vulnerability.
JANGAN merombak schema yang sudah benar.
JANGAN menghapus security control yang sudah ada.

PRINSIP:
1. Audit source code + database + Supabase policies + Edge Functions.
2. Gunakan test account yang memang tersedia di project.
3. Untuk pengujian tenant isolation gunakan minimal:
   - USER/business A
   - USER/business B
   - ADMIN/SUPER_ADMIN
4. Jangan mengambil data sensitif user lain.
5. Jangan dump secrets, token, password, service-role key, atau credential.
6. Jangan melakukan destructive attack terhadap production data.
7. Semua exploit test harus bounded dan reversible.
8. Jika menemukan vulnerability, reproduksi minimal → dokumentasikan → fix → regression test.
9. Jangan menyatakan PASS hanya berdasarkan static inspection.
10. Bedakan:
   - VERIFIED SAFE
   - VULNERABLE
   - NOT TESTABLE
   - NOT APPLICABLE

==================================================
PHASE 1 — ATTACK SURFACE INVENTORY
==================================================

Audit dan inventarisasikan:

A. Frontend routes
- semua route React
- protected route
- admin route
- public route
- feature/pro route
- routes yang menerima :id / UUID / business_id

B. Supabase REST
Audit seluruh pemakaian:
- /rest/v1/
- table/view access
- RPC invocation
- storage API

Cari:
- direct table access dari browser
- query yang hanya mengandalkan frontend filtering
- query yang menerima user-controlled IDs

C. Edge Functions
Inventarisasikan seluruh:
- supabase/functions/*
- function name
- auth requirement
- JWT verification
- business context
- ownership validation
- input validation
- service-role usage

D. RPC
Inventarisasikan seluruh public functions yang dipanggil frontend.

Untuk setiap RPC cek:
- SECURITY INVOKER / SECURITY DEFINER
- search_path
- auth.uid()
- is_admin()
- ownership check
- parameter validation
- EXECUTE privilege
- apakah anon/public dapat memanggilnya

E. Storage
Inventarisasikan bucket:
- public/private
- SELECT/INSERT/UPDATE/DELETE policies
- path ownership
- signed URL behavior

F. GraphQL
Jika project memang mempunyai GraphQL endpoint/API:
- identifikasi endpoint
- cek apakah introspection tersedia
- cek authorization
- cek apakah tenant isolation tetap berlaku

Jika tidak ada GraphQL:
NOT APPLICABLE — jangan membuat GraphQL baru.

==================================================
PHASE 2 — AUTHORIZATION / IDOR ATTACK
==================================================

Dengan USER A dan USER B:

Untuk setiap endpoint/RPC penting coba gunakan ID milik Business B
ketika authenticated sebagai USER A.

Target:
- business_id
- profile_id
- user_id
- order_id
- campaign_id
- subscription_id
- payment_id
- product_id
- inventory_id
- support_ticket_id
- creative_credit/business credit
- loan simulation
- BEP calculation
- cash flow forecast
- QRIS settings
- order_messages

Expected:
USER A harus mendapat:
- 0 rows / 404 / 42501 / permission denied
sesuai kontrak endpoint.

Tidak boleh:
- read data Business B
- update data Business B
- delete data Business B
- consume credit Business B
- change payment state Business B

==================================================
PHASE 3 — SUBSCRIPTION / ENTITLEMENT BYPASS
==================================================

Ini PRIORITAS TINGGI.

Jangan hanya test UI.

Cari seluruh enforcement PRO/FREE.

Untuk setiap PRO feature:

1. Login sebagai FREE user.
2. Bypass frontend.
3. Panggil service/API/RPC langsung.
4. Manipulasi:
   - plan
   - subscription_id
   - business_id
   - profile_id
   - feature key
   - entitlement flags
   - request body
   - headers
5. Coba akses resource PRO secara langsung.

Expected:
FREE user tetap ditolak di server/database.

Test juga:
- expired subscription
- cancelled subscription
- inactive subscription
- banned user
- deleted/soft-deleted user
- subscription Business A digunakan untuk Business B

Jangan menerima:
"button PRO sudah disabled"
sebagai bukti security.

Security harus tetap enforced ketika frontend dilewati.

==================================================
PHASE 4 — ADMIN PRIVILEGE ESCALATION
==================================================

Test sebagai USER biasa:

A. Direct route:
- /admin
- /admin/users
- /admin/businesses
- /admin/subscriptions
- /admin/ai-usage
- /admin/support
- /admin/payments
- /admin/audit-logs
- /admin/settings

B. Direct RPC invocation:
- seluruh admin RPC

C. Manipulasi request:
- user_id
- role
- admin_user_id
- business_id

D. Coba:
- insert admin_users
- update admin_users
- change role USER → ADMIN
- change role USER → SUPER_ADMIN
- mutate another user's status
- modify platform_settings

Expected:
USER biasa harus ditolak server-side.

Kemudian test ADMIN:
- tidak boleh melakukan operasi SUPER_ADMIN-only.

Kemudian SUPER_ADMIN:
- hanya dapat melakukan operasi yang memang diizinkan.

Verifikasi tidak ada authorization yang hanya berasal dari:
- localStorage
- React state
- hidden UI
- client-side role variable.

==================================================
PHASE 5 — RPC SECURITY
==================================================

Query database metadata untuk seluruh public functions.

Audit:
- SECURITY DEFINER
- search_path
- EXECUTE privilege
- PUBLIC privilege
- anon privilege
- authenticated privilege

Untuk setiap SECURITY DEFINER:
- search_path harus aman
- seluruh tabel/schema harus qualified
- authorization harus dilakukan di dalam function
- parameter user-controlled tidak boleh menjadi bypass ownership

Cari pola berbahaya seperti:

auth.uid() hanya diperiksa di frontend
atau
WHERE id = supplied_id
tanpa ownership check.

==================================================
PHASE 6 — EDGE FUNCTION SECURITY
==================================================

Untuk setiap Edge Function:

Test:
1. no Authorization header
2. invalid JWT
3. expired JWT
4. USER token
5. ADMIN token
6. wrong business_id
7. wrong user_id
8. wrong campaign/order/payment ID

Pastikan function tidak mempercayai:
- body.user_id
- body.profile_id
- body.business_id
- x-business-id

tanpa memverifikasi ownership.

Khusus function yang menggunakan service_role:
pastikan service_role hanya digunakan setelah authorization berhasil.

Audit:
- creative-generate-prd
- creative-revise-prd
- seluruh function lain yang ditemukan

==================================================
PHASE 7 — QRIS / PAYMENT
==================================================

Audit ulang:

Customer tidak boleh:
- set payment_status=paid
- create fake payment row
- modify payment amount
- modify payment order_id
- confirm payment
- invoke merchant_process_order
- invoke merchant_complete_order

Test:

BARU
→ customer mencoba paid
→ harus gagal

BARU
→ customer mencoba complete
→ harus gagal

BARU
→ merchant mencoba COMPLETE langsung
→ harus gagal

BARU
→ merchant PROCESS
→ payment confirmation + DIPROSES harus atomic

DIPROSES
→ merchant COMPLETE
→ SELESAI

SELESAI
→ PROCESS lagi
→ COMPLETE lagi
→ harus idempotent/ditolak sesuai kontrak.

==================================================
PHASE 8 — ORDER CHAT
==================================================

Dengan Order A milik Business A:

USER A:
- read chat A = allowed
- send chat A = allowed sesuai status

USER B:
- read chat A = DENIED
- send chat A = DENIED

Merchant B:
- read chat A = DENIED
- send chat A = DENIED

Customer:
- tidak boleh spoof:
  Merchant
  Admin
  Kasir
  seller

After:
- SELESAI
- BATAL

send message harus ditolak.

Test juga manipulasi:
- order_id
- business_id
- sender_id
- sender_type

Server harus menentukan identity dari authenticated context,
bukan mempercayai sender_id dari client.

==================================================
PHASE 9 — STORAGE SECURITY
==================================================

Audit seluruh bucket.

Khusus:
- business-assets
- QRIS image
- user assets
- creative assets

Test:
USER A mencoba:
- read private file Business B
- create signed URL untuk file Business B
- upload ke path Business B
- delete file Business B

Expected:
DENIED.

Pastikan tidak ada:
- service-role key
- permanent private storage URL
- secret token
di frontend bundle.

==================================================
PHASE 10 — CLIENT SECRET / ENV EXPOSURE
==================================================

Audit:
- import.meta.env
- VITE_*
- process.env
- generated dist
- source maps jika enabled

Cari:
- SUPABASE_SERVICE_ROLE_KEY
- MIDTRANS_SERVER_KEY
- JWT secret
- OAuth secret
- webhook secret
- Gemini/OpenAI private API key
- database password

Public client config yang memang public boleh tetap ada:
- Supabase URL
- Supabase anon/publishable key

Private secrets harus tidak pernah masuk browser.

==================================================
PHASE 11 — SECURITY SETTINGS
==================================================

Audit Stage 10 platform_settings.

PENTING:

maintenance_mode saat ini dilaporkan hanya disimpan di DB.

JANGAN menyatakan maintenance_mode sebagai
"global traffic blocking" kecuali benar-benar enforced.

Test:
- setting update
- fresh client read
- audit log
- non-admin denied

Kemudian tentukan secara eksplisit:
MAINTENANCE_MODE_ENFORCED_GLOBALLY = YES/NO

Jangan implement global blocking dalam audit ini kecuali memang diperlukan
untuk memperbaiki vulnerability yang ditemukan.

==================================================
PHASE 12 — API FUZZ / INPUT VALIDATION
==================================================

Untuk endpoint penting gunakan input bounded:

- null
- empty string
- malformed UUID
- UUID milik tenant lain
- negative numbers
- NaN / Infinity jika relevan
- extremely large number
- unexpected enum
- unexpected JSON shape
- duplicated parameters

Expected:
clean validation error.

Tidak boleh:
- SQL error leakage
- stack trace
- secret leakage
- internal database schema leakage
- privilege escalation.

==================================================
PHASE 13 — ERROR / INFORMATION DISCLOSURE
==================================================

Cari response yang membocorkan:
- database names
- table names
- SQL
- service role
- JWT
- internal filesystem
- Supabase service credentials
- provider secret
- internal admin information

Production error harus dinormalisasi.

==================================================
PHASE 14 — AUTOMATED ADVERSARIAL TEST SUITE
==================================================

Buat test suite baru:

src/__tests__/security_full_adversarial.test.js

Minimal coverage:

1. anonymous access
2. normal user → admin
3. normal user → another business
4. business A → business B
5. free → PRO bypass
6. expired subscription → PRO
7. banned → protected endpoint
8. RPC privilege escalation
9. Edge Function auth bypass
10. QRIS payment manipulation
11. order status manipulation
12. chat cross-tenant access
13. chat role spoofing
14. storage cross-tenant access
15. platform settings unauthorized mutation
16. secret exposure
17. error leakage

==================================================
PHASE 15 — FIX POLICY
==================================================

Jika vulnerability ditemukan:

1. Reproduce.
2. Record exact attack vector.
3. Identify root cause.
4. Apply smallest safe fix.
5. Add regression test.
6. Re-run relevant existing suites.
7. Run full npm test.
8. Run lint.
9. Run production build.
10. Repeat exploit to prove fix.

JANGAN:
- weaken RLS
- expose service_role
- trust frontend role
- trust client-supplied user_id
- trust client-supplied business ownership
- bypass existing security hanya supaya test PASS.

==================================================
FINAL REPORT
==================================================

Output:

SECURITY AUDIT RESULT

CRITICAL:
- ...

HIGH:
- ...

MEDIUM:
- ...

LOW:
- ...

FIXED:
- vulnerability
- root cause
- exact fix
- regression test

VERIFIED SAFE:
- ...

NOT TESTABLE:
- ...

NOT APPLICABLE:
- ...

ENTITLEMENT BYPASS:
PASS / FAIL

ADMIN ESCALATION:
PASS / FAIL

CROSS-TENANT IDOR:
PASS / FAIL

QRIS MANIPULATION:
PASS / FAIL

ORDER CHAT:
PASS / FAIL

STORAGE:
PASS / FAIL

EDGE FUNCTIONS:
PASS / FAIL

RPC SECURITY:
PASS / FAIL

SECRET EXPOSURE:
PASS / FAIL

GRAPHQL:
PASS / FAIL / NOT APPLICABLE

MAINTENANCE MODE GLOBAL ENFORCEMENT:
YES / NO

Tests:
X PASS / X FAIL

Lint:
X errors

Build:
PASS / FAIL

STOP setelah laporan.
Jangan lanjut mengembangkan fitur lain.
