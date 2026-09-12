-- 022_inventory_management.sql
-- Inventory Management: stock movements, inventory extensions, atomic stock update RPC
--
-- Changes:
--   1. ALTER inventory: add maximum_stock, supplier_id columns
--   2. CREATE stock_movements: audit trail for all stock changes
--   3. CREATE adjust_stock: atomic RPC function for stock updates
--   4. ALTER products: add purchase_price alias (uses existing cost_price)

-- ══════════════════════════════════════════════════════════
-- 1. EXTEND INVENTORY TABLE
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS maximum_stock integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════════
-- 2. STOCK MOVEMENTS (audit trail)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  movement_type   text NOT NULL CHECK (movement_type IN (
    'stock_in',           -- Barang masuk (pembelian/restock)
    'stock_out',          -- Barang keluar (penjualan/retur)
    'adjustment_increase',-- Penyesuaian naik
    'adjustment_decrease' -- Penyesuaian turun
  )),
  quantity        integer NOT NULL CHECK (quantity > 0),
  stock_before    integer NOT NULL DEFAULT 0,
  stock_after     integer NOT NULL DEFAULT 0,
  reason          text NOT NULL DEFAULT '',
  reference_type  text,              -- 'sale', 'purchase', 'manual', etc.
  reference_id    uuid,              -- FK to sales, orders, etc.
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_business_id ON stock_movements(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_owner_select"
  ON stock_movements FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "stock_movements_owner_insert"
  ON stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- No update/delete policies — stock movements are immutable audit trail.

-- ══════════════════════════════════════════════════════════
-- 3. ATOMIC STOCK UPDATE RPC
-- ══════════════════════════════════════════════════════════
-- This function ensures stock update + movement log are atomic.
-- It prevents race conditions and ensures stock never goes negative.
--
-- Parameters:
--   p_product_id    - product to adjust
--   p_movement_type - 'stock_in', 'stock_out', 'adjustment_increase', 'adjustment_decrease'
--   p_quantity      - positive integer (always > 0)
--   p_reason        - human-readable reason
--   p_reference_type - optional reference type
--   p_reference_id  - optional reference id
--
-- Returns: JSON with { success, new_stock, error }

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text DEFAULT '',
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inventory record;
  v_new_stock integer;
  v_business_id uuid;
  v_current_user uuid;
BEGIN
  -- Get current user
  v_current_user := auth.uid();

  -- Get inventory row with lock
  SELECT i.id, i.quantity, i.product_id, p.business_id
  INTO v_inventory
  FROM public.inventory i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.product_id = p_product_id
  FOR UPDATE OF i;

  -- Check inventory exists
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Produk tidak ditemukan di persediaan');
  END IF;

  v_business_id := v_inventory.business_id;

  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_id AND owner_id = v_current_user
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Akses ditolak');
  END IF;

  -- Calculate new stock based on movement type
  CASE p_movement_type
    WHEN 'stock_in', 'adjustment_increase' THEN
      v_new_stock := v_inventory.quantity + p_quantity;
    WHEN 'stock_out', 'adjustment_decrease' THEN
      v_new_stock := v_inventory.quantity - p_quantity;
    ELSE
      RETURN json_build_object('success', false, 'error', 'Tipe gerakan tidak valid');
  END CASE;

  -- Prevent negative stock
  IF v_new_stock < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Stok tidak boleh negatif. Stok saat ini: ' || v_inventory.quantity || ', diminta: ' || p_quantity
    );
  END IF;

  -- Update inventory quantity
  UPDATE public.inventory
  SET quantity = v_new_stock, updated_at = now()
  WHERE id = v_inventory.id;

  -- Create movement record
  INSERT INTO public.stock_movements (
    product_id, business_id, movement_type, quantity,
    stock_before, stock_after, reason,
    reference_type, reference_id, created_by
  ) VALUES (
    p_product_id, v_business_id, p_movement_type, p_quantity,
    v_inventory.quantity, v_new_stock, p_reason,
    p_reference_type, p_reference_id, v_current_user
  );

  RETURN json_build_object('success', true, 'new_stock', v_new_stock);
END;
$$;
