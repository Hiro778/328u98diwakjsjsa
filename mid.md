IMPLEMENT ONLY — REMOVE MIDTRANS FROM CURRENT SUBSCRIPTION PURCHASE FLOW

Context:
BisnisSehat sekarang SUDAH TIDAK menggunakan Midtrans untuk pembelian
subscription.

CURRENT BUSINESS FLOW:

Customer
→ melakukan pembayaran manual kepada owner
→ admin memverifikasi pembayaran
→ admin membuat kode aktivasi resmi
→ customer memasukkan kode aktivasi
→ subscription Pro diaktifkan secara server-side

Activation-code flow adalah SATU-SATUNYA flow pembelian Pro yang
ditampilkan ke customer.

Screenshot production saat ini masih menunjukkan:

"Pembayaran online instan via Midtrans (QRIS, E-Wallet, Transfer Bank)."

dan tombol:

"Menghubungkan Midtrans..."

Ini harus dihapus.

==================================================
1. AUDIT FIRST — DO NOT MODIFY YET
==================================================

Audit seluruh penggunaan Midtrans terkait subscription purchase:

Search:

Midtrans
midtrans
createMidtrans
midtrans-subscription-snap
midtrans-notification
payment_provider
provider_transaction_id
midtrans_order_id
payment_status
transaction_status
subscription payment
checkout
Snap

Periksa:

- PricingPage.jsx
- PricingExperience.jsx
- subscriptionService.js
- AdminSubscriptionsPage.jsx
- payment services
- Supabase Edge Functions
- database RPCs
- subscription payment tables
- activation-code flow
- admin verification flow

BEDAKAN:

A. CUSTOMER SUBSCRIPTION PURCHASE FLOW
B. LEGACY PAYMENT DATA
C. ADMIN PAYMENT HISTORY
D. MIDTRANS WEBHOOK INFRASTRUCTURE
E. UNRELATED PAYMENT LOGIC

==================================================
2. CUSTOMER PRICING UI
==================================================

Hapus seluruh customer-facing Midtrans messaging dari pricing.

JANGAN tampilkan:

- Midtrans
- QRIS melalui Midtrans
- E-Wallet melalui Midtrans
- Transfer Bank melalui Midtrans
- "Menghubungkan Midtrans..."
- "Bayar via Midtrans"
- Snap checkout
- loading state Midtrans
- error Midtrans

Jangan tinggalkan tombol yang ketika diklik masih mencoba memanggil
Midtrans.

==================================================
3. PRO Rp130.000
==================================================

Pro Rp130.000/bulan sekarang menggunakan:

KODE AKTIVASI

Pricing card harus menjelaskan flow yang sebenarnya.

Customer harus diarahkan ke activation-code flow yang SUDAH ADA.

Contoh konsep:

"Rp130.000 / bulan"

"Pembayaran diverifikasi manual oleh admin"

"Kode aktivasi resmi diberikan setelah pembayaran diverifikasi"

[Masukkan Kode Aktivasi]

Gunakan existing UI/route/service activation code.

JANGAN membuat activation system kedua.

==================================================
4. BASIC Rp35.000
==================================================

JANGAN mengubah Rp35.000 atau entitlement Basic tanpa audit.

Cari tahu apakah Basic juga sudah menggunakan activation code atau
memiliki purchase flow lain.

Jika Basic saat ini menggunakan activation code:
- pertahankan activation flow tersebut
- hapus hanya referensi Midtrans

Jika Basic tidak menggunakan activation code:
- JANGAN mengubah flow-nya dalam task ini
- report apa flow aktualnya

JANGAN mengarang behavior.

==================================================
5. ACTIVATION CODE MUST REMAIN SECURE
==================================================

Pastikan existing activation flow tetap:

- server-side validation
- token/code tidak menentukan sendiri nominal kredit/subscription
- user tidak dapat mengubah plan/price melalui frontend
- expiration sesuai implementasi existing
- one-time use jika memang existing design
- atomic redemption
- tidak dapat dipakai dua kali melalui race condition
- business/profile binding tetap benar
- audit tetap ada

JANGAN memindahkan entitlement logic ke client.

==================================================
6. REMOVE CUSTOMER-SIDE MIDTRANS CALLS
==================================================

Customer-facing React code TIDAK BOLEH lagi memanggil:

- Midtrans Snap
- midtrans subscription checkout
- midtrans subscription-snap Edge Function
- endpoint payment creation Midtrans

Search seluruh src/ untuk memastikan.

Expected:

Pricing → Activation Code

bukan:

Pricing → Midtrans

==================================================
7. DO NOT BLINDLY DELETE LEGACY BACKEND
==================================================

PENTING:

Jangan langsung menghapus:

supabase/functions/midtrans-notification/
supabase/functions/midtrans-subscription-snap/

sebelum audit dependency.

Jika endpoint tersebut hanya legacy dan benar-benar tidak digunakan
oleh flow aktif:
- tandai sebagai legacy/deprecated
- jangan hapus database payment history
- jangan hapus historical subscription payment records

Jika ada dependency aktif:
- jangan rusak
- report dependency tersebut

Goal task ini adalah:
NO ACTIVE CUSTOMER PURCHASE PATH THROUGH MIDTRANS.

Bukan:
"hapus semua kata Midtrans dari repository."

==================================================
8. DATABASE / PAYMENT HISTORY
==================================================

Jangan drop:

subscription_payments

Jangan menghapus historical payment records.

Jangan mengubah subscription schema kecuali benar-benar diperlukan.

Historical Midtrans payment data harus tetap bisa dibaca admin jika
memang digunakan untuk audit/history.

New subscription activation melalui kode harus menggunakan existing
subscription/entitlement architecture.

==================================================
9. ADMIN SIDE
==================================================

Admin tetap membutuhkan kemampuan:

- melihat subscription
- memverifikasi pembayaran manual sesuai existing flow
- membuat/generate activation code
- melihat activation status
- melihat audit

Jangan menghilangkan Admin Subscription functionality.

Pastikan admin tidak lagi diarahkan ke Midtrans untuk aktivasi manual.

==================================================
10. SEARCH FOR DEAD REFERENCES
==================================================

After implementation:

Search:

grep -Rni "midtrans" src supabase/functions

Classify every remaining occurrence:

1. ACTIVE CUSTOMER CHECKOUT
2. LEGACY BACKEND
3. HISTORICAL PAYMENT DATA
4. DOCUMENTATION
5. SECURITY/TEST
6. UNUSED DEAD CODE

There MUST be:

ACTIVE CUSTOMER CHECKOUT = ZERO

Do not require repository-wide Midtrans references to be zero because
historical/backend compatibility may intentionally remain.

==================================================
11. TESTS
==================================================

Create/update focused tests.

A. Pricing:

- Pro card renders Rp130.000
- no Midtrans checkout UI
- no "Menghubungkan Midtrans..."
- activation-code CTA works

B. Activation:

- valid activation code works
- invalid code rejected
- expired code rejected
- used code rejected
- user cannot alter plan/price
- duplicate concurrent redemption rejected safely

C. Midtrans:

- pricing page does NOT invoke Midtrans
- Pro purchase does NOT call Midtrans
- no customer-side Snap initialization
- no customer-side midtrans subscription request

D. Existing security:

- entitlement remains server-side
- normal user cannot grant Pro through client manipulation
- cross-user activation abuse rejected

==================================================
12. BUILD
==================================================

Run:

npm test
npm run build
npm run lint

Run focused activation/subscription/security tests too.

Do NOT fix unrelated legacy test failures in this task.

==================================================
13. PRODUCTION BUNDLE CHECK
==================================================

After build, inspect production bundle for active customer checkout
references.

It is acceptable for backend legacy strings to exist outside the
customer bundle.

But the customer pricing bundle must not initialize or invoke Midtrans.

==================================================
14. SCOPE LOCK
==================================================

DO NOT:

- change Rp130.000
- change Rp35.000
- redesign pricing
- create another activation system
- create another subscription system
- delete subscription_payments
- delete historical payment records
- weaken RLS
- weaken entitlement checks
- modify admin RBAC
- modify maintenance mode
- modify QRIS order/payment security unrelated to subscription purchase
- add another payment gateway
- add new database tables unless absolutely required by existing
  activation architecture

Use the existing activation-code system.

==================================================
FINAL REPORT
==================================================

Report:

1. MIDTRANS CUSTOMER CHECKOUT — REMOVED/PRESENT
2. PRO Rp130.000 FLOW — ACTIVATION CODE/PRESENT OTHER FLOW
3. BASIC Rp35.000 FLOW — ACTUAL CURRENT FLOW
4. ACTIVATION SYSTEM — PRESERVED/CHANGED
5. CUSTOMER MIDTRANS REFERENCES — COUNT
6. LEGACY MIDTRANS BACKEND — WHAT REMAINS AND WHY
7. HISTORICAL PAYMENT DATA — PRESERVED
8. SECURITY TESTS
9. npm test
10. npm run build
11. npm run lint
12. FILES CHANGED
13. ANY REMAINING LIMITATION

STOP AFTER THIS TASK.
