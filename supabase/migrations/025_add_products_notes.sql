-- 025_add_products_notes.sql
-- Add missing 'notes' column to products table.
-- The ProductForm component includes a notes field, but the original
-- 001_initial_schema.sql did not define this column.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
