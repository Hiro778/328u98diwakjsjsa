IMPLEMENT SECURITY FIX — STEP 2 ONLY
BisnisSehat — Subscription / Credit / RPC Hardening

TUJUAN
Remediasi 6 finding security yang secara eksplisit ditunda dari SECURITY FIX — STEP 1.

JANGAN mengerjakan fitur lain.
JANGAN mengubah UI pricing.
JANGAN mengubah manual activation-code / credit activation flow kecuali diperlukan untuk memperbaiki finding yang memang terkait.
JANGAN mengintegrasikan OpenSEO, Chatwoot, atau AI Video.
JANGAN melakukan refactor besar.

==================================================
SCOPE WAJIB
==================================================

1. LEGACY DEFAULT 'pro'
2. SUBSCRIPTION CANCELLATION STATE
3. BASIC verify_payment AMOUNT BUG
4. CREDIT_LEDGER IDEMPOTENCY
5. CROSS-USER SUBSCRIPTION RPC PROBING
6. BASIC CANCELLATION PATH

==================================================
PHASE 0 — AUDIT DULU
==================================================

Sebelum mengubah kode:

- Audit schema subscriptions.
- Audit seluruh migration yang membuat/alter subscriptions.
- Audit verify_payment / payment RPC terkait.
- Audit cancel_subscription / cancellation RPC.
- Audit get_user_active_plan / is_user_pro_active / is_user_subscription_active.
- Audit credit_ledger schema + seluruh INSERT path.
- Audit manual PRO activation dan credit activation.
- Audit semua caller dari RPC yang akan diubah.

PENTING:

Current production payment model adalah:

Customer
→ WhatsApp owner
→ transfer manual
→ admin verify
→ admin generate activation code/link
→ customer redeem

JANGAN menganggap Midtrans sebagai primary payment flow.

Manual activation security yang sudah ada harus tetap bekerja.

==================================================
1. FIX LEGACY DEFAULT 'pro'
==================================================

Cari semua schema/migration yang memiliki:

DEFAULT 'pro'

atau default plan yang dapat menyebabkan user baru menjadi Pro tanpa entitlement valid.

Target:

- User baru tidak boleh otomatis menjadi Pro.
- Default plan harus aman sesuai arsitektur existing.
- Jangan mengubah existing active Pro entitlement secara massal.
- Jangan melakukan destructive data migration tanpa bukti diperlukan.

Jika subscriptions.plan memang harus memiliki default:

gunakan default yang paling aman berdasarkan existing schema/business logic.

Audit existing INSERT paths agar tidak ada caller yang bergantung pada
DEFAULT 'pro' secara tidak sengaja.

TEST:

- INSERT subscription tanpa explicit plan tidak menghasilkan unauthorized Pro.
- Existing valid Pro tetap valid.
- Manual activation PRO tetap menghasilkan Pro.
- Basic tetap Basic.

==================================================
2. FIX SUBSCRIPTION CANCELLATION STATE
==================================================

Audit cancellation implementation.

Finding:

Cancellation dapat meninggalkan:

status = active

sementara cancellation state ditandai terpisah.

Perbaiki agar canonical entitlement state konsisten.

Requirement:

- Cancelled subscription tidak boleh dianggap active oleh entitlement.
- expires_at tetap dihormati.
- Jangan langsung mematikan akses jika business rule existing memang memberikan akses sampai expiry.
- Jangan merusak manual activation.
- UI dan server-side entitlement harus membaca state yang sama.

JANGAN hanya memperbaiki frontend.

Server-side entitlement adalah authority.

TEST:

A. Active Pro → entitlement valid.
B. Cancelled Pro → sesuai business rule existing tidak dianggap active setelah cancellation state efektif.
C. Expired Pro → denied.
D. Manual activated Pro → tetap valid.
E. Tidak ada state contradiction yang membuat cancelled subscription lolos isProUser().

==================================================
3. FIX BASIC verify_payment AMOUNT BUG
==================================================

Audit verify_payment dan seluruh payment verification logic.

Finding dari audit:

Basic package memiliki bug perbedaan nominal/minimum amount.

Requirement:

- Basic harus menggunakan harga Basic yang canonical.
- Pro harus menggunakan harga Pro yang canonical.
- Jangan menerima amount yang lebih rendah dari harga package.
- Jangan gunakan hardcoded minimum yang menyebabkan Basic/Pro salah validasi.
- Jangan percaya plan/amount dari client.
- Server menentukan package dan expected amount.

CURRENT BUSINESS PRICING:

Basic = Rp35.000/month
Pro = Rp130.000/month

Namun JANGAN mengubah pricing architecture lain.

IMPORTANT:

Karena payment sekarang manual activation, jangan membuat Midtrans menjadi primary flow.

Jika verify_payment adalah legacy path:
- harden sesuai existing behavior,
- jangan menjadikannya jalur pembayaran baru.

TEST:

- Basic 35.000 → valid sesuai flow legacy.
- Basic <35.000 → reject.
- Pro 130.000 → valid sesuai flow legacy.
- Pro <130.000 → reject.
- forged plan/amount → reject.
- manual activation flow tetap PASS.

==================================================
4. CREDIT_LEDGER IDEMPOTENCY
==================================================

Finding:

credit_ledger.idempotency_key belum memiliki UNIQUE constraint.

Audit SEMUA credit grant path.

Target:

Tidak boleh ada race condition yang menyebabkan satu activation/payment/request
memberikan credit dua kali.

Implementasikan database-level idempotency.

Requirement:

- UNIQUE constraint/index pada idempotency key jika schema memungkinkan.
- Jangan membuat constraint yang bentrok dengan existing historical rows.
- Audit existing duplicate values terlebih dahulu.
- Jika duplicate historical data ditemukan:
  STOP sebelum destructive cleanup.
  Report jumlah + contoh ID/key dan minta keputusan.

Untuk manual credit activation:

redeem_credit_activation harus tetap atomic:

lock activation
→ validate status/expiry
→ lock credit balance
→ grant credit
→ ledger insert
→ mark activation USED

Jika salah satu gagal:
ROLLBACK seluruh transaction.

TEST CONCURRENCY:

Simulasikan 2 redemption request secara bersamaan dengan token yang sama.

Expected:

- maksimal 1 sukses
- maksimal 1 credit grant
- maksimal 1 ledger entry
- activation menjadi USED
- tidak ada double credit.

==================================================
5. FIX CROSS-USER SUBSCRIPTION RPC PROBING
==================================================

Finding:

RPC seperti:

get_user_active_plan
is_user_pro_active
is_user_subscription_active

berpotensi menerima arbitrary UUID sehingga user A dapat probing status user B.

Requirement:

Normal authenticated user:

- hanya boleh query dirinya sendiri.
- jangan percaya arbitrary user_id dari client.

Pilihan implementasi:

A. Hilangkan parameter user_id dan gunakan auth.uid()

ATAU

B. Jika parameter tetap diperlukan untuk internal/admin:

- enforce auth.uid() == requested user_id
- atau enforce explicit admin authorization.

JANGAN mengubah admin legitimate access.

Anonymous:

- tidak boleh mendapatkan subscription state user.

Security requirement:

Client tidak boleh melakukan:

user A JWT
+ user B UUID
→ mendapatkan status subscription user B.

TEST:

- User A → own subscription = allowed.
- User A → User B UUID = denied.
- User B → own subscription = allowed.
- Anonymous → denied.
- Admin → hanya jika memang dibutuhkan oleh existing admin flow.
- IDOR via direct RPC call = denied.

==================================================
6. BASIC CANCELLATION PATH
==================================================

Finding:

Existing cancellation path hanya menangani Pro.

Audit:

