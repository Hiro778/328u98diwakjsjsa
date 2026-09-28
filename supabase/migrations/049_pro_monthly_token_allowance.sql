-- ============================================================
-- 049_pro_monthly_token_allowance.sql
-- BisnisSehat - Creative Studio 200 Pro Monthly Token Allowance
-- Conforms strictly to ai.md specifications
-- ============================================================

-- Constants:
-- CREATIVE_GENERATION_COST = 20
-- PRO_MONTHLY_ALLOWANCE = 200

create or replace function public.grant_pro_monthly_allowance_atomic(
  p_business_id uuid,
  p_subscription_id uuid,
  p_period_start text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_pro boolean;
  v_idempotency_key text;
  v_already_granted boolean;
  v_available integer;
  v_total_earned integer;
  v_new_balance integer;
  c_allowance_amount constant integer := 200;
begin
  -- 1. Validate subscription exists, belongs to business owner, and is active Pro
  select exists (
    select 1
    from public.subscriptions s
    join public.businesses b on b.owner_id = s.profile_id
    where b.id = p_business_id
      and s.id = p_subscription_id
      and s.plan = 'pro'
      and s.status = 'active'
      and s.expires_at > now()
  ) into v_is_pro;

  if not v_is_pro then
    return jsonb_build_object(
      'success', false,
      'error', 'PRO_SUBSCRIPTION_REQUIRED',
      'granted', 0
    );
  end if;

  -- 2. Build deterministic idempotency key for this subscription & billing period
  v_idempotency_key := 'PRO_ALLOWANCE:' || p_subscription_id::text || ':' || p_period_start;

  -- 3. Check if already granted for this period
  select exists (
    select 1 from public.credit_ledger
    where idempotency_key = v_idempotency_key
  ) into v_already_granted;

  if v_already_granted then
    return jsonb_build_object(
      'success', true,
      'granted', 0,
      'already_granted', true,
      'message', 'Allowance already granted for this billing period'
    );
  end if;

  -- 4. Row-level lock on creative_credits for atomic grant
  select available, total_earned into v_available, v_total_earned
  from public.creative_credits
  where business_id = p_business_id
  for update;

  if not found then
    insert into public.creative_credits (business_id, available, consumed, total_earned)
    values (p_business_id, c_allowance_amount, 0, c_allowance_amount)
    returning available, total_earned into v_available, v_total_earned;
    v_new_balance := c_allowance_amount;
  else
    v_new_balance := v_available + c_allowance_amount;
    update public.creative_credits
    set available = v_new_balance,
        total_earned = v_total_earned + c_allowance_amount,
        updated_at = now()
    where business_id = p_business_id;
  end if;

  -- 5. Record immutable entry in credit_ledger with unique idempotency key
  insert into public.credit_ledger (
    business_id,
    type,
    credits,
    balance_after,
    reference_type,
    reference_id,
    description,
    idempotency_key
  ) values (
    p_business_id,
    'MONTHLY_ALLOWANCE',
    c_allowance_amount,
    v_new_balance,
    'subscription',
    p_subscription_id,
    'Pro monthly allowance (200 tokens)',
    v_idempotency_key
  )
  on conflict (idempotency_key) do nothing;

  if not found then
    -- Concurrent call already inserted, rollback the balance increment
    update public.creative_credits
    set available = v_available,
        total_earned = v_total_earned
    where business_id = p_business_id;

    return jsonb_build_object(
      'success', true,
      'granted', 0,
      'already_granted', true,
      'message', 'Allowance already granted by concurrent request'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'granted', c_allowance_amount,
    'balance_after', v_new_balance,
    'idempotency_key', v_idempotency_key
  );
end;
$$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
