// src/lib/subscriptionUtils.js
// Subscription entitlement state machine for BisnisSehat Pro

/**
 * Calculates subscription entitlement state machine.
 *
 * Requirements per fic1.md:
 * 1. unauthenticated -> login/register CTA
 * 2. free / never subscribed -> user never had Pro (shows "Mulai BisnisSehat Pro", "Rp 130.000 / bulan kalender", "Berlangganan Pro Sekarang")
 * 3. active -> subscription Pro valid & expires_at > now (shows "Pro Aktif" + tanggal berakhir)
 * 4. expired -> user PERNAH memiliki Pro (verified via payment history or activated subscription) AND expires_at <= now (shows "Pro Sudah Berakhir")
 *
 * CRITICAL RULE:
 * DO NOT determine expired solely with `expires_at <= now`.
 * A subscription row can exist without the user ever paying or activating Pro (e.g. checkout draft, pending payment, default row).
 * Pending payments must NOT be treated as having subscribed.
 *
 * @param {Object} options
 * @param {Object|null} [options.user] - Current Supabase auth user
 * @param {Object|null} [options.subscription] - Row from public.subscriptions
 * @param {boolean} [options.hasPaidHistory] - True if user has at least one paid/settlement record in subscription_payments
 * @param {boolean} [options.loading] - Whether auth/subscription data is loading
 * @param {Error|string|null} [options.error] - Loading or query error if encountered
 * @param {Date|number|string} [options.now] - Reference time (default: new Date())
 * @returns {Object} Entitlement calculation result
 */
export function calculateSubscriptionEntitlement({
  user = null,
  subscription = null,
  hasPaidHistory = false,
  loading = false,
  error = null,
  now = new Date(),
} = {}) {
  if (loading) {
    return {
      subscriptionState: 'loading',
      hasActiveSubscription: false,
      hasExpiredSubscription: false,
      isPro: false,
      expiresAt: null,
      hasProofOfPriorPro: false,
      error: null,
    }
  }

  if (error) {
    return {
      subscriptionState: 'error',
      hasActiveSubscription: false,
      hasExpiredSubscription: false,
      isPro: false,
      expiresAt: null,
      hasProofOfPriorPro: false,
      error: error?.message || (typeof error === 'string' ? error : 'Terjadi kendala saat memeriksa status langganan.'),
    }
  }

  if (!user) {
    return {
      subscriptionState: 'unauthenticated',
      hasActiveSubscription: false,
      hasExpiredSubscription: false,
      isPro: false,
      expiresAt: null,
      hasProofOfPriorPro: false,
    }
  }

  const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null
  const hasValidExpiresAt = expiresAt !== null && !isNaN(expiresAt.getTime())
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime()

  const isFuture = hasValidExpiresAt ? expiresAt.getTime() > currentTime : false
  const isPast = hasValidExpiresAt ? expiresAt.getTime() <= currentTime : false

  const startedAt = subscription?.started_at ? new Date(subscription.started_at) : null
  const hasValidStartedAt = startedAt !== null && !isNaN(startedAt.getTime())

  // Legitimate proof that user ever had an active/paid Pro subscription:
  // 1. A verified paid/settlement transaction in subscription_payments, OR
  // 2. An activated subscription with plan 'pro', valid started_at and expires_at timestamps
  // (Rows with null started_at/expires_at, pending status, or free plan do NOT qualify as prior Pro)
  const hasProofOfPriorPro = Boolean(
    hasPaidHistory ||
    (subscription?.plan === 'pro' && hasValidStartedAt && hasValidExpiresAt) ||
    (subscription?.plan === 'pro' && subscription?.status === 'expired' && hasValidExpiresAt)
  )

  // 1. ACTIVE: Pro plan, status active, and expires_at is strictly in the future
  if (
    subscription?.status === 'active' &&
    subscription?.plan === 'pro' &&
    isFuture
  ) {
    return {
      subscriptionState: 'active',
      hasActiveSubscription: true,
      hasExpiredSubscription: false,
      hasCancelledSubscription: false,
      isPro: true,
      expiresAt: subscription.expires_at,
      hasProofOfPriorPro: true,
    }
  }

  // 1.b CANCELLED: User explicitly cancelled active Pro subscription (plan.md specification)
  if (subscription?.status === 'cancelled') {
    return {
      subscriptionState: 'cancelled',
      hasActiveSubscription: false,
      hasExpiredSubscription: false,
      hasCancelledSubscription: true,
      isPro: false,
      expiresAt: subscription?.expires_at || null,
      hasProofOfPriorPro: true,
    }
  }

  // 2. EXPIRED: User legitimately HAD Pro, and expires_at has passed
  if (
    hasProofOfPriorPro &&
    isPast
  ) {
    return {
      subscriptionState: 'expired',
      hasActiveSubscription: false,
      hasExpiredSubscription: true,
      hasCancelledSubscription: false,
      isPro: false,
      expiresAt: subscription?.expires_at || null,
      hasProofOfPriorPro: true,
    }
  }

  // 3. FREE: Brand new user, pending payment, inactive checkout draft, or free plan
  return {
    subscriptionState: 'free',
    hasActiveSubscription: false,
    hasExpiredSubscription: false,
    isPro: false,
    expiresAt: subscription?.expires_at || null,
    hasProofOfPriorPro,
  }
}

/**
 * Maps sync/verification responses to friendly, user-facing feedback per fix.md specification.
 * Eliminates all references to payment gateways, webhooks, or raw error messages.
 *
 * @param {Object|null} verifyRes - Result from verifySubscriptionPayment
 * @param {boolean} isSubActive - Whether user's subscription is confirmed active
 * @returns {{ type: 'success'|'info'|'warning'|'error', title?: string, text: string }}
 */
export function formatSyncResultMessage(verifyRes, isSubActive) {
  if (isSubActive) {
    // CASE A — ACTIVE
    return {
      type: 'success',
      title: 'Langganan Pro aktif 🎉',
      text: 'Membuka dashboard...',
    }
  }

  const status = verifyRes?.status

  if (status === 'pending') {
    // CASE C — PAYMENT PENDING
    return {
      type: 'info',
      title: 'Pembayaran masih diproses.',
      text: 'Langganan Pro akan aktif setelah pembayaran berhasil dikonfirmasi.',
    }
  }

  if (['failed', 'cancel', 'deny', 'expire'].includes(status)) {
    // CASE D — DENIED / EXPIRED / CANCELLED
    return {
      type: 'warning',
      title: 'Pembayaran belum berhasil dikonfirmasi.',
      text: 'Silakan lakukan pembayaran kembali untuk mengaktifkan Pro.',
    }
  }

  // CASE B — PAYMENT BELUM DITEMUKAN / BELUM BERHASIL
  return {
    type: 'info',
    title: 'Langganan aktif belum ditemukan.',
    text: 'Jika Anda baru saja melakukan pembayaran, tunggu beberapa saat lalu coba sinkronkan kembali.',
  }
}

/**
 * Friendly error message for catch blocks or network issues (CASE E).
 * Never exposes raw Supabase/Midtrans exceptions.
 */
export function getFriendlyErrorMessage() {
  return {
    type: 'error',
    title: 'Terjadi kendala saat memeriksa status langganan.',
    text: 'Silakan coba lagi beberapa saat.',
  }
}

