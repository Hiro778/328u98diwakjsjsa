// src/services/creativeCreditService.js
// Client service for Creative Credits subsystem
// Strictly server-authoritative. Frontend does not determine prices or mutate balances directly.

import { supabase } from '../lib/supabase.js';

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || '';

// ============================================================
// SERVER-ALIGNED CONSTANTS (MIRRORS SERVER CONFIG)
// ============================================================

export const CREDIT_PACKAGES = {
  starter: {
    key: 'starter',
    name: 'Starter',
    credits: 100,
    priceIdr: 25000,
    pricePerCredit: 250,
    badge: null,
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    credits: 500,
    priceIdr: 100000,
    pricePerCredit: 200,
    badge: 'Paling populer',
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    credits: 1000,
    priceIdr: 175000,
    pricePerCredit: 175,
    badge: null,
  },
  business: {
    key: 'business',
    name: 'Business',
    credits: 3000,
    priceIdr: 450000,
    pricePerCredit: 150,
    badge: null,
  },
};

export const CREATIVE_GENERATION_COST = 20;
export const PRO_MONTHLY_ALLOWANCE = 200;

export const OPERATION_CREDIT_COSTS = {
  GENERATE_BRIEF: 20,
  GENERATE_PRD: 20,
  GENERATE_COPY: 20,
  GENERATE_CAMPAIGN_LONG: 20,
  GENERATE_IMAGE_STANDARD: 20,
  GENERATE_IMAGE_PREMIUM: 20,
};

async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export async function resolveBusinessId(explicitBusinessId = null) {
  if (explicitBusinessId) return explicitBusinessId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !business?.id) throw new Error('No business found');
  return business.id;
}

/**
 * Fetch total credit overview: balance, free usage status, and monthly consumption
 */
export async function getCreditOverview(businessId = null) {
  const resolvedBusinessId = await resolveBusinessId(businessId);

  // 1. Current balance
  const { data: balance } = await supabase
    .from('creative_credits')
    .select('available, reserved, consumed, total_earned')
    .eq('business_id', resolvedBusinessId)
    .maybeSingle();

  // 2. Free usage check (1x lifetime per business)
  const { data: freeUsage } = await supabase
    .from('creative_free_usage')
    .select('id, operation, consumed_at')
    .eq('business_id', resolvedBusinessId)
    .maybeSingle();

  // 3. This month's consumption
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: monthLedger } = await supabase
    .from('credit_ledger')
    .select('credits')
    .eq('business_id', resolvedBusinessId)
    .eq('type', 'AI_USAGE')
    .gte('created_at', startOfMonth.toISOString());

  const monthConsumed = (monthLedger || []).reduce((acc, row) => acc + Math.abs(row.credits || 0), 0);

  return {
    balance: balance || { available: 0, reserved: 0, consumed: 0, total_earned: 0 },
    freeUsageAvailable: !freeUsage,
    freeUsageRecord: freeUsage || null,
    monthConsumed,
    businessId: resolvedBusinessId,
  };
}

/**
 * Call Edge Function to initiate Midtrans Snap Top Up
 */
export async function createTopupOrder(packageKey) {
  const token = await getSessionToken();
  if (!token) throw new Error('Not authenticated');

  const pkg = CREDIT_PACKAGES[packageKey];
  if (!pkg) throw new Error('Paket tidak valid');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/creative-topup-snap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || '',
    },
    body: JSON.stringify({
      package_key: packageKey,
      redirect_origin: origin,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Gagal membuat pesanan top up.');
  }

  return result; // { order_id, snap_token, redirect_url }
}

/**
 * Backend verification for top-up payment by order_id.
 * Queries Edge Function which checks database and Midtrans Status API.
 * Never trust frontend query parameters alone.
 */
export async function verifyTopupPayment(orderId) {
  const token = await getSessionToken();
  if (!token) throw new Error('Not authenticated');

  if (!orderId || typeof orderId !== 'string' || !orderId.startsWith('CREDIT-')) {
    throw new Error('order_id tidak valid');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/creative-topup-snap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'verify_payment',
      order_id: orderId,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Gagal memverifikasi status pembayaran.');
  }

  return result; // { status, is_paid, order_id, credits }
}

/**
 * Fetch credit usage history (deductions)
 */
export async function getUsageHistory(businessId = null, limit = 20) {
  const resolvedBusinessId = await resolveBusinessId(businessId);

  const { data, error } = await supabase
    .from('credit_ledger')
    .select('id, type, credits, balance_after, description, created_at')
    .eq('business_id', resolvedBusinessId)
    .in('type', ['AI_USAGE', 'FREE_USAGE'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Fetch top-up payment history
 */
export async function getTopupHistory(businessId = null, limit = 20) {
  const resolvedBusinessId = await resolveBusinessId(businessId);

  const { data, error } = await supabase
    .from('credit_purchases')
    .select('id, order_id, package_key, amount_idr, credits, status, created_at, updated_at')
    .eq('business_id', resolvedBusinessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
