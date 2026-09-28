-- ============================================================
-- 034_whatsapp_message_queue.sql
-- BisnisSehat - WhatsApp Message Queue for Infrastructure Phase 1
-- ============================================================

-- Create the table
create table public.whatsapp_message_queue (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid references public.businesses(id) on delete cascade,
  phone_number_id       text,
  whatsapp_message_id   text not null, -- Unique constraint will be added via index
  sender_phone          text,
  message_type          text,
  message_text          text,
  payload               jsonb not null,
  status                text not null default 'queued'
                        check (status in ('queued', 'processing', 'completed', 'retrying', 'failed')),
  attempts              integer not null default 0,
  max_attempts          integer not null default 5,
  available_at          timestamptz not null default now(),
  locked_at             timestamptz,
  locked_by             text,
  completed_at          timestamptz,
  failed_at             timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Enable RLS
alter table public.whatsapp_message_queue enable row level security;

-- Unique index for idempotency
create unique index whatsapp_message_id_unique_idx on public.whatsapp_message_queue(whatsapp_message_id);

-- Index for queue workers
create index whatsapp_message_queue_status_available_idx on public.whatsapp_message_queue(status, available_at)
where status in ('queued', 'retrying');

-- Index for business scoping
create index whatsapp_message_queue_business_id_idx on public.whatsapp_message_queue(business_id)
where business_id is not null;

-- RLS Policies
-- Only service role should have full access to queue.
-- Authenticated users shouldn't have direct write access to the raw queue.
create policy "Service role can perform all operations"
  on public.whatsapp_message_queue
  for all to service_role
  using (true)
  with check (true);

-- No policies for authenticated users yet, as this is backend-only infrastructure.

-- Function to claim job
create or replace function public.claim_whatsapp_job(worker_id text, claim_timeout interval)
returns setof public.whatsapp_message_queue as $$
  update public.whatsapp_message_queue
  set
    status = 'processing',
    locked_at = now(),
    locked_by = worker_id,
    updated_at = now()
  where id in (
    select id
    from public.whatsapp_message_queue
    where status in ('queued', 'retrying')
      and available_at <= now()
      and (locked_at is null or locked_at < now() - claim_timeout)
    order by available_at asc
    limit 1
    for update skip locked
  )
  returning *;
$$ language plpgsql security definer;
