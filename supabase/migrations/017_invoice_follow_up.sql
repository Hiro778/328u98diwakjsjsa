-- ============================================================
-- 017_invoice_follow_up.sql
-- BisnisSehat - Invoice Follow-up: invoices, payments, follow-ups
-- ============================================================

-- ============================================================
-- 1. INVOICES
-- ============================================================
create table public.invoices (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  customer_id       uuid references public.customers(id) on delete set null,
  invoice_number    text not null,
  issue_date        date not null default current_date,
  due_date          date not null default current_date,
  amount            numeric(15,2) not null default 0,
  paid_amount       numeric(15,2) not null default 0,
  status            text not null default 'pending',
  notes             text default '',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.invoices enable row level security;

create index invoices_business_id_idx on public.invoices(business_id);
create index invoices_customer_id_idx on public.invoices(customer_id) where customer_id is not null;
create index invoices_due_date_idx on public.invoices(due_date);
create index invoices_status_idx on public.invoices(status);
create unique index invoices_business_number_idx on public.invoices(business_id, invoice_number);

-- RLS policies
create policy "Users can view own business invoices"
  on invoices for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business invoices"
  on invoices for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business invoices"
  on invoices for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can delete own business invoices"
  on invoices for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 2. INVOICE PAYMENTS
-- ============================================================
create table public.invoice_payments (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  amount            numeric(15,2) not null default 0,
  payment_date      date not null default current_date,
  method            text default '',
  notes             text default '',
  created_at        timestamptz default now()
);

alter table public.invoice_payments enable row level security;

create index invoice_payments_business_id_idx on public.invoice_payments(business_id);
create index invoice_payments_invoice_id_idx on public.invoice_payments(invoice_id);

-- RLS policies
create policy "Users can view own business invoice payments"
  on invoice_payments for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business invoice payments"
  on invoice_payments for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business invoice payments"
  on invoice_payments for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can delete own business invoice payments"
  on invoice_payments for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 3. INVOICE FOLLOW-UPS
-- ============================================================
create table public.invoice_followups (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  follow_up_date    date not null default current_date,
  method            text not null default '',
  note              text default '',
  created_at        timestamptz default now()
);

alter table public.invoice_followups enable row level security;

create index invoice_followups_business_id_idx on public.invoice_followups(business_id);
create index invoice_followups_invoice_id_idx on public.invoice_followups(invoice_id);

-- RLS policies
create policy "Users can view own business invoice followups"
  on invoice_followups for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business invoice followups"
  on invoice_followups for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business invoice followups"
  on invoice_followups for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can delete own business invoice followups"
  on invoice_followups for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );
