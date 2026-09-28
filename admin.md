Buat dan implementasikan SISTEM SUPER ADMIN / ADMIN CONTROL CENTER lengkap untuk BisnisSehat.

JANGAN sekadar membuat halaman admin biasa.

Admin ini adalah INTERNAL CONTROL CENTER untuk owner/operator BisnisSehat yang memiliki kontrol penuh terhadap user, business, subscription, AI usage, support, payment, dan audit.

============================================================
0. ATURAN PALING PENTING
============================================================

WAJIB:

- Jangan merusak fitur existing.
- Jangan mengubah behavior user-facing yang tidak berkaitan.
- Jangan mengubah PRD provider.
- PRD tetap menggunakan Gemini.
- Veo 3 untuk PRD tetap Gemini sesuai implementasi existing.
- Atlas Cloud tetap backend future video provider.
- Generate Video public tetap COMING SOON.
- Jangan membuka Generate Video ke public.
- Jangan memindahkan secret/API key ke frontend.
- Jangan menggunakan service_role di browser.
- Jangan membuat admin hanya dengan hidden frontend route.
- Semua permission admin wajib diverifikasi server-side.
- Semua tindakan admin sensitif wajib masuk audit log.
- Jangan menghapus histori pembayaran ketika subscription dicabut.
- Jangan melakukan destructive migration tanpa audit dependency terlebih dahulu.
- Jangan hardcode user ID admin di frontend.
- Jangan membuat bypass RLS hanya untuk mempermudah UI.

Sebelum coding:
1. Audit struktur auth existing.
2. Audit profiles/users/businesses.
3. Audit subscription/entitlement.
4. Audit AI credits/token usage.
5. Audit support yang sudah ada.
6. Audit payment/Midtrans.
7. Audit existing RLS.
8. Audit Edge Functions.
9. Reuse service/function existing jika aman.
10. Jangan membuat duplicate system jika functionality sudah tersedia.

============================================================
1. ADMIN ACCESS CONTROL
============================================================

Buat sistem role internal.

Minimal:

USER
ADMIN
SUPER_ADMIN

Jangan menentukan admin berdasarkan:
- email frontend
- localStorage
- React state
- URL
- hidden menu

Permission harus diverifikasi server-side.

Contoh permission:

users.read
users.suspend
users.ban
users.delete

subscriptions.read
subscriptions.modify
subscriptions.cancel

ai_usage.read
ai_credits.adjust

support.read
support.manage

payments.read

audit_logs.read

settings.manage

super_admin.*

SUPER_ADMIN memiliki seluruh permission.

ADMIN memiliki permission yang ditentukan.

Semua action sensitif harus melalui server-side authorization.

============================================================
2. ADMIN ROUTE
============================================================

Buat:

/admin

dan:

/admin/users
/admin/users/:id

/admin/businesses
/admin/businesses/:id

/admin/subscriptions

/admin/ai-usage
/admin/ai-usage/:userId

/admin/support
/admin/support/:ticketId

/admin/payments

/admin/audit-logs

/admin/settings

Jika user bukan admin:

→ jangan render admin UI
→ server-side request juga harus ditolak

Gunakan status HTTP yang tepat untuk unauthorized/forbidden.

============================================================
3. ADMIN DASHBOARD OVERVIEW
============================================================

Dashboard:

/admin

Tampilkan real-time/near-real-time summary.

Cards:

TOTAL USERS
ACTIVE USERS
SUSPENDED USERS
BANNED USERS

FREE USERS
PRO USERS

ACTIVE BUSINESSES

AI CREDITS USED
AI CREDITS REMAINING

AI REQUESTS TODAY

SUPPORT TICKETS
- New
- In Progress
- Waiting User
- Resolved

PAYMENTS
- Today
- This Month

SUBSCRIPTION REVENUE

Jika data tidak tersedia:
jangan membuat angka palsu.

Gunakan actual database data.

============================================================
4. USER MANAGEMENT
============================================================

/admin/users

Table:

ID
User
Email
Business
Plan
Status
AI Usage
Created
Last Active
Actions

Search:

- name
- email
- user ID
- business name

Filter:

- All
- Free
- Pro
- Active
- Suspended
- Banned

Sort:

- newest
- oldest
- highest AI usage
- latest activity

============================================================
5. USER DETAIL
============================================================

/admin/users/:id

Tampilkan:

PROFILE

Name
Email
User ID
Created At
Last Active

BUSINESS

Business Name
Business ID
Business Type
Business Status

SUBSCRIPTION

Plan
Status
Start Date
Expiry Date
Payment Status

AI USAGE

Total Credits
Used Credits
Remaining Credits

Total Tokens
Input Tokens
Output Tokens

Requests
Successful
Failed

SUPPORT

Total Tickets
Open Tickets
Resolved Tickets

SECURITY

Account Status
Last Login
Relevant Security Events

============================================================
6. ADMIN USER ACTIONS
============================================================

Admin dapat:

SUSPEND USER

UNSUSPEND USER

BAN USER

UNBAN USER

REMOVE SUBSCRIPTION

RESTORE SUBSCRIPTION

ADJUST AI CREDITS

VIEW USER

DELETE USER

Semua action sensitif:

→ confirmation modal
→ tampilkan target
→ tampilkan konsekuensi
→ wajib alasan untuk action berisiko
→ audit log

Contoh:

"Ban user ppp?"

Target:
ppp
email@example.com

Reason:
[................................]

[Cancel]
[Confirm Ban]

============================================================
7. SUSPEND
============================================================

Suspend:

- user tidak dapat menggunakan aplikasi sesuai policy existing
- data tidak dihapus
- subscription history tidak dihapus
- support history tidak dihapus
- dapat di-unsuspend

Jangan menghapus user.

============================================================
8. BAN
============================================================

Ban lebih kuat daripada suspend.

Pastikan backend memeriksa account status.

Jangan hanya menyembunyikan UI.

Pertimbangkan:

- revoke active sessions jika mekanisme tersedia
- block authenticated operations
- block protected Edge Functions
- block protected RPC calls

UNBAN harus memulihkan status dengan aman.

============================================================
9. DELETE USER
============================================================

Ini ACTION PALING BERBAHAYA.

Jangan langsung hard delete.

Gunakan:

soft delete / deactivation

kecuali existing architecture memang memiliki deletion flow yang aman.

Sebelum implement:

audit semua foreign key:

profiles
businesses
orders
products
subscriptions
payments
AI usage
credits
support tickets
storage
OAuth connections
notifications
audit logs

Jangan sampai delete user menyebabkan:
- orphan data
- kehilangan payment history
- RLS bypass
- foreign key corruption

Jika hard delete tidak aman:
gunakan soft-delete.

============================================================
10. SUBSCRIPTION CONTROL
============================================================

/admin/subscriptions

Table:

User
Business
Plan
Status
Started
Expires
Payment Status
Actions

Filter:

Free
Pro
Active
Expired
Cancelled
Pending

Admin dapat:

VIEW

CANCEL

REMOVE ENTITLEMENT

RESTORE

Tidak boleh mengubah histori payment.

Contoh:

Subscription:
PRO

Payment:
PAID

Entitlement:
ACTIVE

Jika admin remove subscription:

Payment history tetap ada.

Hanya entitlement yang berubah.

Semua perubahan dicatat audit log.

============================================================
11. AI USAGE CENTER
============================================================

Buat seperti AI provider usage dashboard.

Route:

/admin/ai-usage

Tujuannya:
admin bisa melihat penggunaan AI setiap user/business.

JANGAN hanya tampilkan internal credit.

Pisahkan:

1. PROVIDER TOKEN USAGE
2. INTERNAL CREDIT USAGE
3. PROVIDER COST

============================================================
12. AI USAGE TABLE
============================================================

Table:

User
Business
Tool
Provider
Model
Input Tokens
Output Tokens
Total Tokens
Credits Used
Estimated Cost
Requests
Last Used

Contoh:

ppp
Hazzeon
Marketing Copy
Gemini
gemini-...
12,400
4,800
17,200
20 credits
Rp...
6
23:12

============================================================
13. AI USAGE FILTER
============================================================

Filter:

Today
7 Days
30 Days
Custom Range

By:

User
Business
Tool
Provider
Model
Status

Search:

email
user ID
business
request ID

============================================================
14. USER AI DETAIL
============================================================

/admin/ai-usage/:userId

Tampilkan:

AI USAGE — USER

Credits

Allocated
Used
Remaining

TOKENS

Input Tokens
Output Tokens
Total Tokens

REQUESTS

Total
Successful
Failed

BREAKDOWN:

Marketing Copy
PRD
Vision
Other AI tools

CHART:

Usage by day

Token usage by model

Credit usage by tool

Jangan membuat chart jika data tidak cukup.

============================================================
15. AI CREDIT CONTROL
============================================================

Admin dapat:

ADD CREDITS

REMOVE CREDITS

RESET CREDITS

Setiap adjustment:

amount
reason
admin_id
target_user_id
target_business_id
created_at

Jangan update saldo dengan frontend arithmetic.

Gunakan atomic database operation.

Contoh:

credit adjustment:

+500 credits

Reason:
"Customer support compensation"

WAJIB audit log.

============================================================
16. AI REQUEST LOG
============================================================

Jika architecture memungkinkan, simpan setiap AI request:

request_id
user_id
business_id
tool
provider
model
input_tokens
output_tokens
total_tokens
credit_cost
estimated_provider_cost
status
error_code
created_at
completed_at

Jangan simpan prompt sensitif lebih lama dari kebutuhan.

API key/provider secret JANGAN pernah masuk database/frontend
dalam bentuk yang tidak aman.

============================================================
17. AI COST ANALYTICS
============================================================

Tampilkan:

Total tokens
Total estimated provider cost
Cost by model
Cost by tool
Cost by user
Cost by business

Contoh:

GEMINI
Marketing Copy
120K tokens
Rp XX

PRD
80K tokens
Rp XX

Vision
50K tokens
Rp XX

Gunakan data aktual.

Jangan membuat angka contoh di production UI.

============================================================
18. SUPPORT CENTER
============================================================

Support harus tersedia untuk SEMUA USER.

Tidak dibatasi Pro.

Route:

/admin/support

Statuses:

new
in_progress
waiting_user
resolved
closed

Categories:

Bug
Data Tidak Sesuai
Pembayaran
Akun
Fitur
Lainnya

============================================================
19. SUPPORT TABLE
============================================================

JANGAN hanya:

ID | Subject | User | Category | Status | Created

WAJIB:

ID
Subject
Description
User
Category
Priority
Status
Screenshot
Created
Action

Description:

- maksimal 2 baris di table
- truncate
- full description di detail

Screenshot:

- thumbnail 48x48
- object-fit cover
- klik → preview besar
- jika kosong → "Tidak ada foto"

============================================================
20. SUPPORT DETAIL
============================================================

Tampilkan:

Ticket ID
Subject
Full Description

User
Email
User ID

Business
Business ID

Category
Priority
Status

Page / Feature

Created At
Updated At

Screenshot

Admin Note

Status selector

Save Changes

Admin note hanya internal.

User tidak boleh melihat admin note.

============================================================
21. SUPPORT FAQ
============================================================

Buat:

support_faq_categories
support_faqs

FAQ categories:

KEUANGAN

- Apa itu BEP Calculator?
- Apa itu HPP Calculator?
- Apa itu Cash Flow Forecast?
- Apa itu Loan Simulation?
- Apa itu Laporan Keuangan?
- Kenapa hasil kalkulator berbeda?
- Kenapa data saya gagal disimpan?

PENJUALAN & POS

- Apa itu Kasir POS?
- Bagaimana membuat transaksi?
- Bagaimana mengatur stok?
- Bagaimana menggunakan QR Menu?
- Bagaimana mencetak struk?
- Apa yang terjadi jika stok habis?

MARKETING

- Apa itu Content Generator?
- Apa itu Marketing PRD?
- Bagaimana credit AI bekerja?
- Kenapa fitur AI tidak tersedia?

AKUN & BISNIS

- Bagaimana mengubah profil bisnis?
- Bagaimana mengubah foto profil?
- Apa itu BisnisSehat Pro?
- Bagaimana melihat status langganan?

Jawaban:

- singkat
- langsung
- tidak seperti artikel panjang

Admin dapat:

CREATE FAQ
EDIT FAQ
DELETE/DEACTIVATE FAQ
REORDER FAQ

