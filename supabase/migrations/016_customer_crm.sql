-- ============================================================
-- 016_customer_crm.sql
-- BisnisSehat - Customer CRM: metrics, sales integration, indexes
-- ============================================================

-- 1. Add CRM metrics columns to customers
alter table public.customers
  add column total_transactions integer not null default 0,
  add column total_spent numeric(15,2) not null default 0,
  add column last_transaction_at timestamptz;

-- 2. Indexes for customer search and metrics
create index customers_phone_idx on public.customers(phone) where phone != '';
create index customers_email_idx on public.customers(email) where email != '';
create index customers_last_transaction_idx on public.customers(last_transaction_at desc nulls last);

-- 3. Backward-compatible: add customer_id to sales (nullable, no FK yet)
--    FK added separately after data migration to avoid breaking existing sales
alter table public.sales
  add column customer_id uuid references public.customers(id) on delete set null;

create index sales_customer_id_idx on public.sales(customer_id) where customer_id is not null;

-- 4. RLS policies for customers (already exist from 001, no changes needed)
--    Policies in 001 already cover SELECT/INSERT/UPDATE/DELETE with business_id check

-- 5. Recalculate existing customer metrics from sales table
--    This handles any pre-existing sales data
update public.customers c
set
  total_transactions = coalesce(s.cnt, 0),
  total_spent = coalesce(s.spent, 0),
  last_transaction_at = s.last_sale
from (
  select
    customer_id,
    count(*) as cnt,
    sum(total) as spent,
    max(created_at) as last_sale
  from public.sales
  where customer_id is not null
  group by customer_id
) s
where c.id = s.customer_id;
