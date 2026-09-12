-- Migration 025: Add notes column to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

-- Verify
SELECT 'products.notes' as check_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='notes') as exists_now;

SELECT 'inventory.maximum_stock' as check_name,
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='maximum_stock') as exists_now;

SELECT 'inventory.supplier_id' as check_name,
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='supplier_id') as exists_now;

SELECT 'stock_movements' as check_name,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='stock_movements') as exists_now;

SELECT 'adjust_stock' as check_name,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname='adjust_stock') as exists_now;
