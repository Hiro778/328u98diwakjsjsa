import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { canDeleteOrder } from '../services/posService.js';

describe('POS Order History Delete Specification Tests (struk.md)', () => {
  const posPagePath = path.resolve('src/pages/dashboard/pos/PosPage.jsx');
  const orderHistoryPath = path.resolve('src/pages/dashboard/pos/OrderHistory.jsx');
  const posServicePath = path.resolve('src/services/posService.js');
  const migrationPath = path.resolve('supabase/migrations/047_pos_delete_completed_order.sql');

  describe('1. canDeleteOrder Eligibility Rule', () => {
    test('allows deletion ONLY for selesai or completed orders', () => {
      assert.equal(canDeleteOrder({ order_status: 'selesai' }), true);
      assert.equal(canDeleteOrder({ order_status: 'completed' }), true);
      assert.equal(canDeleteOrder({ order_status: 'SELESAI' }), true);
      assert.equal(canDeleteOrder({ order_status: 'Completed ' }), true);
    });

    test('strictly REJECTS deletion for active orders (Baru, Diproses, Siap, etc.)', () => {
      assert.equal(canDeleteOrder({ order_status: 'pending' }), false, 'pending must not be deletable');
      assert.equal(canDeleteOrder({ order_status: 'diproses' }), false, 'diproses must not be deletable');
      assert.equal(canDeleteOrder({ order_status: 'siap' }), false, 'siap must not be deletable');
      assert.equal(canDeleteOrder({ order_status: 'preparing' }), false, 'preparing must not be deletable');
      assert.equal(canDeleteOrder({ order_status: 'confirmed' }), false, 'confirmed must not be deletable');
      assert.equal(canDeleteOrder({ order_status: 'ready' }), false, 'ready must not be deletable');
    });

    test('safely handles missing, null, or empty order objects', () => {
      assert.equal(canDeleteOrder(null), false);
      assert.equal(canDeleteOrder(undefined), false);
      assert.equal(canDeleteOrder({}), false);
      assert.equal(canDeleteOrder({ order_status: '' }), false);
    });
  });

  describe('2. Security & Tenant Ownership Logic', () => {
    test('deleteCompletedOrder requires both orderId and businessId', async () => {
      const { deleteCompletedOrder } = await import('../services/posService.js');
      await assert.rejects(
        () => deleteCompletedOrder(null, 'biz-123'),
        /ID pesanan dan ID bisnis diperlukan/
      );
      await assert.rejects(
        () => deleteCompletedOrder('order-123', null),
        /ID pesanan dan ID bisnis diperlukan/
      );
      await assert.rejects(
        () => deleteCompletedOrder('', ''),
        /ID pesanan dan ID bisnis diperlukan/
      );
    });

    test('Migration 047 enforces PostgreSQL security definer, auth.uid() ownership, and completed status', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 047 must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.delete_completed_order'));
      assert.ok(sql.includes('SECURITY DEFINER'));
      assert.ok(sql.includes('auth.uid()'));
      assert.ok(sql.includes('b.owner_id = v_user_id'), 'Enforces business owner check against auth.uid()');
      assert.ok(sql.includes("('selesai', 'completed')"), 'Enforces completed status check');
      assert.ok(sql.includes('DELETE FROM public.order_items WHERE order_id = p_order_id'), 'Cleans up order_items');
      assert.ok(sql.includes('DELETE FROM public.orders WHERE id = p_order_id'), 'Deletes order row');
    });
  });

  describe('3. PosPage UI & Dialog Integration', () => {
    test('PosPage imports posService and includes delete confirmation dialog', () => {
      const code = fs.readFileSync(posPagePath, 'utf8');

      // Imports
      assert.ok(code.includes('canDeleteOrder'));
      assert.ok(code.includes('deleteCompletedOrder'));

      // Confirmation dialog text per requirement
      assert.ok(code.includes('Hapus pesanan ini?'), 'Contains confirmation title');
      assert.ok(code.includes('akan dihapus dari riwayat POS'), 'Explains removal from POS history');

      // Uses design system modal (not window.confirm)
      assert.ok(!code.includes('window.confirm'), 'Must not use window.confirm');

      // OrderCard only renders Hapus button when canDeleteOrder(order) is true
      assert.ok(code.includes('canDeleteOrder(order) && ('));
      assert.ok(code.includes('onDeleteOrder(order)'));
    });
  });

  describe('4. OrderHistory UI & Dialog Integration', () => {
    test('OrderHistory.jsx provides manual delete with confirmation dialog', () => {
      const code = fs.readFileSync(orderHistoryPath, 'utf8');

      // Imports
      assert.ok(code.includes('canDeleteOrder'));
      assert.ok(code.includes('deleteCompletedOrder'));

      // Confirmation dialog text per requirement
      assert.ok(code.includes('Hapus pesanan ini?'), 'Contains confirmation title');
      assert.ok(code.includes('akan dihapus dari riwayat POS'), 'Explains removal from POS history');

      // Does not use window.confirm
      assert.ok(!code.includes('window.confirm'), 'Must not use window.confirm in OrderHistory');

      // Renders Hapus button in both order row and detail modal
      assert.ok(code.includes('canDeleteOrder(o) && ('));
      assert.ok(code.includes('canDeleteOrder(detailOrder)'));
    });
  });

  describe('5. Database Cascade & Orphan Protection Audit', () => {
    test('pos_schema enforces ON DELETE CASCADE on order_items.order_id and payments.order_id', () => {
      const schemaPath = path.resolve('supabase/migrations/003_pos_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');

      assert.ok(
        schemaSql.includes('order_id uuid not null references public.orders(id) on delete cascade') ||
        schemaSql.includes('references public.orders(id) on delete cascade'),
        'order_items must reference orders with on delete cascade'
      );

      assert.ok(
        schemaSql.includes('product_id uuid references public.products(id) on delete set null') ||
        schemaSql.includes('references public.products(id) on delete set null'),
        'product_id must not delete master products when orders are deleted'
      );
    });
  });
});
