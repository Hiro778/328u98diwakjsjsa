-- ============================================================
-- 044_notification_center.sql
-- BisnisSehat - Centralized Notification Center & Web Push System
-- Conforms strictly to fix1.md and pop.md specifications
-- ============================================================

-- ══════════════════════════════════════════════════════════
-- 1. NOTIFICATIONS TABLE
-- ══════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  title           text not null,
  message         text not null,
  category        text not null check (category in (
    'invoice', 'order', 'inventory', 'content_calendar',
    'legalitas', 'marketplace', 'whatsapp', 'creative', 'subscription', 'general',
    'sales', 'customer', 'supplier'
  )),
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  action_url      text default null,
  dedup_key       text default null,
  is_read         boolean not null default false,
  read_at         timestamptz default null,
  created_at      timestamptz not null default now()
);

-- Indexes for fast listing, unread badge count, and tenant queries
create index if not exists idx_notifications_business_unread 
  on public.notifications(business_id, is_read, created_at desc);

create index if not exists idx_notifications_created_at 
  on public.notifications(created_at desc);

-- Unique constraint on (business_id, dedup_key) to enforce idempotency
alter table public.notifications 
  add constraint uq_notifications_business_dedup unique (business_id, dedup_key);

-- ══════════════════════════════════════════════════════════
-- 2. WEB PUSH SUBSCRIPTIONS TABLE
-- ══════════════════════════════════════════════════════════

create table if not exists public.web_push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_web_push_sub_business 
  on public.web_push_subscriptions(business_id);

create index if not exists idx_web_push_sub_user 
  on public.web_push_subscriptions(user_id);

-- ══════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════

alter table public.notifications enable row level security;
alter table public.web_push_subscriptions enable row level security;

-- Policies for notifications (Owner-isolated)
do $$ begin
  drop policy if exists "notifications_owner_select" on public.notifications;
  create policy "notifications_owner_select"
    on public.notifications for select to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "notifications_owner_insert" on public.notifications;
  create policy "notifications_owner_insert"
    on public.notifications for insert to authenticated
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "notifications_owner_update" on public.notifications;
  create policy "notifications_owner_update"
    on public.notifications for update to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    )
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "notifications_owner_delete" on public.notifications;
  create policy "notifications_owner_delete"
    on public.notifications for delete to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

-- Policies for web_push_subscriptions
do $$ begin
  drop policy if exists "web_push_user_all" on public.web_push_subscriptions;
  create policy "web_push_user_all"
    on public.web_push_subscriptions for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;

-- ══════════════════════════════════════════════════════════
-- 4. REALTIME PUBLICATION
-- ══════════════════════════════════════════════════════════

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- ══════════════════════════════════════════════════════════
-- 5. SCHEDULED REMINDERS & DUE-NOTIFICATION SYNC
-- ══════════════════════════════════════════════════════════

