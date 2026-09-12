PHASE 3 — ACTUAL BUSINESS TRANSACTION LAYER
Sales/Revenue + Expenses + Inventory/COGS

Kamu bekerja di project SaaS UMKM yang sudah memiliki:
- React 19 + Vite 8 + Tailwind CSS 4
- Supabase PostgreSQL + Auth + RLS
- businesses
- products
- inventory
- stock_movements
- customers
- suppliers
- hpp_calculations
- margin_analyses
- bep_calculations
- Financial Reports
- Cash Flow Forecast
- Tax Planning
- Anomaly Detection
- Financial Health Score
- Loan Simulation
- Customer CRM
- Invoice Follow-up
- Loyalty Program

Phase 1 + 2 sudah selesai:
Product → HPP → Margin → BEP sudah terhubung melalui product_id.
HPP menggunakan snapshot ketika disimpan ke Margin/BEP.
JANGAN merusak fitur yang sudah ada.

TUJUAN PHASE 3:
Membangun transaction layer yang menjadi SOURCE OF TRUTH untuk kondisi bisnis aktual.

PRINSIP PALING PENTING:
1. Jangan membuat angka dummy/fake.
2. Jangan menggunakan localStorage sebagai database.
3. Semua data harus business-scoped.
4. Jangan mematikan RLS.
5. Jangan menjadikan HPP/Margin sebagai pengganti transaksi penjualan aktual.
6. Historical transaction harus immutable secara logis.
7. Gunakan product_id, customer_id, supplier_id sebagai FK, bukan nama sebagai relation utama.
8. Jika data belum tersedia, UI harus mengatakan belum ada data, bukan mengarang.
9. Jangan mengubah formula finance tools yang sudah selesai kecuali memang diperlukan untuk integrasi.
10. Jangan rewrite seluruh project. Kerjakan incremental.

==================================================
A. AUDIT CODEBASE TERLEBIH DAHULU
==================================================

Sebelum coding:

1. Inspect:
   - existing migrations
   - products schema
   - inventory schema
   - stock_movements schema
   - customers schema
   - suppliers schema
   - existing sales-related code
   - existing expense-related code
   - Financial Reports data source
   - Cash Flow data source
   - Tax Planning data source
   - shared services

2. Cari apakah tabel sales/expenses sudah ada.

3. Jika sudah ada:
   - jangan duplicate table
   - inspect schema
   - extend hanya jika diperlukan
   - preserve existing data

4. Jika belum ada:
   buat migration baru dengan nomor migration berikutnya yang benar berdasarkan repository.

==================================================
B. SALES / REVENUE
==================================================

Bangun actual sales transaction system.

Minimal schema:

sales
- id UUID PK
- business_id UUID NOT NULL
- product_id UUID NULL
- customer_id UUID NULL
- invoice_id UUID NULL jika architecture existing mendukung
- quantity NUMERIC NOT NULL
- unit_price NUMERIC NOT NULL
- discount_amount NUMERIC DEFAULT 0
- tax_amount NUMERIC DEFAULT 0
- total_amount NUMERIC NOT NULL
- payment_status
- payment_method
- sold_at TIMESTAMPTZ NOT NULL
- notes
- created_at
- updated_at

PENTING:
- quantity TIDAK BOLEH memiliki artificial maximum.
- Valid quantity:
  Number.isFinite(quantity) && quantity > 0
- Jangan Math.min().
- Jangan silent clamp.
- Monetary input juga jangan silent clamp.

Gunakan CHECK constraints yang masuk akal di database.

payment_status minimal:
- unpaid
- partial
- paid
- cancelled

payment_method minimal:
- cash
- bank_transfer
- qris
- ewallet
- card
- other

Sesuaikan dengan enum/schema project jika sudah ada.

==================================================
C. SALES CALCULATION
==================================================

Total transaksi harus deterministic.

Default:

subtotal =
quantity * unit_price

total =
subtotal - discount_amount + tax_amount

Pastikan:
- discount tidak boleh membuat nilai invalid
- quantity > 0
- unit_price >= 0
- discount >= 0
- tax >= 0
- total >= 0

Jangan melakukan rounding berulang yang menyebabkan discrepancy.

Buat pure calculation service/function.