- UI caller
- RPC
- subscription status transition
- entitlement
- admin cancellation
- user self-cancellation

Requirement:

Basic cancellation harus punya behavior yang konsisten dengan existing
subscription state machine.

Jangan menghapus subscription secara hard delete.

Gunakan state transition yang existing architecture gunakan.

Pastikan:

- Basic active → cancel menghasilkan canonical cancelled state.
- Basic cancelled tidak dianggap active.
- Tidak dapat cancel subscription milik user lain.
- User tidak dapat memanipulasi profile_id/business_id.
- Admin flow tetap bekerja.
- Pro cancellation tetap bekerja.
- Manual activation redemption tetap bekerja.

==================================================
7. MANUAL ACTIVATION REGRESSION
==================================================

WAJIB regression terhadap current payment architecture.

PRO:

admin_generate_pro_activation_code
→ redeem_pro_activation_code
→ subscriptions = PRO active
→ entitlement = Pro

CREDIT:

admin_generate_credit_activation
→ redeem_credit_activation
→ creative_credits increment
→ credit_ledger exactly once
→ activation USED

Jangan mengganti flow ini dengan Midtrans.

==================================================
8. SECURITY REQUIREMENTS
==================================================

Semua RPC sensitif harus tetap:

- SECURITY DEFINER jika memang diperlukan
- SET search_path=''
- auth.uid() based authorization
- REVOKE public/anon EXECUTE jika sesuai existing security model

Tidak boleh:

- trust client plan
- trust client user_id
- trust client business_id
- trust client entitlement
- trust client amount untuk authorization
- expose raw DB/security errors
- leak another user's subscription status

==================================================
9. TEST SUITE
==================================================

Buat/extend targeted test:

securityStep2SubscriptionHardening.test.js

Minimal test:

1. no unauthorized default Pro
2. active Pro entitlement
3. cancelled Pro
4. expired Pro
5. Basic verification amount
6. Pro verification amount
7. forged payment amount
8. forged plan
9. credit ledger duplicate prevention
10. concurrent credit redemption
11. User A → User B RPC probing denied
12. anonymous RPC denied
13. Basic cancellation
14. Pro cancellation
15. manual Pro activation regression
16. manual credit activation regression
17. cross-business isolation
18. admin legitimate access

Tambahkan adversarial tests jika ditemukan attack surface tambahan.

==================================================
10. REGRESSION
==================================================

Run:

npm test

Target existing security suites harus tetap PASS.

Run:

npm run build

Build wajib PASS.

Jika ada failure lama yang unrelated:

JANGAN mengubah test hanya agar PASS.

Report:

- test name
- failure
- apakah pre-existing atau regression
- file yang menyebabkan failure

==================================================
11. DATABASE MIGRATION SAFETY
==================================================

Jika migration diperlukan:

buat migration baru.

JANGAN edit migration production yang sudah applied.

Sebelum UNIQUE credit_ledger:

audit duplicate idempotency_key.

Jika duplicate ditemukan:

STOP pada bagian migration tersebut dan report.

JANGAN DELETE data otomatis.

==================================================
12. SCOPE LOCK
==================================================

DILARANG:

- Pricing UI redesign
- WhatsApp CTA
- Midtrans migration
- OpenSEO
- Chatwoot
- AI Video
- Admin Settings
- Maintenance Mode
- Mobile responsive fixes
- POS
- BEP
- Cash Flow
- Loan Simulation
- Creative Studio redesign
- Marketplace feature redesign
- unrelated database cleanup

==================================================
FINAL REPORT
==================================================

Report harus berisi:

1. Finding yang diperbaiki
2. Files changed
3. Migration yang dibuat
4. RPC yang changed
5. Security behavior before/after
6. Manual activation regression
7. Credit concurrency result
8. Cross-user probing result
9. Test result
10. npm test result
11. npm run build result
12. Remaining findings

STOP setelah Step 2.

JANGAN lanjut Step 3 atau integrasi third-party.
