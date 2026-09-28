-- ============================================================
-- 065_admin_business_management.sql
-- BisnisSehat - Tahap 4: Business Management & Tenant Control
-- Conforms strictly to @admin.md Section 26, 27, 43
-- ============================================================

-- 1. Server-side RPC: get_admin_businesses (Search, Filter, Sort, Paginate)
create or replace function public.get_admin_businesses(
  p_search text default null,
  p_plan_filter text default 'all',
  p_status_filter text default 'all',
  p_sort_by text default 'newest',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_adm boolean;
  v_businesses jsonb;
  v_total_count bigint;
begin
  -- 1. Enforce strict server-side authorization
  v_is_adm := public.is_admin();
  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can query business management' using errcode = '42501';
  end if;

  -- 2. Filter & Query CTE
  with biz_data as (
    select
      b.id,
      b.name,
      b.owner_id,
      coalesce(nullif(b.business_type, ''), 'UMKM') as business_type,
      coalesce(nullif(b.business_category, ''), 'Umum') as business_category,
      coalesce(b.location, '') as location,
      b.is_active,
      b.is_menu_published,
      b.logo_url,
      b.cover_url,
      b.created_at,
      b.updated_at,
      -- Owner Profile
      p.email as owner_email,
      coalesce(nullif(p.full_name, ''), p.email) as owner_name,
      p.avatar_url as owner_avatar,
      p.status as owner_status,
      -- Subscription Plan of Owner
      case
        when s.plan = 'pro' and s.status = 'active' and (s.expires_at is null or s.expires_at > now()) then 'Pro'
        else 'Free'
      end as plan,
      s.status as subscription_status,
      s.expires_at as subscription_expires_at,
      -- Products Count
      coalesce((select count(*) from public.products pr where pr.business_id = b.id), 0) as products_count,
      -- Orders Count & Volume
      coalesce((select count(*) from public.orders o where o.business_id = b.id), 0) as orders_count,
      coalesce((select sum(total) from public.orders o where o.business_id = b.id and (o.order_status = 'completed' or o.payment_status in ('settlement', 'paid'))), 0) as total_revenue,
      -- AI Credits
      coalesce(cc.consumed, 0) as ai_credits_used,
      coalesce(cc.available, 0) as ai_credits_remaining
    from public.businesses b
    left join public.profiles p on p.id = b.owner_id
    left join lateral (
      select plan, status, expires_at from public.subscriptions sub
      where sub.profile_id = b.owner_id
      order by created_at desc
      limit 1
    ) s on true
    left join lateral (
      select consumed, available from public.creative_credits cred
      where cred.business_id = b.id
      limit 1
    ) cc on true
    where
      -- Search filter
      (
        p_search is null
        or trim(p_search) = ''
        or b.name ilike '%' || trim(p_search) || '%'
        or b.id::text ilike '%' || trim(p_search) || '%'
        or coalesce(p.email, '') ilike '%' || trim(p_search) || '%'
        or coalesce(p.full_name, '') ilike '%' || trim(p_search) || '%'
      )
      -- Plan Filter
      and (
        p_plan_filter = 'all'
        or (p_plan_filter = 'pro' and s.plan = 'pro' and s.status = 'active' and (s.expires_at is null or s.expires_at > now()))
        or (p_plan_filter = 'free' and not (s.plan = 'pro' and s.status = 'active' and (s.expires_at is null or s.expires_at > now())))
      )
      -- Status Filter (Active vs Inactive)
      and (
        p_status_filter = 'all'
        or (p_status_filter = 'active' and b.is_active = true)
        or (p_status_filter = 'inactive' and b.is_active = false)
      )
  )
  select
    coalesce(jsonb_agg(d), '[]'::jsonb),
    count(*)
  into v_businesses, v_total_count
  from (
    select * from biz_data
    order by
      case when p_sort_by = 'newest' then created_at end desc,
      case when p_sort_by = 'oldest' then created_at end asc,
      case when p_sort_by = 'most_products' then products_count end desc,
      case when p_sort_by = 'most_orders' then orders_count end desc,
      case when p_sort_by = 'highest_ai' then ai_credits_used end desc,
      created_at desc
    limit p_limit
    offset p_offset
  ) d;

  return jsonb_build_object(
    'businesses', v_businesses,
    'total_count', v_total_count
  );
end;
$$;

-- 2. Server-side RPC: get_admin_business_detail (Composite 7 modular sections)
create or replace function public.get_admin_business_detail(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_adm boolean;
  v_biz record;
  v_owner jsonb;
  v_subscription jsonb;
  v_products jsonb;
  v_orders jsonb;
  v_ai_usage jsonb;
  v_support jsonb;
  v_audit_logs jsonb;
begin
  -- 1. Authorization Check
  v_is_adm := public.is_admin();
  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can view business details' using errcode = '42501';
  end if;

  -- 2. Business Info
  select
    b.id,
    b.owner_id,
    b.name,
    b.description,
    b.industry,
    b.location,
    b.is_active,
    b.created_at,
    b.updated_at,
    coalesce(nullif(b.business_type, ''), 'UMKM') as business_type,
    coalesce(nullif(b.business_category, ''), 'Umum') as business_category,
    b.business_focus,
    b.is_menu_published,
    b.slogan,
    b.cover_url,
    b.logo_url
  into v_biz
  from public.businesses b
  where b.id = p_business_id;

  if v_biz.id is null then
    return jsonb_build_object('error', 'BUSINESS_NOT_FOUND');
  end if;

  -- 3. Owner Profile
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'name', coalesce(nullif(p.full_name, ''), p.email),
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'status', p.status,
    'created_at', p.created_at,
    'last_active', coalesce(p.last_active_at, p.updated_at, p.created_at)
  ) into v_owner
  from public.profiles p
  where p.id = v_biz.owner_id;

  -- 4. Subscription of Business Owner
  select jsonb_build_object(
    'id', s.id,
    'plan', s.plan,
    'status', s.status,
    'start_date', s.created_at,
    'expiry_date', s.expires_at,
    'payment_status', coalesce(
      (select payment_status from public.subscription_payments where profile_id = v_biz.owner_id order by created_at desc limit 1),
      'none'
    )
  ) into v_subscription
  from public.subscriptions s
  where s.profile_id = v_biz.owner_id
  order by s.created_at desc
  limit 1;

  -- 5. Products Overview
  select jsonb_build_object(
    'total_count', count(*),
    'active_count', count(*) filter (where coalesce(is_available, true) = true),
    'recent_items', coalesce(
      (
        select jsonb_agg(pr)
        from (
          select id, name, unit_price as price, is_available, created_at
          from public.products
          where business_id = p_business_id
          order by created_at desc
          limit 5
        ) pr
      ),
      '[]'::jsonb
    )
  ) into v_products
  from public.products
  where business_id = p_business_id;

  -- 6. Orders & POS Overview
  select jsonb_build_object(
    'total_orders', count(*),
    'total_revenue', coalesce(sum(total) filter (where order_status = 'completed' or payment_status in ('settlement', 'paid')), 0),
    'recent_orders', coalesce(
      (
        select jsonb_agg(od)
        from (
          select id, total as total_amount, coalesce(nullif(order_status, ''), payment_status, 'pending') as status, created_at
          from public.orders
          where business_id = p_business_id
          order by created_at desc
          limit 5
        ) od
      ),
      '[]'::jsonb
    )
  ) into v_orders
  from public.orders
  where business_id = p_business_id;

  -- 7. AI Usage
  select jsonb_build_object(
    'total_credits', coalesce(cc.total_earned, 0),
    'used_credits', coalesce(cc.consumed, 0),
    'remaining_credits', coalesce(cc.available, 0),
    'requests_total', coalesce(gen.total_req, 0)
  ) into v_ai_usage
  from (select 1) dummy
  left join public.creative_credits cc on cc.business_id = p_business_id
  left join lateral (
    select count(*) as total_req
    from public.creative_generations
    where business_id = p_business_id
  ) gen on true;

  -- 8. Support Tickets
  select jsonb_build_object(
    'total_tickets', count(*),
    'open_tickets', count(*) filter (where status in ('new', 'in_progress', 'waiting_user')),
    'resolved_tickets', count(*) filter (where status in ('resolved', 'closed'))
  ) into v_support
  from public.support_tickets
  where business_id = p_business_id or user_id = v_biz.owner_id;

  -- 9. Relevant Audit Logs for this Business
  select coalesce(jsonb_agg(al), '[]'::jsonb) into v_audit_logs
  from (
    select
      id,
      admin_id,
      action,
      reason,
      metadata,
      created_at
    from public.admin_audit_logs
    where (target_type = 'business' and target_id = p_business_id::text)
       or (target_type = 'user' and target_id = v_biz.owner_id::text)
    order by created_at desc
    limit 10
  ) al;

  return jsonb_build_object(
    'business', to_jsonb(v_biz),
    'owner', v_owner,
    'subscription', v_subscription,
    'products', v_products,
    'orders', v_orders,
    'ai_usage', v_ai_usage,
    'support', v_support,
    'audit_logs', v_audit_logs
  );
end;
$$;

-- 3. Server-side Action RPC: admin_update_business_status (Toggle is_active with audit log)
create or replace function public.admin_update_business_status(
  p_business_id uuid,
  p_is_active boolean,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_is_adm boolean;
  v_current_active boolean;
  v_action text;
begin
  -- 1. Authorization Check
  v_is_adm := public.is_admin();
  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can modify business status' using errcode = '42501';
  end if;

  -- 2. Validate target business exists
  select is_active into v_current_active
  from public.businesses
  where id = p_business_id;

  if not found then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;

  -- 3. Determine action
  if p_is_active then
    v_action := 'BUSINESS_ACTIVATED';
  else
    v_action := 'BUSINESS_DEACTIVATED';
  end if;

  -- Mandatory reason for deactivation
  if not p_is_active and (p_reason is null or trim(p_reason) = '') then
    raise exception 'Alasan penonaktifan bisnis wajib diisi untuk catatan Audit Log' using errcode = '22023';
  end if;

  -- 4. Update Business Status
  update public.businesses
  set
    is_active = p_is_active,
    updated_at = now()
  where id = p_business_id;

  -- 5. Insert Immutable Audit Log
  insert into public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata
  ) values (
    v_admin_id,
    v_action,
    'business',
    p_business_id::text,
    coalesce(p_reason, ''),
    jsonb_build_object(
      'previous_is_active', v_current_active,
      'new_is_active', p_is_active
    )
  );

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'business_id', p_business_id,
    'is_active', p_is_active
  );
end;
$$;

-- Reload schema
notify pgrst, 'reload schema';