Contoh:
calculateSaleTotal({
  quantity,
  unitPrice,
  discountAmount,
  taxAmount
})

Buat unit tests lengkap.

==================================================
D. PRODUCT RELATION
==================================================

Jika sale memiliki product_id:

- product harus berasal dari business yang sama.
- jangan percaya product_id dari frontend tanpa validasi.
- ambil product dari database.
- gunakan product.unit_price sebagai default selling price jika sesuai architecture.
- user tetap boleh override unit price untuk historical transaction jika bisnis membutuhkan harga berbeda.
- jangan mengubah historical sale ketika product.unit_price berubah.

Ketika sale disimpan:
harga transaksi disimpan sebagai snapshot melalui unit_price.

Jangan membaca ulang product.unit_price untuk menghitung historical revenue.

==================================================
E. CUSTOMER RELATION
==================================================

Jika customer dipilih:

sales.customer_id → customers.id

Pastikan customer berasal dari business yang sama.

Customer CRM harus bisa melihat:
- total transaksi
- total revenue
- jumlah transaksi
- last transaction
- outstanding payment jika tersedia

Jangan menghitung customer metrics dari fake data.

==================================================
F. INVENTORY INTEGRATION
==================================================

Ini bagian penting.

Jika sale menggunakan product_id dan produk inventory-managed:

Saat sale berhasil:
- kurangi stock sesuai quantity
- buat stock_movement dengan type SALE
- simpan reference ke sale jika schema mendukung
- jangan update stock jika transaksi cancelled

Pastikan atomicity:
SALE + STOCK MOVEMENT harus konsisten.

Jangan sampai:
sale berhasil tapi stock gagal,
atau stock berkurang tapi sale gagal.

Gunakan database transaction/RPC bila diperlukan karena Supabase client biasa tidak menjamin multi-query atomicity.

Jika architecture existing belum punya RPC:
buat SECURITY DEFINER RPC dengan hati-hati.

RLS tetap wajib.

==================================================
G. COGS / HPP SNAPSHOT
==================================================

Saat actual sale dibuat untuk product_id:

Cari latest valid HPP menggunakan hppService yang sudah ada.

Jika HPP tersedia:
simpan snapshot HPP pada sale atau sale item sesuai architecture.

Contoh:

hpp_snapshot
cogs_amount

cogs_amount =
quantity * hpp_snapshot

PENTING:
HPP historical sale harus IMMUTABLE.

Jika HPP produk berubah besok:
historical sale tidak ikut berubah.

Jika HPP belum tersedia:
JANGAN membuat angka.
Sale tetap boleh tercatat sebagai revenue jika business flow mengizinkan,
tetapi COGS harus NULL/unknown dan UI harus menjelaskan bahwa HPP belum tersedia.

Jangan memakai Margin Analysis sebagai COGS source.

==================================================
H. EXPENSES
==================================================

Bangun actual expense transaction layer.

Schema minimal:

expenses
- id UUID PK
- business_id UUID NOT NULL
- category
- description
- amount NUMERIC NOT NULL
- payment_method
- expense_date TIMESTAMPTZ NOT NULL
- supplier_id UUID NULL
- status
- notes
- created_at
- updated_at

Category harus extensible.
Jangan hardcode hanya 3 kategori.

Minimal default:
- operational
- inventory
- payroll
- rent
- utilities
- marketing
- transportation
- tax
- equipment
- other

Jika existing architecture punya category system, gunakan itu.

Validation:
amount > 0
expense_date valid
business_id valid

==================================================
I. EXPENSE CRUD
==================================================

Implement:

- create
- read
- update
- delete/cancel sesuai accounting logic
- search
- filter category
- filter date
- sort
- pagination

Untuk historical financial data:
lebih baik gunakan status/cancelled daripada physical delete jika transaction sudah masuk laporan.

Jangan menghapus historical transaction secara sembarangan.

==================================================
J. SALES UI
==================================================

Cari pola UI existing dan ikuti design system yang sudah ada.

Buat:

Sales page
- summary actual revenue
- transaction list
- add sale
- edit sale jika masih allowed
- detail sale
- filters
- search
- date range
- payment status
- payment method

Add Sale:
1. pilih product
2. pilih customer optional
3. quantity
4. unit price
5. discount
6. tax
7. payment method
8. payment status
9. sold date
10. notes

