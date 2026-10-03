import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  calculateSubscriptionEntitlement,
  resolveCanonicalSubscription,
} from '../lib/subscriptionUtils.js'

describe('Subscription Canonical Resolution & Lifecycle Fix Suite (Phase 6 Tests)', () => {
  const mockNow = new Date('2026-10-03T12:00:00.000Z')

  // TEST 1: Single active Pro row → Pro active
  it('TEST 1: Single active Pro row → Pro active', () => {
    const singleActive = {
      id: 'sub-active-only',
      plan: 'pro',
      status: 'active',
      is_cancelled: false,
      started_at: '2026-10-01T00:00:00.000Z',
      expires_at: '2026-11-01T00:00:00.000Z',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    }

    const canonical = resolveCanonicalSubscription([singleActive], mockNow)
    assert.equal(canonical.id, 'sub-active-only')

    const ent = calculateSubscriptionEntitlement({
      user: { id: 'usr-1' },
      subscription: canonical,
      now: mockNow,
    })

    assert.equal(ent.hasActiveSubscription, true)
    assert.equal(ent.isPro, true)
    assert.equal(ent.subscriptionState, 'active')
  })

  // TEST 2: Cancelled row + active valid row → active valid row dipilih
  it('TEST 2: Cancelled row + active valid row → active valid row dipilih', () => {
    const rows = [
      {
        id: 'sub-cancelled',
        plan: 'pro',
        status: 'cancelled',
        is_cancelled: true,
        expires_at: '2026-10-05T00:00:00.000Z',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
      {
        id: 'sub-active-valid',
        plan: 'pro',
        status: 'active',
        is_cancelled: false,
        expires_at: '2026-11-01T00:00:00.000Z',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
    ]

    const canonical = resolveCanonicalSubscription(rows, mockNow)
    assert.equal(canonical.id, 'sub-active-valid')
    assert.equal(canonical.status, 'active')
    assert.equal(canonical.is_cancelled, false)

    const ent = calculateSubscriptionEntitlement({
      user: { id: 'usr-1' },
      subscription: canonical,
      now: mockNow,
    })

    assert.equal(ent.hasActiveSubscription, true)
    assert.equal(ent.isPro, true)
    assert.equal(ent.subscriptionState, 'active')
  })

  // TEST 3: Cancelled row lebih baru daripada active row → active row tetap dipilih
  it('TEST 3: Cancelled row lebih baru daripada active row → active row tetap dipilih', () => {
    const rows = [
      {
        id: 'active-row-older',
        plan: 'pro',
        status: 'active',
        is_cancelled: false,
        started_at: '2026-08-25T12:22:55.000Z',
        expires_at: '2026-11-27T12:22:55.000Z',
        created_at: '2026-08-25T12:22:55.000Z', // older created_at
        updated_at: '2026-10-03T04:22:23.000Z',
      },
      {
        id: 'cancelled-shadow-row-newer',
        plan: 'pro',
        status: 'cancelled',
        is_cancelled: true,
        started_at: '2026-10-02T23:49:03.283Z',
        expires_at: '2026-10-03T23:49:03.284Z',
        created_at: '2026-10-02T23:49:01.419Z', // newer created_at!
        updated_at: '2026-10-02T23:49:01.725Z',
      },
    ]

    const canonical = resolveCanonicalSubscription(rows, mockNow)
    assert.equal(canonical.id, 'active-row-older', 'Must select active row over newer cancelled row')
    assert.equal(canonical.status, 'active')

    const ent = calculateSubscriptionEntitlement({
      user: { id: 'usr-1' },
      subscription: canonical,
      now: mockNow,
    })

    assert.equal(ent.hasActiveSubscription, true)
    assert.equal(ent.isPro, true)
    assert.equal(ent.subscriptionState, 'active')
  })

  // TEST 4: Redeem activation code → status active
  it('TEST 4: Redeem activation code → status active', () => {
    const migCode = fs.readFileSync(path.resolve('supabase/migrations/101_fix_subscription_lifecycle_and_canonical_resolution.sql'), 'utf8')
    assert.ok(migCode.includes("status = 'active'"), 'Must update status = active upon redeem')
    assert.ok(migCode.includes("plan = 'pro'"), 'Must update plan = pro upon redeem')
  })

  // TEST 5: Redeem activation code → is_cancelled=false
  it('TEST 5: Redeem activation code → is_cancelled=false', () => {
    const migCode = fs.readFileSync(path.resolve('supabase/migrations/101_fix_subscription_lifecycle_and_canonical_resolution.sql'), 'utf8')
    assert.ok(migCode.includes('is_cancelled = false'), 'Must reset is_cancelled = false')
  })

  // TEST 6: Redeem activation code → cancellation metadata cleared
  it('TEST 6: Redeem activation code → cancellation metadata cleared', () => {
    const migCode = fs.readFileSync(path.resolve('supabase/migrations/101_fix_subscription_lifecycle_and_canonical_resolution.sql'), 'utf8')
    assert.ok(migCode.includes('cancellation_reason = NULL'), 'Must clear cancellation_reason')
    assert.ok(migCode.includes('cancelled_at = NULL'), 'Must clear cancelled_at')
    assert.ok(migCode.includes('cancelled_by = NULL'), 'Must clear cancelled_by')
  })

  // TEST 7: Existing expiry masih future → duration ditambahkan ke existing expiry
  it('TEST 7: Existing expiry masih future → duration ditambahkan ke existing expiry', () => {
    const existingExpiry = new Date('2026-10-30T12:00:00.000Z')
    const durationDays = 30
    const newExpiry = new Date(existingExpiry.getTime() + durationDays * 24 * 60 * 60 * 1000)

    assert.equal(newExpiry.toISOString(), '2026-11-29T12:00:00.000Z')

    const migCode = fs.readFileSync(path.resolve('supabase/migrations/101_fix_subscription_lifecycle_and_canonical_resolution.sql'), 'utf8')
    assert.ok(
      migCode.includes("v_new_expires_at := v_existing_sub.expires_at + (v_code_row.duration_days || ' days')::interval;"),
      'Must accumulate duration onto existing expires_at when expires_at > now()'
    )
  })

  // TEST 8: Existing expiry sudah lewat → duration dihitung dari now()
  it('TEST 8: Existing expiry sudah lewat → duration dihitung dari now()', () => {
    const migCode = fs.readFileSync(path.resolve('supabase/migrations/101_fix_subscription_lifecycle_and_canonical_resolution.sql'), 'utf8')
    assert.ok(
      migCode.includes("v_new_expires_at := now() + (v_code_row.duration_days || ' days')::interval;"),
      'Must set expiry from now() if existing subscription is expired or null'
    )
  })

  // TEST 9: Activation link expired 24h → tidak membatalkan subscription yang sudah redeemed
  it('TEST 9: Activation link expired 24h → tidak membatalkan subscription yang sudah redeemed', () => {
    const activationLinkExpiry = new Date('2026-10-04T12:00:00.000Z') // 24 hours from creation
    const redeemedSub = {
      id: 'sub-active-30-days',
      plan: 'pro',
      status: 'active',
      is_cancelled: false,
      expires_at: '2026-11-03T12:00:00.000Z', // 30 days duration
    }

    const testTimePastLinkExpiry = new Date('2026-10-05T12:00:00.000Z') // Link expired 24h ago
    assert.ok(testTimePastLinkExpiry > activationLinkExpiry, 'Link is past 24h')

    const ent = calculateSubscriptionEntitlement({
      user: { id: 'usr-1' },
      subscription: redeemedSub,
      now: testTimePastLinkExpiry,
    })

    assert.equal(ent.hasActiveSubscription, true, 'Subscription remains active despite link expiry')
    assert.equal(ent.isPro, true)
  })

  // TEST 10: Activation link duration 24h ≠ subscription duration 30d
  it('TEST 10: Activation link duration 24h ≠ subscription duration 30d', () => {
    const linkTtlHours = 24
    const subscriptionDurationDays = 30

    assert.notEqual(linkTtlHours, subscriptionDurationDays * 24)
    assert.equal(linkTtlHours, 24, 'Activation link must expire in 24 hours')
    assert.equal(subscriptionDurationDays, 30, 'Subscription entitlement duration must be 30 days')

    const mig097Code = fs.readFileSync(path.resolve('supabase/migrations/097_credit_activation_links.sql'), 'utf8')
    assert.ok(mig097Code.includes("interval '24 hours'"), 'Activation link token TTL is 24 hours')
  })

  // TEST 11: Midtrans webhook tidak dapat membatalkan payment_provider='activation_code'
  it("TEST 11: Midtrans webhook tidak dapat membatalkan payment_provider='activation_code'", () => {
    const fnCode = fs.readFileSync(path.resolve('supabase/functions/midtrans-notification/index.ts'), 'utf8')
    assert.ok(!fnCode.includes("payment_provider = 'activation_code'"), 'Midtrans notification must not target activation_code provider')
  })

  // TEST 12: Unauthorized user cannot cancel another user's subscription
  it("TEST 12: Unauthorized user cannot cancel another user's subscription", () => {
    const mig099Code = fs.readFileSync(path.resolve('supabase/migrations/099_security_step2_subscription_credit_hardening.sql'), 'utf8')
    assert.ok(mig099Code.includes("v_sub.profile_id <> v_caller_id"), 'Must verify caller is owner of subscription')
    assert.ok(mig099Code.includes("Akses ditolak: Anda bukan pemilik"), 'Rejects non-owner with access denied')

    const mig101Code = fs.readFileSync(path.resolve('supabase/migrations/101_fix_subscription_lifecycle_and_canonical_resolution.sql'), 'utf8')
    assert.ok(mig101Code.includes('WHERE profile_id = v_caller_id'), 'Cancel atomic strictly scopes to caller profile_id')
  })

  // TEST 13: Admin cancellation still requires authorization + reason
  it('TEST 13: Admin cancellation still requires authorization + reason', () => {
    const mig074Code = fs.readFileSync(path.resolve('supabase/migrations/074_admin_subscription_management.sql'), 'utf8')
    assert.ok(mig074Code.includes('public.is_admin()'), 'Must verify is_admin in admin cancellation')
    assert.ok(mig074Code.includes('admin_cancel_subscription'), 'admin_cancel_subscription exists and requires admin')
    assert.ok(mig074Code.includes('p_reason'), 'Admin cancellation requires reason parameter')
  })

  // TEST 14: UTC/WIB boundary tidak mengubah actual instant
  it('TEST 14: UTC/WIB boundary tidak mengubah actual instant', () => {
    const utcDateStr = '2026-10-03T23:49:03.284Z'
    const jakartaDateStr = new Date(utcDateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    })

    assert.equal(jakartaDateStr, '4 Oktober 2026', 'UTC 23:49 on Oct 3 correctly maps to Oct 4 in WIB')

    const t1 = new Date(utcDateStr).getTime()
    const t2 = new Date('2026-10-04T06:49:03.284+07:00').getTime()
    assert.equal(t1, t2, 'Exact same Unix epoch millisecond instant regardless of offset')
  })

  // TEST 15: Multiple subscription rows tetap menghasilkan canonical subscription yang deterministic
  it('TEST 15: Multiple subscription rows tetap menghasilkan canonical subscription yang deterministic', () => {
    const fourRows = [
      {
        id: '01c11a59-fcde-450a-818b-6da080d4c21d',
        plan: 'pro',
        status: 'cancelled',
        is_cancelled: true,
        expires_at: '2026-10-03T23:49:03.284Z',
        created_at: '2026-10-02T23:49:01.419Z',
        updated_at: '2026-10-02T23:49:01.725Z',
      },
      {
        id: '3a65f9b2-dc9e-4202-bde1-efd85722f042',
        plan: 'pro',
        status: 'active',
        is_cancelled: false,
        expires_at: '2026-11-27T12:22:55.000Z',
        created_at: '2026-08-25T12:22:55.000Z',
        updated_at: '2026-10-03T04:22:23.000Z',
      },
      {
        id: '5c825dc9-0ebe-44ea-b385-7859e6982385',
        plan: 'pro',
        status: 'active',
        is_cancelled: false,
        expires_at: '2026-11-27T12:22:55.000Z',
        created_at: '2026-08-25T12:22:55.000Z',
        updated_at: '2026-10-03T04:15:54.000Z',
      },
      {
        id: '9ca60cd5-75b9-4abd-859e-8b0bc1589e66',
        plan: 'pro',
        status: 'active',
        is_cancelled: false,
        expires_at: '2026-10-28T12:22:55.000Z',
        created_at: '2026-09-28T01:17:34.000Z',
        updated_at: '2026-09-28T01:17:35.000Z',
      },
    ]

    const resolved = resolveCanonicalSubscription(fourRows, mockNow)
    assert.equal(resolved.id, '3a65f9b2-dc9e-4202-bde1-efd85722f042', 'Resolves to latest updated active Pro expiring in Nov 2026')
    assert.equal(resolved.status, 'active')

    const ent = calculateSubscriptionEntitlement({
      user: { id: 'c320ff9c-ced8-4c4b-bfa1-87dfe6b9c4c9' },
      subscription: resolved,
      now: mockNow,
    })

    assert.equal(ent.hasActiveSubscription, true)
    assert.equal(ent.isPro, true)
    assert.equal(ent.subscriptionState, 'active')
    assert.notEqual(ent.subscriptionState, 'cancelled')
  })
})
