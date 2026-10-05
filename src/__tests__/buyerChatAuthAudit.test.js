import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Buyer Public Order Chat Authorization Boundary Audit', () => {
  const mig80 = fs.readFileSync(path.resolve('supabase/migrations/080_order_processing_and_chat.sql'), 'utf-8')
  const mig82 = fs.readFileSync(path.resolve('supabase/migrations/082_qris_and_order_security_hardening.sql'), 'utf-8')
  const mig103 = fs.readFileSync(path.resolve('supabase/migrations/103_fix_bidirectional_order_chat.sql'), 'utf-8')

  it('1 & 2. Attacker with valid guessed UUID: Authorization boundary in RPC/RLS', () => {
    // Audit get_order_messages:
    // It verifies order exists, order_source = 'qr_menu', created_at >= now() - 24h.
    // If caller has only order UUID, can they read?
    // In guest QR model, order UUID IS the access credential.
    // Test that non-qr_menu orders are strictly forbidden from anon.
    assert.ok(mig82.includes("v_order.order_source = 'qr_menu'"), 'get_order_messages requires qr_menu')
    assert.ok(mig82.includes("created_at >= (now() - interval '24 hours')"), 'get_order_messages enforces 24h window')
  })

  it('3. Modifying order_id in request: Target order must exist and be valid', () => {
    assert.ok(mig103.includes("RAISE EXCEPTION 'ORDER_NOT_FOUND"), 'Invalid order_id is rejected with ORDER_NOT_FOUND')
  })

  it('4. Modifying business_id: send_order_message derives business_id strictly from orders table, NOT client request', () => {
    // In send_order_message:
    // INSERT INTO order_messages (..., business_id, ...) VALUES (..., v_order.business_id, ...)
    assert.ok(mig103.includes('v_order.business_id'), 'business_id is strictly derived from orders row, never trusted from client')
    assert.ok(!mig103.includes('p_business_id'), 'p_business_id parameter does NOT exist in send_order_message RPC')
  })

  it('5. Modifying customer name / anti-spoofing: Customer cannot claim role Penjual, Merchant, Admin, Kasir, Sistem', () => {
    assert.ok(mig103.includes("lower(v_clean_name) IN ('penjual', 'merchant', 'admin', 'bisnissehat', 'sistem', 'kasir')"), 'Anti-spoofing checks privileged names')
  })

  it('6. Bypass 24-hour window: Enforced strictly in database', () => {
    assert.ok(mig103.includes("v_order.created_at < (now() - interval '24 hours')"), 'Rejects orders older than 24h in RPC')
    assert.ok(mig103.includes("o.created_at >= (now() - interval '24 hours')"), 'Rejects orders older than 24h in RLS')
  })

  it('7. Send after completed / cancelled: Chat is closed strictly in database', () => {
    assert.ok(mig103.includes("v_order.order_status IN ('selesai', 'completed')"), 'Rejects selesai/completed orders')
    assert.ok(mig103.includes("v_order.order_status IN ('dibatalkan', 'cancelled')"), 'Rejects dibatalkan/cancelled orders')
    assert.ok(mig103.includes("RAISE EXCEPTION 'CHAT_CLOSED"), 'Throws CHAT_CLOSED exception')
  })

  it('8. Access an unpublished business order: Strictly blocked', () => {
    // Check businesses JOIN and is_menu_published
    assert.ok(mig103.includes('JOIN public.businesses b ON b.id = o.business_id'), 'orders joined with businesses')
    assert.ok(mig103.includes('b.is_menu_published = true'), 'RLS checks is_menu_published = true')
  })

  it('9. Access another business order: Authenticated caller from Business B cannot send or read Business A chat', () => {
    assert.ok(mig103.includes('v_caller_id IS NOT NULL AND v_caller_id <> v_order.owner_id'), 'Cross-business authenticated injection is blocked')
    assert.ok(mig82.includes('v_caller_id IS NOT NULL THEN\n    IF v_order.owner_id <> v_caller_id THEN\n      RAISE EXCEPTION \'FORBIDDEN'), 'Cross-business read is blocked')
  })

  it('10. Replay old buyer session (>24h): Denied by 24h window and completed/cancelled checks', () => {
    assert.ok(mig103.includes("created_at < (now() - interval '24 hours')"), 'Replay after 24h is denied')
  })
})
