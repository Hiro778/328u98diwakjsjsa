-- ============================================================================
-- Migration 104: Security Lockdown Subscriptions Table (BS-CONF-01)
-- ============================================================================
-- 1. Revoke client mutation privileges (INSERT, UPDATE, DELETE) from anon, authenticated, public
-- 2. Drop vulnerable RLS write policies created in migration 069:
--    - "Users can insert own subscription"
--    - "Users can update own subscription"
--    - "Users can delete own subscription"
-- 3. Maintain strict SELECT policies for own subscription and admin viewing
-- 4. Defense-in-depth: BEFORE INSERT OR UPDATE OR DELETE trigger rejecting direct client execution
-- 5. Harden subscription_payments table against direct client mutations
-- ============================================================================

-- 1. Ensure Row Level Security is enabled and enforced
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- 2. Drop all client-side write policies on public.subscriptions
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can delete own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can modify own subscription" ON public.subscriptions;

-- 3. Revoke table-level mutation privileges from anon, authenticated, and public
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM anon, authenticated, public;
REVOKE ALL ON public.subscriptions FROM anon;
GRANT SELECT ON public.subscriptions TO authenticated;

-- 4. Reassert strict SELECT-only policies on public.subscriptions
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = profile_id)
    AND public.is_account_access_allowed(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can view all subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 5. Harden public.subscription_payments with the same model
DROP POLICY IF EXISTS "Users can insert own subscription payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Users can update own subscription payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Users can delete own subscription payments" ON public.subscription_payments;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscription_payments FROM anon, authenticated, public;
REVOKE ALL ON public.subscription_payments FROM anon;
GRANT SELECT ON public.subscription_payments TO authenticated;

DROP POLICY IF EXISTS "Users can view own subscription payments" ON public.subscription_payments;
CREATE POLICY "Users can view own subscription payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = profile_id)
    AND public.is_account_access_allowed(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can view all subscription payments" ON public.subscription_payments;
CREATE POLICY "Admins can view all subscription payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 6. Defense-in-depth: Database trigger to reject direct client mutations
-- Even if table grants or RLS policies are accidentally modified in the future,
-- this trigger will abort any direct INSERT, UPDATE, or DELETE executed under
-- client roles (anon, authenticated).
CREATE OR REPLACE FUNCTION public.prevent_client_subscription_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'DIRECT_SUBSCRIPTION_MUTATION_FORBIDDEN: Mutasi langsung pada tabel subscriptions dilarang. Hak akses dan perpanjangan paket hanya dapat diproses melalui alur pembayaran atau aktivasi server yang sah.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_subscription_mutation ON public.subscriptions;
CREATE TRIGGER trg_prevent_client_subscription_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_subscription_mutation();

DROP TRIGGER IF EXISTS trg_prevent_client_subscription_payments_mutation ON public.subscription_payments;
CREATE TRIGGER trg_prevent_client_subscription_payments_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_subscription_mutation();

-- 7. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
