import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPosOrder } from '../services/posService.js';

describe('POS Checkout Idempotency & Order Atomicity Specification (fix.md)', () => {
  const migrationPath = path.resolve('supabase/migrations/055_pos_checkout_idempotency.sql');
  const posServicePath = path.resolve('src/services/posService.js');
  const posPagePath = path.resolve('src/pages/dashboard/pos/PosPage.jsx');

  describe('1. Migration 055 Database Schema & RPC Verification', () => {
    test('Migration 055 exists and defines checkout_request_id column and unique partial index', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 055 must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Checks for checkout_request_id column addition
      assert.ok(
        sql.includes('checkout_request_id text'),
        'Must add checkout_request_id text column to orders'
      );

      // Checks for unique index per business_id and checkout_request_id
      assert.ok(
        sql.includes('idx_orders_business_checkout_request_id'),
        'Must create unique index on (business_id, checkout_request_id)'
      );
      assert.ok(
        sql.includes('UNIQUE INDEX') || sql.includes('unique index'),
        'Index must be UNIQUE'
      );
    });

    test('Migration 055 defines atomic create_pos_order RPC with tenant verification', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(
        sql.includes('CREATE OR REPLACE FUNCTION public.create_pos_order'),
        'Must create create_pos_order RPC'
      );
      assert.ok(
        sql.includes('SECURITY DEFINER'),
        'RPC must be SECURITY DEFINER to handle atomic transactions safely'
      );
      assert.ok(
        sql.includes('auth.uid()'),
        'RPC must verify auth.uid() matches business owner'
      );
      assert.ok(
        sql.includes('Pelanggaran isolasi tenant') || sql.includes('tidak memiliki hak akses'),
        'RPC must enforce strict tenant isolation'
      );
      assert.ok(
        sql.includes('order_items'),
        'RPC must insert order items atomically'
      );
    });
  });

  describe('2. createPosOrder Input Validation & Domain Safeguards', () => {
    test('strictly rejects empty or missing businessId', async () => {
      await assert.rejects(
        () => createPosOrder({ businessId: null, items: [{ product_id: 'p1', quantity: 1 }] }),
        /business_id diperlukan/
      );
      await assert.rejects(
        () => createPosOrder({ businessId: '', items: [{ product_id: 'p1', quantity: 1 }] }),
        /business_id diperlukan/
      );
    });

    test('strictly rejects empty or missing cart items', async () => {
      await assert.rejects(
        () => createPosOrder({ businessId: 'biz-1', items: [] }),
        /Keranjang pesanan tidak boleh kosong/
      );
      await assert.rejects(
        () => createPosOrder({ businessId: 'biz-1', items: null }),
        /Keranjang pesanan tidak boleh kosong/
      );
    });
  });

  describe('3. PosPage UI Integration Verification', () => {
    test('PosPage imports and uses createPosOrder instead of broken direct order_items insert', () => {
      assert.ok(fs.existsSync(posPagePath), 'PosPage.jsx must exist');
      const posPageSrc = fs.readFileSync(posPagePath, 'utf8');

      // Must import createPosOrder
      assert.ok(
        posPageSrc.includes('createPosOrder'),
        'PosPage must import createPosOrder from posService'
      );

      // Must NOT directly insert order_items into orders table (PGRST204 root cause)
      assert.ok(
        !posPageSrc.includes("order_items: validatedItems"),
        'PosPage must not insert order_items directly into orders table'
      );

      // Must use checkoutRequestIdRef for idempotency
      assert.ok(
        posPageSrc.includes('checkoutRequestIdRef'),
        'PosPage must manage checkoutRequestIdRef'
      );

      // Must preserve cart on error
      assert.ok(
        posPageSrc.includes('try {') && posPageSrc.includes('setProcessingOrder(false)'),
        'PosPage must handle errors in try-catch-finally'
      );
    });
  });
});
