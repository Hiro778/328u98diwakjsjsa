-- ============================================================
-- 088_payment_authority_enforcement.sql
-- BisnisSehat: Payment Authority Enforcement (@11.md)
--
-- Aturan bisnis per 11.md:
-- 1. HANYA POS/Kasir yang boleh melakukan perubahan payment_status menjadi LUNAS.
-- 2. Perubahan harus melalui RPC/service server-side (merchant_process_order).
-- 3. Customer tidak boleh mengubah payment_status.
-- 4. Halaman Riwayat Pesanan hanya READ ONLY.
-- 5. Tidak ada duplicate payment record.
-- 6. QRIS flow tetap: BARU -> PROSES (kasir) -> DIPROSES -> SELESAI (kasir) -> SELESAI.
--
-- Server-side enforcement:
-- - RLS orders UPDATE: hanya business owner (merchant) yang boleh update payment_status
-- - confirm_qris_payment tetap memerlukan business ownership via RPC
-- - Customer (public/anon) tidak bisa UPDATE orders secara langsung
-- ============================================================

-- Ensure orders schema compatibility with create_public_order RPC
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_amount numeric(15,2) DEFAULT 0;

-- 1. ENFORCE ORDERS UPDATE RLS
-- Pastikan customers/anonymous tidak bisa langsung update payment_status
-- Hanya authenticated business owner yang bisa update orders mereka
DO $$
BEGIN
  -- Drop existing update policies if they are too permissive
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'orders_merchant_update'
  ) THEN
    DROP POLICY "orders_merchant_update" ON public.orders;
  END IF;
END $$;

-- Recreate strict merchant-only update policy on orders
-- Only the authenticated business owner can update their business's orders
CREATE POLICY "orders_merchant_update" ON public.orders
FOR UPDATE TO authenticated
USING (
  business_id IN (
    SELECT id FROM public.businesses
    WHERE owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  business_id IN (
    SELECT id FROM public.businesses
    WHERE owner_id = (SELECT auth.uid())
  )
);

-- 2. ENSURE NO PUBLIC/ANON UPDATE ON ORDERS
-- Block any anon or public UPDATE on orders table
-- (Public can only SELECT per orders_public_select policy)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'orders_public_update'
  ) THEN
    DROP POLICY "orders_public_update" ON public.orders;
  END IF;
END $$;

-- 3. ENSURE NO PUBLIC/ANON UPDATE ON PAYMENTS
-- payments table should only be writable through server-side RPC (SECURITY DEFINER)
-- No customer/public access to INSERT or UPDATE payments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payments' AND policyname = 'payments_public_insert'
  ) THEN
    DROP POLICY "payments_public_insert" ON public.payments;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payments' AND policyname = 'payments_public_update'
  ) THEN
    DROP POLICY "payments_public_update" ON public.payments;
  END IF;
END $$;

-- 4. COMMENT: Document the payment authority rules per 11.md
COMMENT ON FUNCTION public.merchant_process_order(uuid)
IS 'PAYMENT AUTHORITY (11.md): Satu-satunya jalur sah untuk konfirmasi pembayaran QRIS dan transisi order ke DIPROSES. Hanya dipanggil oleh POS/Kasir. Termasuk validasi ownership bisnis, idempotency, dan atomic update.';

COMMENT ON FUNCTION public.merchant_complete_order(uuid)
IS 'PAYMENT AUTHORITY (11.md): Satu-satunya jalur sah untuk menyelesaikan pesanan (SELESAI). Hanya dipanggil oleh POS/Kasir. Termasuk validasi ownership bisnis.';

-- 5. NOTIFY schema reload
NOTIFY pgrst, 'reload schema';