Preview real-time:
- subtotal
- discount
- tax
- total
- HPP snapshot jika tersedia
- estimated COGS jika HPP tersedia
- estimated gross profit jika HPP tersedia

Jangan menampilkan profit jika HPP belum tersedia.

==================================================
K. EXPENSE UI
==================================================

Buat:

Expenses page
- total expense periode
- transaction list
- category breakdown
- add expense
- edit
- detail
- filters
- search
- date range

Add Expense:
- category
- description
- amount
- payment method
- date
- supplier optional
- notes

==================================================
L. FINANCIAL REPORT INTEGRATION
==================================================

Financial Reports yang sudah ada harus mulai menggunakan actual transactions.

Revenue:
SUM(actual valid sales.total_amount)

Expenses:
SUM(actual valid expenses.amount)

COGS:
SUM(actual sales.cogs_amount jika tersedia)

Gross Profit:
Revenue - COGS

Jika COGS sebagian belum diketahui:
JANGAN pura-pura menghasilkan profit akurat.

Tampilkan:
- Revenue actual
- COGS known
- Gross profit hanya jika basis datanya cukup
- Expenses actual
- Net/estimated profit dengan label yang jujur

Pisahkan dengan jelas:
ACTUAL
ESTIMATED
UNKNOWN

Jangan mengubah HPP Calculator menjadi sumber revenue.

==================================================
M. CASH FLOW INTEGRATION
==================================================

Cash Flow Forecast harus dapat membedakan:

Actual cash inflow:
sales yang benar-benar paid

Actual cash outflow:
expenses yang benar-benar dibayar/valid sesuai payment status architecture

Jangan menganggap invoice unpaid sebagai cash masuk.

Jika sale:
payment_status = unpaid
maka jangan masukkan ke actual cash inflow.

Jika partial:
gunakan amount paid jika sistem payment detail mendukung.

Jika belum ada payment table:
jangan mengarang amount paid.
Tambahkan struktur yang benar atau tandai partial sebagai unsupported sampai payment model dibuat.

==================================================
N. TAX INTEGRATION
==================================================

Tax Planning harus membaca actual revenue/expense data jika periode tersedia.

Jangan menghitung pajak dari:
- HPP Calculator
- Margin Analysis
- BEP

Gunakan actual transactions sebagai source.

Tax calculation tetap mengikuti logic Tax Planning existing.

==================================================
O. CUSTOMER CRM INTEGRATION
==================================================

Customer detail harus menampilkan actual sales:

- transaction count
- total revenue
- average transaction value
- last purchase
- purchase history

Semua berdasarkan sales table.

Jika customer belum punya transaksi:
tampilkan empty state.

==================================================
P. DASHBOARD
==================================================

Jangan memasukkan fake KPI.

Dashboard boleh menampilkan:

Revenue Today
Revenue This Month
Expenses This Month
Transactions This Month
Outstanding jika datanya tersedia
Gross Profit jika COGS cukup

Jika belum ada transaksi:
gunakan empty state:
"Belum ada transaksi"

Jangan:
- generate random numbers
- hardcode KPI
- fake trend
- fake percentage

==================================================
Q. SHARED SERVICES
==================================================

Buat/extend:

src/lib/salesService.js
src/lib/expenseService.js

Sales service minimal:
- createSale
- getSales
- getSaleById
- updateSale
- cancelSale
- getSalesSummary
- getSalesByCustomer
- getSalesByProduct
- getRevenueByPeriod

Expense service:
- createExpense
- getExpenses
- getExpenseById
- updateExpense
- cancelExpense
- getExpenseSummary
- getExpensesByCategory
- getExpensesByPeriod

Service harus business-scoped.

Jangan menerima business_id arbitrary dari UI sebagai trust boundary.

Ambil business context dari authenticated user / authorized business.

==================================================
R. RLS
==================================================

Sales dan expenses wajib RLS.

Policy pattern:

business_id IN (
  SELECT id
  FROM businesses
  WHERE owner_id = auth.uid()
)

Pastikan:
- SELECT isolated
- INSERT isolated
- UPDATE isolated
- DELETE isolated

FK relation juga harus business-safe.

Jangan hanya mengandalkan frontend filtering.

Tambahkan tests untuk cross-business isolation.