create or replace function public.sync_due_notifications(p_business_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  row_count integer := 0;
begin
  -- 1. Invoices: Jatuh Tempo Hari Ini (status pending / partially_paid)
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    i.business_id,
    'Invoice Jatuh Tempo Hari Ini',
    'Invoice ' || i.invoice_number || ' senilai Rp ' || to_char(i.amount, 'FM999,999,999,999') || ' jatuh tempo hari ini.',
    'invoice',
    'high',
    '/dashboard/penjualan/invoice-follow-up',
    'inv_due_' || i.id || '_' || current_date::text
  from public.invoices i
  where (p_business_id is null or i.business_id = p_business_id)
    and i.due_date = current_date
    and i.status in ('pending', 'partially_paid')
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 2. Invoices: Melewati Jatuh Tempo (Overdue)
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    i.business_id,
    'Invoice Melewati Jatuh Tempo',
    'Invoice ' || i.invoice_number || ' telah melewati tanggal jatuh tempo dan belum terlunasi.',
    'invoice',
    'urgent',
    '/dashboard/penjualan/invoice-follow-up',
    'inv_overdue_' || i.id || '_' || current_date::text
  from public.invoices i
  where (p_business_id is null or i.business_id = p_business_id)
    and i.due_date < current_date
    and i.status in ('pending', 'partially_paid', 'overdue')
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 3. Inventory: Stok Habis (quantity <= 0)
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    p.business_id,
    'Stok Produk Habis',
    'Stok untuk produk "' || p.name || '" telah habis (0). Segera lakukan pengadaan.',
    'inventory',
    'urgent',
    '/dashboard/inventory',
    'inv_stock_zero_' || p.id || '_' || current_date::text
  from public.inventory inv
  join public.products p on p.id = inv.product_id
  where (p_business_id is null or p.business_id = p_business_id)
    and inv.quantity <= 0
    and p.is_active = true
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 4. Inventory: Stok Menipis (quantity <= min_stock dan > 0)
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    p.business_id,
    'Stok Produk Menipis',
    'Stok produk "' || p.name || '" tersisa ' || inv.quantity || ' (batas minimum: ' || inv.min_stock || ').',
    'inventory',
    'high',
    '/dashboard/inventory',
    'inv_stock_low_' || p.id || '_' || current_date::text
  from public.inventory inv
  join public.products p on p.id = inv.product_id
  where (p_business_id is null or p.business_id = p_business_id)
    and inv.quantity > 0
    and inv.min_stock > 0
    and inv.quantity <= inv.min_stock
    and p.is_active = true
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 5. Subscriptions: Mendekati Masa Berakhir (<= 3 hari)
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    s.business_id,
    'Langganan BisnisSehat Pro Segera Berakhir',
    'Masa aktif langganan BisnisSehat Pro Anda akan berakhir dalam 3 hari. Perpanjang agar fitur premium tetap aktif.',
    'subscription',
    'high',
    '/dashboard/pricing',
    'sub_expiring_' || s.id || '_' || current_date::text
  from public.subscriptions s
  where s.business_id is not null
    and (p_business_id is null or s.business_id = p_business_id)
    and s.status = 'active'
    and s.expires_at is not null
    and s.expires_at > now()
    and s.expires_at <= (now() + interval '3 days')
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 6. Subscriptions: Sudah Berakhir
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    s.business_id,
    'Langganan BisnisSehat Pro Berakhir',
    'Masa aktif langganan BisnisSehat Pro Anda telah berakhir. Perpanjang sekarang untuk memulihkan akses fitur Pro.',
    'subscription',
    'urgent',
    '/dashboard/pricing',
    'sub_expired_' || s.id || '_' || current_date::text
  from public.subscriptions s
  where s.business_id is not null
    and (p_business_id is null or s.business_id = p_business_id)
    and s.status in ('active', 'past_due', 'expired')
    and s.expires_at is not null
    and s.expires_at <= now()
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 7. WhatsApp Business: Disconnected / Error
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    w.business_id,
    'WhatsApp Operasional Terputus',
    'Koneksi WhatsApp Business terputus atau mengalami kendala. Silakan cek status koneksi Anda.',
    'whatsapp',
    'high',
    '/dashboard/whatsapp',
    'wa_status_' || w.id || '_' || current_date::text
  from public.whatsapp_business_connections w
  where (p_business_id is null or w.business_id = p_business_id)
    and w.status in ('disconnected', 'error')
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 8. Legalitas: Status Perlu Ditinjau
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    lc.business_id,
    'Hasil Pemeriksaan Legalitas Perlu Ditinjau',
    'Pemeriksaan legalitas kategori ' || upper(lcr.category) || ' selesai dan memerlukan verifikasi pada portal resmi.',
    'legalitas',
    'normal',
    '/dashboard/legalitas',
    'legal_res_' || lcr.id || '_' || lcr.status
  from public.legal_check_results lcr
  join public.legal_checks lc on lc.id = lcr.check_id
  where (p_business_id is null or lc.business_id = p_business_id)
    and lcr.status = 'NEEDS_OFFICIAL_VERIFICATION'
    and (lcr.user_confirmed is null or lcr.user_confirmed = false)
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 9. Creative Studio: Generasi Gagal
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    cg.business_id,
    'Proses Pembuatan Aset Kreatif Gagal',
    'Pembuatan aset AI Creative Studio mengalami kendala. Kredit Anda aman dan tidak terpotong.',
    'creative',
    'normal',
    '/dashboard/creative-studio',
    'creative_fail_' || cg.id
  from public.creative_generations cg
  where (p_business_id is null or cg.business_id = p_business_id)
    and cg.status = 'failed'
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 10. Creative Studio: Kredit Habis
  insert into public.notifications (
    business_id, title, message, category, priority, action_url, dedup_key
  )
  select
    cc.business_id,
    'Kredit AI Creative Studio Habis',
    'Kredit generasi konten AI Creative Studio Anda telah habis (0). Lakukan top-up untuk melanjutkan proses kreasi.',
    'creative',
    'normal',
    '/dashboard/creative-studio',
    'creative_credit_zero_' || cc.business_id || '_' || current_date::text
  from public.creative_credits cc
  where (p_business_id is null or cc.business_id = p_business_id)
    and cc.available <= 0
  on conflict (business_id, dedup_key) do nothing;
  get diagnostics row_count = row_count;
  inserted_count := inserted_count + row_count;

  -- 11. Marketplace Connections (Dynamic check if table exists)
  if to_regclass('public.marketplace_connections') is not null then
    execute $dyn$
      insert into public.notifications (
        business_id, title, message, category, priority, action_url, dedup_key
      )
      select
        mc.business_id,
        'Koneksi Marketplace Terputus',
        'Koneksi toko marketplace ' || initcap(mc.marketplace) || ' mengalami error atau terputus.',
        'marketplace',
        'high',
        '/dashboard/marketplace',
        'mp_err_' || mc.id || '_' || current_date::text
      from public.marketplace_connections mc
      where ($1 is null or mc.business_id = $1)
        and mc.status in ('error', 'disconnected')
      on conflict (business_id, dedup_key) do nothing;
    $dyn$ using p_business_id;
  end if;

  return inserted_count;
end;
$$;

-- Allow authenticated users to invoke sync_due_notifications for their business
grant execute on function public.sync_due_notifications(uuid) to authenticated, anon;

-- ══════════════════════════════════════════════════════════
-- 6. PG_CRON SCHEDULE (Daily at 01:00 UTC)
-- ══════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Unschedule previous job if exists to prevent duplicates
    if exists (select 1 from cron.job where jobname = 'check-daily-business-notifications') then
      perform cron.unschedule('check-daily-business-notifications');
    end if;

    perform cron.schedule(
      'check-daily-business-notifications',
      '0 1 * * *',
      'select public.sync_due_notifications();'
    );
  end if;
exception when others then
  raise notice 'pg_cron setup skipped or failed: %', sqlerrm;
end $$;

-- ══════════════════════════════════════════════════════════
-- 7. TRIGGERS FOR REALTIME BUSINESS EVENTS
-- ══════════════════════════════════════════════════════════

-- Trigger on Orders: New QR/POS orders
create or replace function public.on_order_created_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  if (new.order_status = 'pending' or new.order_source = 'qr_menu') then
    insert into public.notifications (
      business_id, title, message, category, priority, action_url, dedup_key
    )
    values (
      new.business_id,
      'Pesanan Baru Masuk',
      'Pesanan #' || new.order_number || ' senilai Rp ' || to_char(coalesce(new.total, 0), 'FM999,999,999,999') || ' telah diterima.',
      'order',
      'high',
      '/dashboard/pos',
      'order_new_' || new.id
    )
    on conflict (business_id, dedup_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_created_notification on public.orders;
create trigger trg_order_created_notification
  after insert on public.orders
  for each row execute function public.on_order_created_notification();

-- Trigger on Invoices: Payment received
create or replace function public.on_invoice_payment_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  if (new.status = 'paid' and (old.status is null or old.status != 'paid')) then
    insert into public.notifications (
      business_id, title, message, category, priority, action_url, dedup_key
    )
    values (
      new.business_id,
      'Pembayaran Invoice Diterima',
      'Invoice ' || new.invoice_number || ' senilai Rp ' || to_char(coalesce(new.amount, 0), 'FM999,999,999,999') || ' telah lunas dibayar.',
      'invoice',
      'normal',
      '/dashboard/penjualan/invoice-follow-up',
      'inv_paid_' || new.id
    )
    on conflict (business_id, dedup_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoice_payment_notification on public.invoices;
create trigger trg_invoice_payment_notification
  after update on public.invoices
  for each row execute function public.on_invoice_payment_notification();

