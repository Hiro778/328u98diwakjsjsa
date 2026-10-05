-- ============================================================
-- 108_fix_create_public_order_overload.sql
-- BisnisSehat: Drop duplicate create_public_order 6-arg overload
-- Resolves PostgREST PGRST203 ambiguity and protects against integer overflow.
-- ============================================================

-- Drop legacy 6-parameter overload from migration 051
DROP FUNCTION IF EXISTS public.create_public_order(uuid, jsonb, text, text, uuid, text);

-- Ensure platform_settings has safe integer value for pos_max_items_per_order
UPDATE public.platform_settings
SET value = '100'::jsonb
WHERE key = 'pos_max_items_per_order' AND (value#>>'{}')::numeric > 2147483647;

NOTIFY pgrst, 'reload schema';
