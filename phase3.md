IMPLEMENT SECURITY FIX — STEP 3 ONLY
BisnisSehat — Full Application Security Hardening

STEP 1 SUDAH SELESAI:
- Server-side Pro entitlement
- Creative Studio Pro enforcement
- Marketplace Pro enforcement
- Tenant isolation
- OAuth state protection

STEP 2 SUDAH SELESAI:
- Legacy DEFAULT 'pro'
- Cancellation state
- Basic/Pro amount validation
- Credit ledger idempotency
- Cross-user subscription RPC probing
- Basic cancellation

JANGAN mengulang pekerjaan tersebut kecuali regression test menemukan bug baru.

==================================================
TUJUAN STEP 3
==================================================

Lakukan security hardening terhadap attack surface lain yang belum
secara eksplisit diperbaiki pada Step 1/2.

Prioritas:

1. Edge Functions / API authorization
2. Database RPC authorization
3. Tenant / business isolation
4. Admin privilege escalation
5. Credit / financial mutation bypass
6. Order / payment state manipulation
7. Storage authorization
8. Chat / messaging authorization
9. SSRF / URL abuse
10. Secret / credential exposure
11. Rate-limit / replay attack surface
12. Client-side entitlement bypass
13. IDOR melalui UUID/object IDs
14. Webhook authenticity
15. Race conditions pada mutation sensitif

==================================================
PHASE 0 — INVENTORY
==================================================

Audit seluruh:

supabase/functions/**
supabase/migrations/**
src/lib/**
src/services/**
src/pages/**
storage policies
database RPC/functions/triggers

Buat inventory:

- Edge Function
- RPC
- mutation
- external provider call
- database table
- storage bucket
- authentication requirement
- authorization requirement
- tenant boundary
- sensitive data returned

JANGAN mengubah kode pada inventory phase.

==================================================
1. EDGE FUNCTION SECURITY
==================================================

Untuk setiap Edge Function yang menerima request user:

Pastikan:

- JWT diverifikasi server-side
- auth.uid() adalah identity authority
- tidak percaya user_id dari body
- tidak percaya business_id dari body
- tidak percaya role/plan/isPro dari client
- tenant ownership diverifikasi server-side
- provider dipanggil SETELAH authorization
- error tidak membocorkan internal details

Cari pola berbahaya:

user_id = body.user_id
business_id = body.business_id
plan = body.plan
isAdmin = body.isAdmin
isPro = body.isPro

Jika digunakan untuk authorization:
FIX.

==================================================
2. RPC SECURITY
==================================================

Audit seluruh SECURITY DEFINER RPC.

Setiap RPC sensitif harus:

- SECURITY DEFINER hanya jika diperlukan
- SET search_path=''
- explicit auth.uid() authorization
- explicit tenant ownership
- REVOKE PUBLIC/anon bila sensitif
- GRANT authenticated/service_role hanya sesuai kebutuhan

Cari:

- arbitrary UUID probing
- arbitrary business_id
- arbitrary profile_id
- arbitrary credit amount
- arbitrary subscription plan
- arbitrary status transition
- arbitrary ownership

JANGAN hanya mengandalkan frontend.

==================================================
3. TENANT ISOLATION / IDOR
==================================================

Test:

User A → object User B

Untuk:

- businesses
- products
- orders
- campaigns
- creative data
- credits
- subscriptions
- marketplace connections
- support tickets
- financial data
- uploaded files
- generated content

Expected:

DENIED.

Gunakan database/RPC ownership sebagai authority.

Client UUID manipulation wajib gagal.

==================================================
4. ADMIN SECURITY
==================================================

Audit semua admin RPC dan admin pages.

Pastikan:

normal user tidak dapat:

- execute admin RPC
- modify admin_users
- modify platform settings
- modify another user's subscription
- generate activation code
- generate credit activation
- modify audit logs
- modify support tickets sebagai admin
- access admin-only data

Test:

USER
→ ADMIN RPC = DENIED

ADMIN
→ legitimate admin operation = ALLOWED

SUPER_ADMIN
→ super-admin-only operation = ALLOWED

Admin tidak boleh mengubah role dirinya sendiri jika architecture melarangnya.

Jangan gunakan localStorage sebagai source of truth untuk role.

==================================================
5. CREDIT / FINANCIAL MUTATION
==================================================

Audit SEMUA jalan yang dapat:

- tambah credit
- kurangi credit
- ubah balance
- insert credit ledger
- ubah subscription
- ubah payment status
- mark payment paid
- complete order

Client tidak boleh menentukan:

credit_amount
ledger_type
payment_status
subscription_status
provider_transaction_id
paid_at
balance_after

Jika mutation legitimate:

server/database yang menentukan value.

Test forged payload.

==================================================
6. ORDER / PAYMENT STATE MACHINE
==================================================

Audit state transitions.

Cari kemungkinan:

BARU → COMPLETED
tanpa payment/authorized transition.

CANCELLED → COMPLETED

COMPLETED → CANCELLED

paid=true dari client

payment_status manipulation

provider transaction spoofing

Pastikan transition atomic dan server-authoritative.

Test race/concurrent requests.

Idempotent operations harus menghasilkan maksimal satu effect.

==================================================
7. STORAGE SECURITY
==================================================

Audit seluruh Supabase Storage bucket.

Pastikan user A tidak bisa:

read user B file
write user B path
delete user B file

Audit path construction.

Ideal tenant boundary:

{business_id}/...

Jangan percaya business_id path dari client tanpa ownership validation.

Test direct Storage API manipulation.

==================================================
8. CHAT / MESSAGING
==================================================

Audit seluruh chat/order messaging.

Pastikan user tidak bisa:

- spoof sender_id
- spoof business_id
- message another tenant
- message closed/cancelled order
- reopen completed conversation
- modify another user's conversation

Identity harus berasal dari auth.uid().

==================================================
9. SSRF / URL SECURITY
==================================================

Audit seluruh fitur yang menerima URL:

- SEO
- scraping
- website analysis
- image URL
- webhook URL
- external integrations

Block:

localhost
127.0.0.1
0.0.0.0
::1
private RFC1918
link-local
cloud metadata
internal hostnames

Jangan mengandalkan frontend validation.

Test redirect bypass.

==================================================
10. WEBHOOK SECURITY
==================================================

Audit seluruh webhook endpoint.

Pastikan:

- signature verification
- provider authenticity
- timestamp/replay protection jika tersedia
- amount validation
- order/subscription identity validation
- idempotency

Jangan trust:

status
amount
plan
user_id

dari webhook payload tanpa validation.

==================================================
11. SECRET EXPOSURE
==================================================

Scan:

src/
dist/
public/
Edge Function responses
logs

Cari:

- service_role key
- JWT secret
- Midtrans server key
- Gemini API key
- DataForSEO credentials
- marketplace credentials
- database credentials

Client bundle tidak boleh berisi server secrets.

Jangan print secret values di report.

==================================================
12. RATE LIMIT / REPLAY
==================================================

Audit sensitive endpoints:

- login-related actions
- activation redemption
- credit redemption
- payment verification
- OTP/token operations
- OAuth state
- expensive AI calls
- external API calls

Cari brute-force / replay possibilities.

Gunakan existing mechanisms jika tersedia.

Jangan menambahkan Redis/new infrastructure hanya untuk memenuhi audit.

==================================================
13. CLIENT ENTITLEMENT BYPASS
==================================================

Audit seluruh gated feature.

Test direct invocation:

FREE
BASIC
EXPIRED PRO
CANCELLED PRO
ACTIVE PRO

Client manipulation:

plan=pro
isPro=true
subscription=active

harus tidak bypass server.

Jangan menganggap React route guard sebagai security boundary.

==================================================
14. RACE CONDITIONS
==================================================

Audit mutation berikut:

- credit redemption
- subscription activation
- cancellation
- payment verification
- order completion
- payment marking
- inventory mutation
- OAuth state redemption

Gunakan:

FOR UPDATE
atomic UPDATE ... WHERE
unique constraint
transaction

sesuai kebutuhan.

Test concurrent requests bila mutation bernilai finansial/entitlement.

==================================================
15. MIGRATION SAFETY
==================================================

Jika menemukan vulnerability:

buat migration baru.

JANGAN edit migration production yang sudah applied.

Sebelum menambah UNIQUE constraint:

audit duplicate data.

Jangan delete historical data otomatis.

==================================================
16. TESTING
==================================================

Buat:

src/__tests__/securityStep3FullApplication.test.js

Minimal adversarial tests:

1. Edge Function unauthenticated
2. forged user_id
3. forged business_id
4. forged plan
5. forged isPro
6. cross-tenant object access
7. admin RPC by normal user
8. activation mutation by normal user
9. credit amount manipulation
10. ledger manipulation
11. payment status manipulation
12. order state manipulation
13. storage cross-tenant access
14. chat sender spoofing
15. chat tenant spoofing
16. webhook spoof
17. SSRF private IP
18. SSRF redirect
19. secret exposure scan
20. replay attack
21. concurrent mutation
22. client entitlement bypass
23. OAuth replay
24. deleted/banned user access
25. anonymous sensitive RPC

Tambahkan test sesuai vulnerability yang ditemukan.

==================================================
17. REGRESSION
==================================================

Run:

npm test

Run seluruh security matrix Step 1 + Step 2.

Run:

npm run build

Jangan menghapus atau melemahkan test lama.

Jika ada pre-existing failure:

JANGAN memperbaikinya hanya untuk membuat angka hijau.

Laporkan:

- test
- failure
- root cause
- pre-existing/regression
- apakah Step 3 menyentuhnya

==================================================
18. SECURITY REPORT
==================================================

FINAL REPORT WAJIB membagi hasil:

CRITICAL
HIGH
MEDIUM
LOW
INFO

Untuk setiap finding:

- vulnerability
- affected component
- attack scenario
- impact
- fix
- migration
- test
- status

Jangan menampilkan secret/token/API key asli.

==================================================
STRICT SCOPE LOCK
==================================================

JANGAN:

- redesign UI
- Pricing UI
- WhatsApp CTA
- Midtrans migration
- OpenSEO integration
- Chatwoot integration
- AI Video integration
- Maintenance Mode redesign
- mobile responsive work
- unrelated refactor
- delete historical data
- weaken security tests

Step 3 adalah SECURITY HARDENING ONLY.

STOP setelah:

- fixes selesai
- targeted tests PASS
- security regression PASS
- npm run build PASS
- final report selesai.