============================================================
22. USER BUG REPORT
============================================================

User dapat membuka:

Customer Support
→ Laporkan Masalah

Form:

Category
Subject
Description
Page / Feature
Screenshot
Priority

User email:
otomatis

Business:
otomatis

Current route:
otomatis jika memungkinkan

Jangan meminta user mengetik data yang sudah ada.

============================================================
23. SUPPORT DATABASE
============================================================

support_tickets:

id
business_id
user_id
category
subject
description
page_url
priority
status
screenshot_url
admin_note
created_at
updated_at

RLS:

USER:
- insert ticket sendiri
- select ticket sendiri

USER TIDAK BOLEH:
- membaca ticket user lain
- mengubah admin_note
- mengubah status secara arbitrer

ADMIN:
- read
- update
- manage sesuai permission

============================================================
24. WHATSAPP SUPPORT
============================================================

Tetap sediakan WhatsApp CS.

Nomor jangan hardcode di banyak component.

Jika memungkinkan:

support_settings

whatsapp_number
support_email
operating_hours

============================================================
25. PAYMENT CENTER
============================================================

/admin/payments

Tampilkan:

Payment ID
User
Business
Amount
Provider
Status
Order/Subscription
Created
Updated

Status:

pending
paid
failed
expired
refunded
cancelled

Admin dapat melihat detail.

Jangan memberikan kemampuan untuk mengubah payment status
secara sembarangan.

Payment status harus tetap mengikuti source of truth
dari payment provider / verified webhook.

Jika ada manual intervention:
gunakan explicit admin action + audit log.

============================================================
26. BUSINESS MANAGEMENT
============================================================

/admin/businesses

Table:

Business
Owner
Plan
Status
Products
Orders
AI Usage
Created

Search:
business name
owner email
business ID

Detail:

Business info
Owner
Subscription
AI usage
Orders
Support
Security events

Jangan izinkan admin mengakses business lain hanya dengan
memanipulasi business_id dari frontend.

============================================================
27. AUDIT LOG
============================================================

/admin/audit-logs

WAJIB.

Log:

admin_id
action
target_type
target_id
reason
metadata
created_at

Events:

ADMIN_LOGIN

USER_SUSPENDED
USER_UNSUSPENDED

USER_BANNED
USER_UNBANNED

USER_DELETED

SUBSCRIPTION_REMOVED
SUBSCRIPTION_RESTORED
SUBSCRIPTION_CANCELLED

CREDITS_ADJUSTED
CREDITS_RESET

SUPPORT_UPDATED

PAYMENT_MANUAL_ACTION

SETTINGS_UPDATED

Semua action sensitif harus tercatat.

============================================================
28. AUDIT LOG UI
============================================================

Table:

Time
Admin
Action
Target
Reason
Details

Filter:

Admin
Action
Target
Date

Search:

target ID
user ID
business ID

============================================================
29. ADMIN SETTINGS
============================================================

/admin/settings

Support:

WhatsApp CS
Support email
Operating hours

FAQ management

Feature maintenance status jika existing architecture
mendukung.

Jangan membuat setting yang tidak memiliki backend behavior.

============================================================
30. SECURITY REQUIREMENTS
============================================================

Ini bagian KRITIS.

Audit seluruh admin system terhadap:

IDOR
BOLA
Broken Access Control
Privilege Escalation
RLS bypass
Direct RPC invocation
Direct Edge Function invocation
JWT manipulation
Subscription manipulation
Credit manipulation
User ID substitution
Business ID substitution
Ticket ID substitution
AI usage data leakage
Cross-tenant access
Storage access
Admin impersonation

TEST:

User A mencoba membaca User B.

User A mencoba membaca Business B.

User A mencoba membaca Ticket B.

User A mencoba adjust credit user B.

User A mencoba remove subscription user B.

User A mencoba invoke admin endpoint langsung.

User A mencoba memanggil RPC admin langsung.

User A mencoba mengubah user status melalui request manipulation.

Semua harus ditolak.

============================================================
31. ADMIN AUTH
============================================================

Jangan percaya:

role dari localStorage
role dari React context
role dari request body
role dari query parameter

Role harus berasal dari trusted server-side source.

