-- ============================================================
-- 018_invoice_enhancements.sql
-- BisnisSehat - Invoice enhancements: subtotal/discount/tax, follow-up result
-- ============================================================

-- 1. Add financial breakdown columns to invoices
alter table public.invoices
  add column subtotal numeric(15,2) not null default 0,
  add column discount numeric(15,2) not null default 0,
  add column tax numeric(15,2) not null default 0;

-- 2. Add result and next_follow_up_date to followups
alter table public.invoice_followups
  add column result text default '',
  add column next_follow_up_date date;

-- 3. Backfill subtotal from amount for existing invoices
update public.invoices
set subtotal = amount
where subtotal = 0 and amount > 0;
