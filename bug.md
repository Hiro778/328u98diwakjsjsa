URGENT FIX — QRIS MERCHANT FLOW IS STILL USING MIDTRANS

The previous implementation report claimed the QRIS direct-merchant flow was complete, but LIVE BROWSER UI proves otherwise.

CURRENT ACTUAL STATE:
- Customer checkout still opens Midtrans Snap/payment popup.
- The screenshot shows Midtrans payment methods such as Card Payment, GoPay QRIS, Virtual Account, ShopeePay QRIS.
- Merchant POS UI does not visibly implement the intended direct merchant QRIS workflow.
- The intended merchant-owned QRIS upload/payment flow is not actually reachable from the customer checkout.
- Therefore the previous implementation is NOT accepted as complete.

DO NOT TRUST THE PREVIOUS REPORT.
Audit the ACTUAL RUNTIME CODE PATH used by the browser.

==================================================
TARGET PRODUCT FLOW — THIS IS THE SOURCE OF TRUTH
==================================================

MERCHANT:

1. Merchant opens QR Menu / POS settings.
2. Merchant uploads their own QRIS image.
3. QRIS is stored using the existing private business QRIS infrastructure.
4. Merchant can enable/disable QRIS.
5. This QRIS belongs directly to the merchant.
6. BisnisSehat does NOT receive or hold the QRIS payment.

CUSTOMER:

1. Customer opens published menu.
2. Customer creates order.
3. Customer chooses:

   "QRIS"

4. DO NOT open Midtrans.
5. DO NOT invoke Midtrans Snap.
6. DO NOT show Midtrans payment methods.
7. Show the merchant's uploaded QRIS image.
8. Show order total.
9. Show instruction such as:
   "Scan QRIS ini dan bayar langsung ke merchant."
10. Customer clicks:

   "Saya Sudah Bayar / Lanjut"

11. This MUST NOT set payment_status = paid.
12. Customer enters:

   "Menunggu Konfirmasi Penjual"

MERCHANT POS:

Order appears in:

BARU

Merchant sees:
- order details
- payment status pending / menunggu konfirmasi
- button:

  [ PROSES ]

When merchant clicks PROSES:

SERVER-SIDE ATOMIC RPC:

- verify merchant owns the business
- verify order belongs to merchant business
- verify payment_method = qris
- verify order is still eligible for processing
- atomically:
    payment_status: pending → paid
    order_status: baru → diproses
- create payment settlement record if existing schema requires it
- prevent duplicate payment records
- be concurrency safe
- return normalized result

CUSTOMER REALTIME:

Immediately after merchant clicks PROSES:

MENUNGGU KONFIRMASI PENJUAL
        ↓
DIPROSES

No polling if Supabase Realtime already exists.

WHILE DIPROSES:

Customer sees:
- "Pesanan sedang diproses"
- Chat Penjual button

Merchant sees:
- Chat Pembeli

Chat:
- tied to order_id
- tied to business_id
- RLS tenant isolation
- realtime
- active while processing

MERCHANT:

[ SELESAI ]

Then:

order_status:
diproses → selesai

Customer immediately sees:

"Pesanan Selesai"
"Pesanan telah dikonfirmasi penjual."

Chat becomes read-only/closed.

==================================================
CRITICAL: REMOVE MIDTRANS FROM THIS QRIS PATH
==================================================

Find the EXACT runtime path causing the screenshot.

Search for all:

- createMidtrans
- Midtrans
- Snap
- snap.pay
- payment gateway
- midtrans
- initiatePayment
- createPayment
- payment_method === "online"
- "Bayar Online"

Trace:

PublicMenuPage
→ checkout component
→ payment selection
→ order creation
→ payment handler
→ Midtrans invocation

The current screenshot proves this path still reaches Midtrans.

Fix the actual path.

Do NOT merely create a new unused QRIS component.

The browser's real QRIS selection must reach the merchant QRIS flow.

==================================================
PAYMENT METHOD MODEL
==================================================

Audit the ACTUAL existing payment_method values.

Do NOT invent a new value if an existing QRIS value already exists.

Determine how the current application represents:

- cash
- Midtrans/online
- QRIS
- other payment methods

Then make QRIS explicitly route to:

DIRECT_MERCHANT_QRIS

while preserving existing non-QRIS payment methods unless the product specification explicitly requires their removal.

IMPORTANT:

The requested change is NOT:

"replace all online payment with QRIS."

It is:

"QRIS merchant payment must bypass Midtrans."

If "Bayar Online" currently means Midtrans, do not silently pretend it is merchant QRIS.

The customer-facing payment choice should clearly distinguish:

- Bayar Langsung / Cash
- QRIS Merchant

If Midtrans remains as a separate existing payment method, keep it separate.
If product requirements require Midtrans to be removed entirely from this QR ordering flow, remove it from that specific flow only.

DO NOT break unrelated payment infrastructure.

==================================================
MERCHANT QRIS UPLOAD
==================================================

Audit existing:

business_payment_settings
qrisPaymentService.js
BusinessQrisSettings
business-assets bucket
signed URL logic

Reuse the existing implementation.

Do NOT create another QRIS table.

Verify:

business_id
qris_image_url
qris_enabled

Merchant UI must expose:

QRIS Pembayaran
[Upload QRIS]
[Change QRIS]
[Delete QRIS]
ON/OFF

Rules:
- cannot enable QRIS without an image
- private storage
- signed URL
- tenant isolation
- only business owner can mutate

Most importantly:

Verify this UI is actually reachable from the merchant application.

==================================================
CUSTOMER QRIS UI
==================================================

In the actual public menu checkout:

When payment method = QRIS:

SHOW:

--------------------------------
Pembayaran QRIS

Total
Rp XX.XXX

Scan QRIS di bawah untuk membayar
langsung ke merchant.

[ QRIS IMAGE ]

Setelah pembayaran berhasil:

[ SAYA SUDAH BAYAR / LANJUT ]

--------------------------------

DO NOT SHOW:

- Midtrans Snap
- Card Payment
- Virtual Account
- GoPay QRIS from Midtrans
- ShopeePay
- bank transfer generated by Midtrans
- Midtrans payment countdown
- Midtrans payment popup

The QR image must come from the selected merchant's
business_payment_settings.

==================================================
ORDER CREATION
==================================================

When customer chooses merchant QRIS:

create_public_order(
  payment_method = existing QRIS value
)

Payment status must remain:

pending

Customer confirmation button must NOT execute:

payment_status = paid

Customer cannot directly update payment status.

==================================================
POS
==================================================

Audit actual PosPage.jsx runtime.

Required tabs:

SEMUA
BARU
DIPROSES
SELESAI

NO:

SIAP

Required actions:

BARU:
[ PROSES ]

DIPROSES:
[ CHAT PEMBELI ]
[ SELESAI ]

SELESAI:
no processing action

Verify actual rendered browser UI, not just unit tests.

==================================================
REALTIME
==================================================

Use existing Supabase Realtime implementation.

Verify:

1. Customer opens order status.
2. Merchant opens POS.
3. Merchant clicks PROSES.
4. Customer UI changes automatically to DIPROSES.
5. Merchant/customer chat updates live.
6. Merchant clicks SELESAI.
7. Customer UI changes automatically to SELESAI.

No manual refresh.

No polling unless existing architecture absolutely requires it.

==================================================
DATABASE / MIGRATION COLLISION
==================================================

IMPORTANT:

Previous reports show BOTH:

079_admin_audit_logs_management.sql
079_order_processing_and_chat.sql

Audit migration numbering immediately.

Supabase migration versions must not collide.

Determine current:

npx supabase migration list

and:

ls supabase/migrations

If both 079 migrations exist, resolve the collision safely using the next unused migration version.

Do NOT modify already-applied migration history destructively.

Ensure:

LOCAL = REMOTE

after deployment.

==================================================
TESTS
==================================================

Create/update tests that test the ACTUAL behavior.

Mandatory:

1. QRIS merchant settings exists
2. merchant can upload QRIS
3. merchant QRIS persists
4. customer can retrieve enabled merchant QRIS
5. QRIS checkout does NOT invoke Midtrans
6. QRIS checkout creates pending payment
7. customer cannot mark payment paid
8. merchant PROSES order
9. PROSES atomically sets:
   pending → paid
   baru → diproses
10. duplicate PROSES is idempotent/safe
11. customer receives realtime DIPROSES
12. chat works during processing
13. customer cannot access another business order chat
14. merchant cannot access another business order chat
15. SELESAI changes diproses → selesai
16. customer receives realtime SELESAI
17. chat closes after completion
18. SIAP does not exist in runtime workflow

==================================================
BROWSER E2E — MANDATORY
==================================================

This is critical.

Do NOT report PASS based only on unit tests.

Actually run the browser/runtime flow.

Verify:

CUSTOMER:
public menu
→ checkout
→ select QRIS
→ merchant QRIS image appears
→ NO MIDTRANS
→ click "Saya Sudah Bayar / Lanjut"
→ Menunggu Konfirmasi Penjual

MERCHANT:
POS
→ BARU
→ click PROSES

CUSTOMER:
→ automatically DIPROSES

MERCHANT:
→ chat customer
→ click SELESAI

CUSTOMER:
→ automatically SELESAI

Take/inspect runtime evidence where appropriate.

If browser still opens Midtrans, STATUS MUST BE FAIL.

==================================================
REGRESSION
==================================================

Run:

- QRIS Phase 1–4 tests
- new QRIS merchant-flow tests
- POS tests
- order chat tests
- admin Stage 1–9 tests
- full npm test
- npm run lint
- npm run build

Do not alter unrelated functionality.

==================================================
STRICT SCOPE LOCK
==================================================

Allowed:
- QRIS merchant upload UI
- QRIS customer checkout flow
- payment method routing
- POS order processing
- order status transitions
- order chat
- required RPC/RLS/migration
- realtime
- tests
- migration numbering fix if required

Forbidden:
- Admin Settings
- Admin RBAC changes
- Subscription changes
- Payment architecture unrelated to QRIS
- Creative Studio
- PRD
- Inventory
- unrelated UI redesign
- fake/mock QRIS
- fake payment confirmation
- automatic payment verification API

IMPORTANT:
Do NOT claim the task is complete merely because database RPC tests pass.

The acceptance criterion is the ACTUAL BROWSER FLOW.

==================================================
FINAL REPORT
==================================================

Report:

1. Exact reason Midtrans was still opening
2. Exact runtime file/function causing it
3. Exact fix
4. Merchant QRIS upload location
5. Customer QRIS checkout location
6. Confirmation that Midtrans is NOT invoked for QRIS
7. Payment state transitions
8. Order state transitions
9. Realtime behavior
10. Chat behavior
11. Migration collision resolution
12. DB/RLS/RPC changes
13. Browser E2E result
14. Unit tests
15. Regression tests
16. lint
17. build
18. Any remaining limitations

If the browser still opens Midtrans for QRIS:
STATUS = FAIL

Do not stop at "tests pass".
STOP only after actual runtime verification.