Jika menggunakan custom claims:
validasi JWT/claims dengan benar.

Jika menggunakan admin table:
gunakan RLS/server-side authorization.

============================================================
32. RATE LIMIT
============================================================

Admin endpoint tetap memiliki rate limit yang wajar.

Action sensitif:

ban
delete
credit adjustment
subscription change

jangan dapat dipanggil unlimited melalui request spam.

============================================================
33. CONCURRENCY
============================================================

Pastikan:

credit adjustment atomic

subscription update safe

support update safe

user status update safe

Tidak ada:

read → calculate → write

untuk state sensitif jika bisa menyebabkan race condition.

Gunakan atomic DB operations / transaction / row locking
sesuai kebutuhan.

============================================================
34. ERROR HANDLING
============================================================

Jangan expose:

service role
API key
database connection
internal SQL
stack trace sensitif
provider secret

ke frontend/user.

Admin UI boleh mendapatkan error yang berguna:

"Failed to update subscription."

bukan:

"SUPABASE_SERVICE_ROLE_KEY=..."

============================================================
35. ADMIN DASHBOARD UX
============================================================

Design:

dark BisnisSehat style

sidebar khusus admin.

Header:

BisnisSehat Admin

Admin avatar
Admin name
Role

Sidebar:

Overview
Users
Businesses
Subscriptions
AI Usage
Support
Payments
Audit Logs
Settings

Jangan campur menu admin dengan menu user biasa.

============================================================
36. ADMIN NOTIFICATIONS
============================================================

Jika sistem notification existing tersedia:

notify admin ketika:

new support ticket
payment issue
security event
AI error spike
subscription issue

Jangan membuat notification spam.

============================================================
37. AI USAGE VISUALIZATION
============================================================

Dashboard AI Usage harus memiliki:

Total Tokens
Input Tokens
Output Tokens
Credits Used
Provider Cost

Charts:

Token usage over time
Credits usage over time
Usage by tool
Usage by model

Table detail di bawah chart.

Semua chart berasal dari database.

============================================================
38. SUPPORT DASHBOARD VISUALIZATION
============================================================

Tampilkan:

Open Tickets
New Today
In Progress
Waiting User
Resolved Today

Chart:

tickets per day

breakdown category.

============================================================
39. SUBSCRIPTION DASHBOARD
============================================================

Tampilkan:

Active Pro
Expired
Cancelled
Pending Payment

Revenue:

Today
7 Days
30 Days

Jangan menghitung revenue dari client-side data.

Gunakan payment/subscription source of truth.

============================================================
40. DATABASE DESIGN
============================================================

Sebelum membuat tabel baru:

AUDIT existing schema.

Jangan membuat duplicate:

users
profiles
businesses
subscriptions
payments
credits
AI usage

Reuse existing tables jika sudah tersedia.

Tambahkan table hanya jika functionality belum ada.

Potential tables:

admin_roles
admin_permissions
admin_audit_logs
support_faq_categories
support_faqs
support_tickets
ai_usage_logs

Tetapi pastikan tidak duplicate existing schema.

============================================================
41. MIGRATIONS
============================================================

Migration harus:

- idempotent jika memungkinkan
- aman
- memiliki indexes
- memiliki foreign keys
- memiliki constraints
- RLS enabled
- policies explicit

Jangan membuat:

USING (true)

untuk sensitive admin data.

============================================================
42. STORAGE
============================================================

Support screenshot:

gunakan existing Supabase Storage architecture jika memungkinkan.

Path harus tenant/user scoped.

User hanya dapat upload/access screenshot ticket miliknya.

Admin dapat access sesuai authorization.

Jangan membuat public bucket hanya untuk mempermudah preview.

============================================================
43. ADMIN ACTION CONFIRMATION
============================================================

Action:

BAN
DELETE
REMOVE SUBSCRIPTION
RESET CREDITS

harus confirmation.

Untuk destructive action:

ketik confirmation phrase jika diperlukan.

Contoh:

Type:

BAN USER

untuk melanjutkan.

============================================================
44. DATA CONSISTENCY
============================================================

Subscription:

payment history != entitlement state.

Jangan menghapus payment hanya karena entitlement dihapus.

AI:

provider tokens != internal credits.

Support:

ticket status != user account status.

User:

suspend/ban != delete.

Pastikan setiap state memiliki source of truth jelas.

============================================================
45. TESTING
============================================================

Buat automated tests.

ADMIN AUTH:

- anonymous denied
- normal user denied
- admin allowed
- super admin allowed

USER ISOLATION:

- user A cannot read user B
- user A cannot modify user B

BUSINESS ISOLATION:

- cross-business denied

SUBSCRIPTION:

- normal user cannot modify subscription
- admin can modify
- payment history preserved

AI:

- user cannot read another user's usage
- admin can read
- credit adjustment atomic
- concurrent credit adjustments safe

SUPPORT:

- user can create ticket
- user can read own ticket
- user cannot read another user's ticket
- user cannot modify admin note
- admin can manage all tickets

STORAGE:

- user cannot access another user's private screenshot

AUDIT:

- sensitive admin actions create audit log

PAYMENT:

- payment provider state remains authoritative

ADMIN DIRECT API:

- direct non-admin requests denied

============================================================
46. SECURITY REGRESSION
============================================================

Run existing security suite.

DO NOT remove tests just to make the suite pass.

If existing security test fails:

investigate root cause.

Do not weaken security policy.

============================================================
47. BUILD
============================================================

Run:

tests
security tests
lint if available
production build

Final report:

FILES CHANGED
MIGRATIONS
NEW ROUTES
NEW TABLES
RLS POLICIES
ADMIN PERMISSIONS
TEST RESULTS
BUILD RESULT

============================================================
48. FINAL SECURITY AUDIT
============================================================

Setelah implementasi selesai:

Lakukan adversarial audit terhadap Admin Control Center.

Cari:

- privilege escalation
- IDOR
- BOLA
- direct API bypass
- direct RPC bypass
- RLS bypass
- role spoofing
- user ID substitution
- business ID substitution
- subscription manipulation
- credit manipulation
- audit log bypass
- support ticket access
- screenshot access
- payment manipulation
- race conditions
- replay attacks
- duplicate admin actions
- stale authorization
- session issues

Buat laporan:

CRITICAL
HIGH
MEDIUM
LOW
INFORMATIONAL

Setiap finding harus berisi:

ID
Severity
Location
Attack scenario
Root cause
Impact
Fix
Regression test

JANGAN menyatakan "100% secure".

============================================================
49. IMPORTANT EXISTING AI ARCHITECTURE
============================================================

JANGAN mengubah:

PRD → Gemini

Veo 3 → Gemini

Generate Video → COMING SOON

Atlas Cloud backend tetap ada untuk future activation.

Jangan membuat admin implementation
secara tidak sengaja membuka Generate Video kepada user.

============================================================
50. HASIL AKHIR YANG DIINGINKAN
============================================================

Saya ingin memiliki:

BisnisSehat
│
├── User App
│
└── Admin Control Center
    │
    ├── Overview
    ├── Users
    ├── Businesses
    ├── Subscriptions
    ├── AI Usage
    ├── Support
    ├── Payments
    ├── Audit Logs
    └── Settings

Admin harus bisa:

✓ melihat seluruh user
✓ melihat seluruh business
✓ suspend user
✓ unsuspend user
✓ ban user
✓ unban user
✓ remove subscription entitlement
✓ restore subscription
✓ melihat payment
✓ melihat support ticket seluruh user
✓ melihat deskripsi ticket
✓ melihat screenshot ticket
✓ mengelola FAQ
✓ melihat AI token usage
✓ melihat input/output/total token
✓ melihat internal credit usage
✓ melihat remaining credits
✓ melihat provider cost
✓ melihat usage per user
✓ melihat usage per business
✓ melihat usage per tool
✓ melihat usage per model
✓ adjust credits
✓ melihat audit log
✓ melihat security events

SEMUA dilakukan dengan authorization server-side,
RLS yang benar, atomic operations, dan audit trail.

Mulai dengan AUDIT EXISTING CODEBASE terlebih dahulu.

JANGAN langsung coding sebelum mengetahui
schema, auth, subscription, credit, AI usage,
support, payment, RLS, RPC, dan Edge Functions
yang sudah tersedia.
