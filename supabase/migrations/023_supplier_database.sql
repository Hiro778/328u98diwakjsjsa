-- 023_supplier_database.sql
-- Supplier Database: extend suppliers table, add indexes, ensure products.supplier_id
--
-- Changes:
--   1. ALTER suppliers: add supplier_code, contact_person, is_active
--   2. Add indexes on suppliers table
--   3. Ensure products.supplier_id exists (from 022, but verify)

-- ══════════════════════════════════════════════════════════
-- 1. EXTEND SUPPLIERS TABLE
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_code text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Migrate existing 'contact' data to 'contact_person' if contact_person is empty
UPDATE public.suppliers
SET contact_person = contact
WHERE contact_person = '' AND contact != '';

-- ══════════════════════════════════════════════════════════
-- 2. INDEXES
-- ══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_suppliers_business_id ON public.suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_code ON public.suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);

-- Unique constraint: supplier_code must be unique per business (skip empty codes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_code_unique_per_business
  ON public.suppliers(business_id, supplier_code)
  WHERE supplier_code != '';

-- ══════════════════════════════════════════════════════════
-- 3. ENSURE PRODUCTS.SUPPLIER_ID EXISTS
-- ══════════════════════════════════════════════════════════
-- inventory.supplier_id was added in 022. products table does NOT have supplier_id.
-- Supplier-product link is via inventory.supplier_id (per existing design).
-- No changes needed to products table.
