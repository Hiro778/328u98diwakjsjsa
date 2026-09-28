STAGE 4 — ADMIN BUSINESS MANAGEMENT
RE-RUN / FIX IMPLEMENTATION

KONDISI SAAT INI
================

Stage 1 RBAC            = DONE
Stage 2 Overview/Layout = DONE
Stage 3 User Management = DONE
Stage 4 Business Management = sedang dikerjakan

Migration:
065_admin_business_management.sql
SUDAH DEPLOYED ke remote.

JANGAN membuat ulang migration 065.
JANGAN rollback migration yang sudah deployed.

Selain itu, account-status security hardening untuk BANNED/SUSPENDED user sudah dikerjakan terpisah. JANGAN mengubah task tersebut.

==================================================
SCOPE LOCK — STAGE 4 ONLY
==================================================

Fokus HANYA:

ADMIN BUSINESS MANAGEMENT

Routes:

/admin/businesses
/admin/businesses/:id

JANGAN mengerjakan:

- Stage 5 Subscriptions
- Stage 6 AI Usage
- Stage 7 Support
- Stage 8 Payments
- Stage 9 Audit Logs UI
- Stage 10 Settings
- POS
- QR Menu
- Creative Studio
- Midtrans
- financial tools
- banned-user hardening
- auth redesign

==================================================
IMPORTANT — JANGAN LANGSUNG MENJALANKAN TEST LAMA
==================================================

Sebelum coding:

1. Audit implementation yang SUDAH ADA.
2. Audit migration 065.
3. Audit schema businesses yang AKTUAL.
4. Audit App.jsx/AdminLayout.jsx.
5. Audit test Stage 4 yang sudah ada.
6. Cari test/task yang sedang hanging atau terlalu lama.

Kalau menemukan test yang hang:

JANGAN menunggu tanpa batas.

Identifikasi:
- command yang hang
- test file
- test case
- proses/worker yang tidak selesai
- apakah masalah implementation atau test harness

Gunakan timeout yang wajar.

Jika test suite besar terlalu lama, jalankan test Stage 4 secara terisolasi terlebih dahulu.

Jangan memalsukan hasil PASS.

==================================================
1. AUDIT DATABASE
==================================================

Baca:

supabase/migrations/065_admin_business_management.sql

Kemudian inspect schema aktual.

Gunakan field yang BENAR-BENAR ada.

Schema businesses yang sudah diketahui menggunakan:

- business_type
- business_category

JANGAN mengarang field:

- category
- slug
- status

kecuali field tersebut benar-benar ada di database.

Cari relationship:

business
→ owner
→ profile

Cari tabel yang benar-benar terkait dengan business.

Jangan mengasumsikan relationship dari nama field saja.

==================================================
2. AUDIT EXISTING FRONTEND
==================================================

Cari implementation yang sudah dibuat.

Expected files jika memang sudah ada:

src/pages/admin/AdminBusinessesPage.jsx
src/pages/admin/AdminBusinessDetailPage.jsx
src/services/adminBusinessService.js

atau lokasi aktual yang digunakan project.

JANGAN membuat file duplicate.

JANGAN membuat service kedua untuk fungsi yang sama.

Pertahankan pattern Stage 1–3.

==================================================
3. BUSINESS LIST
==================================================

Route:

/admin/businesses

Harus menampilkan DATA DATABASE AKTUAL.

Minimum informasi:

- Business
- Business ID
- Owner
- owner identifier yang aman
- business_type jika tersedia
- business_category jika tersedia
- created_at jika tersedia

Tidak boleh ada mock data.

==================================================
4. SEARCH
==================================================

Search harus dilakukan DATABASE-SIDE.

Search minimal terhadap field yang benar-benar tersedia:

- business name
- business ID
- owner

JANGAN:

load seluruh database
→ filter JavaScript.

Gunakan query/RPC database-side.

==================================================
5. FILTER
==================================================

Filter hanya field yang benar-benar tersedia.

Contoh:

business_type
business_category

Jika status business tidak ada di schema:

JANGAN membuat filter status palsu.

==================================================
6. PAGINATION
==================================================

Pagination harus database-side.

JANGAN mengambil semua businesses sekaligus.

Gunakan:

limit
offset/range
atau mekanisme pagination database yang sesuai.

UI harus menampilkan:

- current page
- total jika tersedia
- next/previous

==================================================
7. BUSINESS DETAIL
==================================================

Route:

/admin/businesses/:id

Tampilkan data aktual:

BUSINESS
- name
- id
- type/category jika tersedia
- created/updated jika tersedia

OWNER
- profile information yang aman
- jangan expose credential

SUMMARY

Hanya tampilkan statistik jika sumber datanya benar-benar tersedia.

JANGAN membuat angka dummy seperti:

"120 orders"
"Rp 20 juta"
"50 products"

jika tidak berasal dari database.

==================================================
8. SECURITY
==================================================

Admin route harus tetap memakai:

RequireAuth
→ RequireAdmin
→ AdminLayout

atau equivalent architecture yang sudah digunakan Stage 1–3.

Jangan membuat authorization baru yang bertentangan dengan existing RBAC.

Test:

NORMAL USER
→ /admin/businesses DENIED

ADMIN
→ ALLOWED

SUPER_ADMIN
→ ALLOWED

==================================================
9. IDOR / BUSINESS ID MANIPULATION
==================================================

WAJIB audit.

User biasa tidak boleh mengakses:

/admin/businesses/{business-id}

hanya dengan mengganti UUID.

Direct API/RPC juga harus ditolak untuk non-admin.

Test:

Business A
Business B

Manipulasi:

business_id = B

Expected:

non-admin → DENIED

admin → sesuai permission admin.

Jangan hanya test React routing.

==================================================
10. DATA LEAKAGE
==================================================

Pastikan business detail/list tidak membocorkan:

- password
- auth secret
- access token
- refresh token
- service role key
- payment secret
- API key
- credential sensitif

Jangan query auth.users langsung dari browser.

Gunakan data profile yang memang sudah tersedia untuk kebutuhan admin.

==================================================
11. ACTIONS
==================================================

Audit apakah Stage 4 memang memiliki business actions.

JANGAN menambahkan action hanya supaya UI terlihat lengkap.

Kalau schema belum mendukung:

- suspend business
- restore business
- delete business

maka jangan implementasikan fake action.

Hard delete:

JANGAN IMPLEMENT.

Kalau ada destructive action yang memang sudah didukung:

- confirmation
- server-side authorization
- reason bila diperlukan
- audit log bila mekanismenya tersedia

==================================================
12. ERROR HANDLING
==================================================

UI harus punya:

Loading
→ skeleton

Empty
→ "Belum ada bisnis"

Error
→ pesan aman + Retry

Invalid business ID
→ not found state

Jangan tampilkan raw PostgreSQL/PostgREST error ke user.

Gunakan error normalization pattern Stage 3.

==================================================
13. TESTING STRATEGY
==================================================

JANGAN langsung menjalankan seluruh test suite jika diketahui bisa hang.

Pertama:

A. jalankan test Stage 4 secara isolated.

Cari test file yang relevan.

Contoh:

npm test -- admin_businesses

atau command test yang sesuai dengan konfigurasi project.

Jika command tersebut tidak cocok, inspect package.json dan test config terlebih dahulu.

B. jalankan security tests Stage 4.

C. jalankan regression:

Stage 1
Stage 2
Stage 3

D. setelah isolated tests PASS, baru jalankan full suite.

==================================================
14. TEST MINIMUM
==================================================

Harus ada bukti untuk:

1. admin list businesses
2. super admin list businesses
3. normal user denied
4. direct admin route denied for normal user
5. direct RPC denied for normal user
6. valid business detail
7. invalid business ID
8. search
9. filter
10. pagination
11. business ID manipulation
12. cross-business access
13. no sensitive data leakage
14. Stage 1 regression
15. Stage 2 regression
16. Stage 3 regression

Jangan membuat test yang hanya:

expect(component).toBeTruthy()

Test harus memverifikasi behavior/security yang sebenarnya.

==================================================
15. HANG / TIMEOUT RULE
==================================================

Jika test berjalan > 2 menit tanpa progress:

STOP.

Jangan:

sleep berulang
menunggu indefinitely
menganggap PASS

Investigate process.

Cari:

- open Supabase connection
- unresolved Promise
- polling loop
- browser process
- worker
- fake timer
- network request tanpa timeout

Fix root cause jika memang berasal dari Stage 4.

Jika berasal dari pre-existing unrelated test:

JANGAN mengubah test tersebut.

Catat sebagai pre-existing issue.

==================================================
16. MIGRATION RULE
==================================================

065 SUDAH DEPLOYED.

JANGAN edit:

065_admin_business_management.sql

Jika benar-benar membutuhkan DB change:

buat migration berikutnya.

Gunakan nomor migration berikutnya yang belum dipakai.

Sebelum membuat migration:

jelaskan:

- root cause
- mengapa 065 tidak cukup
- exact DB change

Jangan membuat migration hanya untuk UI.

==================================================
17. BUILD / LINT
==================================================

Setelah implementation:

npm run lint
npm run build

Lalu test Stage 4.

Jangan claim PASS jika command gagal.

==================================================
18. FINAL REPORT
==================================================

Output wajib:

STAGE 4 STATUS:
PASS / FAIL / BLOCKED

1. Files inspected
2. Files changed
3. Migration status
4. Routes
5. Database source
6. Search implementation
7. Filter implementation
8. Pagination implementation
9. Detail implementation
10. Authorization
11. IDOR test
12. Data leakage test
13. Stage 1 regression
14. Stage 2 regression
15. Stage 3 regression
16. Stage 4 test count/result
17. Full test count/result
18. Lint result
19. Build result
20. Any pre-existing unrelated issue

Jika test hang:
jelaskan EXACT test yang hang dan root cause.

JANGAN menyebut PASS jika test sebenarnya belum selesai.

==================================================
STOP CONDITION
==================================================

Jika Stage 4 PASS:
STOP.

JANGAN lanjut Stage 5.

Jika BLOCKED:
STOP dan laporkan blocker.

Jika FAIL:
STOP dan laporkan failure + root cause.

JANGAN mengerjakan scope lain.
