-- ============================================================
-- 047_pos_delete_completed_order.sql
-- Function to securely delete completed orders from POS history
-- Enforces business ownership via auth.uid() and order_status in ('selesai', 'completed')
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_completed_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order_status text;
  v_business_id uuid;
BEGIN
  -- 1. Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi autentikasi tidak ditemukan';
  END IF;

  -- 2. Verify that the order exists and belongs to a business owned by the authenticated user
  SELECT o.order_status, o.business_id
  INTO v_order_status, v_business_id
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id
    AND b.owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order tidak ditemukan atau Anda tidak memiliki hak akses ke pesanan ini';
  END IF;

  -- 3. Strictly verify order status: only completed orders can be deleted
  IF v_order_status NOT IN ('selesai', 'completed') THEN
    RAISE EXCEPTION 'Hanya pesanan berstatus selesai yang dapat dihapus dari riwayat';
  END IF;

  -- 4. Clean up child records to ensure no orphans (also supported by ON DELETE CASCADE)
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.payments WHERE order_id = p_order_id;

  -- 5. Delete the order record
  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN true;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_completed_order(uuid) TO authenticated;