==================================================
S. INDEXES
==================================================

Tambahkan index yang relevan:

sales:
- business_id
- business_id + sold_at
- business_id + product_id
- business_id + customer_id
- payment_status

expenses:
- business_id
- business_id + expense_date
- business_id + category
- supplier_id

Jangan over-index tanpa alasan.

==================================================
T. TESTING
==================================================

Buat tests untuk pure calculation:

Sales:
- normal sale
- quantity decimal
- huge valid quantity
- zero quantity invalid
- negative quantity invalid
- Infinity invalid
- NaN invalid
- discount
- tax
- zero unit price
- total calculation
- historical unit price snapshot

Inventory:
- sale decreases stock
- stock movement created
- cancelled sale does not incorrectly decrease stock
- insufficient stock behavior
- atomic failure behavior

HPP:
- HPP available → COGS calculated
- HPP missing → COGS unknown/null
- historical HPP remains immutable

Customer:
- customer relation
- cross-business customer rejected

Expenses:
- amount validation
- category
- date
- summary
- cancelled expense excluded from actual totals

RLS:
- business A cannot read business B
- business A cannot insert using business B
- business A cannot update business B
- business A cannot delete business B

Integration:
- Sales → Revenue
- Sales → COGS
- Sales → Customer metrics
- Sales → Inventory
- Expenses → Financial Reports
- Sales paid → Cash Flow
- Sales unpaid → NOT actual cash flow

==================================================
U. IMPORTANT NUMERIC INPUT RULE
==================================================

DO NOT introduce any maximum quantity.

Bad:
Math.min(quantity, 1000000)

Bad:
MAX_QUANTITY = 1000000

Bad:
if quantity > 1000000 then clamp

Correct:
Number.isFinite(quantity) && quantity > 0

Valid huge values must remain unchanged.

Do not silently convert:
1,000,000,000,000
into another value.

If database precision becomes a limitation:
handle it explicitly with validation/error.
Never silently modify user input.

==================================================
V. MIGRATION SAFETY
==================================================

Before creating migration:
inspect the latest migration number.

Do not reuse migration numbers.

After migration:
- verify schema
- verify indexes
- verify RLS
- verify FK
- verify constraints

Do NOT claim migration is deployed unless actually verified in Supabase.

==================================================
W. BACKWARD COMPATIBILITY
==================================================

Existing:
- HPP
- Margin
- BEP
- Financial Reports
- Cash Flow
- Tax
- Anomaly
- Health Score
- Loan
- CRM
- Invoice Follow-up
- Loyalty
- Inventory

must continue building.

Do not break existing routes.

Do not delete old components unless replaced safely.

==================================================
X. DEFINITION OF DONE
==================================================

Phase 3 is DONE only if:

1. Sales transaction layer exists.
2. Expense transaction layer exists.
3. Actual revenue comes from sales.
4. Actual expenses come from expenses.
5. Product relation uses product_id.
6. Customer relation uses customer_id.
7. Inventory decreases correctly from sales.
8. Stock movement is recorded.
9. HPP snapshot is preserved when available.
10. COGS is calculated only when HPP exists.
11. Historical values remain immutable.
12. Financial Reports can consume actual transactions.
13. Cash Flow distinguishes paid vs unpaid sales.
14. Customer CRM consumes actual sales.
15. Dashboard contains no fake KPI.
16. RLS is business-scoped.
17. Cross-business isolation is tested.
18. Huge valid quantities are not clamped.
19. Pure calculation tests pass.
20. Integration tests pass.
21. Full existing test suite passes.
22. npm run build passes.

==================================================
DELIVERABLE
==================================================

After implementation, report:

1. Files created
2. Files modified
3. Migration number + filename
4. New tables/columns
5. Sales flow
6. Expense flow
7. Inventory integration
8. HPP/COGS integration
9. Financial Reports integration
10. Cash Flow integration
11. CRM integration
12. RLS policies
13. Tests:
   - Phase 3 tests passed
   - full test count passed
14. Build result
15. Any remaining runtime verification
16. Any migration that still needs to be manually applied

JANGAN mengatakan "done" jika migration/runtime/RLS belum benar-benar diverifikasi.

Mulai dengan AUDIT CODEBASE.
Jangan langsung membuat migration sebelum memahami schema existing.
