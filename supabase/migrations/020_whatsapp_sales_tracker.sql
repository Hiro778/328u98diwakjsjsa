-- ============================================================
-- 020_whatsapp_sales_tracker.sql
-- BisnisSehat - WhatsApp Sales Tracker: leads, follow-ups
-- ============================================================

-- ============================================================
-- 1. WHATSAPP LEADS
-- ============================================================
create table public.whatsapp_leads (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  name                  text not null,
  phone                 text default '',
  email                 text default '',
  customer_id           uuid references public.customers(id) on delete set null,
  product_interest      text default '',
  estimated_value       numeric(15,2) not null default 0,
  status                text not null default 'new',
  priority              text not null default 'medium',
  notes                 text default '',
  lead_date             date not null default current_date,
  last_contacted_at     timestamptz,
  next_follow_up_at     timestamptz,
  converted_at          timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table public.whatsapp_leads enable row level security;

create index whatsapp_leads_business_id_idx on public.whatsapp_leads(business_id);
create index whatsapp_leads_status_idx on public.whatsapp_leads(status);
create index whatsapp_leads_next_follow_up_idx on public.whatsapp_leads(next_follow_up_at) where next_follow_up_at is not null;
create index whatsapp_leads_customer_id_idx on public.whatsapp_leads(customer_id) where customer_id is not null;
create index whatsapp_leads_phone_idx on public.whatsapp_leads(phone) where phone != '';
create index whatsapp_leads_lead_date_idx on public.whatsapp_leads(lead_date);

create policy "Users can view own business whatsapp leads"
  on whatsapp_leads for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business whatsapp leads"
  on whatsapp_leads for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business whatsapp leads"
  on whatsapp_leads for update to authenticated
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

create policy "Users can delete own business whatsapp leads"
  on whatsapp_leads for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 2. WHATSAPP LEAD FOLLOW-UPS
-- ============================================================
create table public.whatsapp_lead_followups (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  lead_id               uuid not null references public.whatsapp_leads(id) on delete cascade,
  method                text not null default 'whatsapp',
  result                text default '',
  next_follow_up_at     timestamptz,
  notes                 text default '',
  created_at            timestamptz default now()
);

alter table public.whatsapp_lead_followups enable row level security;

create index whatsapp_followups_business_id_idx on public.whatsapp_lead_followups(business_id);
create index whatsapp_followups_lead_id_idx on public.whatsapp_lead_followups(lead_id);

create policy "Users can view own business whatsapp followups"
  on whatsapp_lead_followups for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business whatsapp followups"
  on whatsapp_lead_followups for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business whatsapp followups"
  on whatsapp_lead_followups for update to authenticated
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

create policy "Users can delete own business whatsapp followups"
  on whatsapp_lead_followups for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );
