// src/lib/subscriptionService.js
// Subscription service for BisnisSehat Pro

import { supabase } from './supabase'
import {
  FunctionsHttpError,
  FunctionsRelayError,
  FunctionsFetchError,
} from '@supabase/supabase-js'

let snapScriptPromise = null

/**
 * Load Midtrans Snap JS dynamically using client key
 */
export function loadSnapScript() {
  if (typeof window !== 'undefined' && window.snap) {
    return Promise.resolve()
  }

  if (snapScriptPromise) {
    return snapScriptPromise
  }

  snapScriptPromise = new Promise((resolve, reject) => {
    const isProd = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true'
    const snapUrl = isProd
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js'

    const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY || ''

    const existing = document.querySelector(`script[src="${snapUrl}"]`)
    if (existing && window.snap) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = snapUrl
    if (clientKey) {
      script.setAttribute('data-client-key', clientKey)
    }
    script.async = true

    script.onload = () => {
      resolve()
    }

    script.onerror = () => {
      snapScriptPromise = null
      reject(new Error('Gagal memuat sistem pembayaran online'))
    }

    document.head.appendChild(script)
  })

  return snapScriptPromise
}

/**
 * Create subscription Snap transaction via Edge Function.
 * Strictly sends no custom amount from frontend — amount is Rp 35.000 for Basic or Rp 130.000 for Pro determined by server.
 *
 * @param {'pro'|'basic'} [plan='pro']
 */
export async function createSubscriptionSnap(plan = 'pro') {
  // 1. Verify active Supabase session before invoking
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) {
    throw new Error('Sesi login tidak ditemukan atau telah berakhir. Silakan login kembali.')
  }

  const normalizedPlan = plan?.toLowerCase() === 'basic' ? 'basic' : 'pro'
  console.log(`[subscriptionService] Invoking midtrans-subscription-snap for plan ${normalizedPlan}...`)
  const { data, error } = await supabase.functions.invoke('midtrans-subscription-snap', {
    body: { plan: normalizedPlan },
  })

  if (error) {
    console.error('[subscriptionService] createSubscriptionSnap error:', error.name, error.message)

    // Handle structured HTTP error from Edge Function
    if (error instanceof FunctionsHttpError) {
      let serverErrorMsg = null
      const statusCode = error.context?.status || 500

      try {
        const errorJson = await error.context.json()
        serverErrorMsg =
          errorJson?.error ||
          errorJson?.message ||
          (Array.isArray(errorJson?.error_messages) ? errorJson.error_messages.join('; ') : null)
      } catch {
        // Context body was not valid JSON
      }

      if (statusCode === 401) {
        throw new Error(serverErrorMsg || 'Sesi login tidak valid. Silakan login kembali.')
      }

      if (serverErrorMsg) {
        // Sanitize error message — never expose secrets/tokens
        const sanitized = serverErrorMsg.replace(/(key|token|secret|auth)[a-zA-Z0-9_\-=]+/gi, '[redacted]')
        throw new Error(sanitized)
      }

      throw new Error(`Gagal memproses pembayaran (HTTP ${statusCode}). Silakan coba beberapa saat lagi.`)
    }

    // Handle relay error (Supabase infrastructure/gateway issue)
    if (error instanceof FunctionsRelayError) {
      throw new Error('Layanan Edge Function sedang tidak dapat dijangkau oleh relay server. Silakan coba lagi.')
    }

    // Handle fetch/network error
    if (error instanceof FunctionsFetchError) {
      throw new Error('Gagal menghubungi server Edge Function. Periksa koneksi internet Anda atau coba lagi.')
    }

    throw new Error(error.message || 'Pembayaran belum dapat dibuat. Silakan coba lagi.')
  }

  const result = data?.data || data
  if (!result?.snap_token) {
    throw new Error(data?.error || 'Token transaksi pembayaran tidak valid')
  }

  return result
}

// Alias for compatibility
export const createSubscriptionSnapToken = createSubscriptionSnap
export const getSubscriptionSnapToken = createSubscriptionSnap

/**
 * Verify payment status with Midtrans API via Edge Function.
 * Syncs the database if Midtrans confirms payment settlement.
 *
 * @param {string} [orderId] Optional specific order ID to verify
 * @returns {Promise<{ status: string, is_active: boolean, expires_at: string|null }>}
 */
export async function verifySubscriptionPayment(orderId = null) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr || !sessionData?.session) {
    throw new Error('Sesi login telah berakhir. Silakan login kembali.')
  }

  const { data, error } = await supabase.functions.invoke('midtrans-subscription-snap', {
    body: {
      action: 'verify_payment',
      ...(orderId ? { order_id: orderId } : {}),
    },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const errorJson = await error.context.json().catch(() => null)
      const serverMessage = errorJson?.error || error.message
      throw new Error(serverMessage)
    }
    if (error instanceof FunctionsRelayError) {
      throw new Error('Gagal menghubungi gateway pembayaran. Silakan coba sesaat lagi.')
    }
    if (error instanceof FunctionsFetchError) {
      throw new Error('Koneksi terputus saat memverifikasi pembayaran.')
    }
    throw new Error(error.message || 'Gagal memverifikasi status pembayaran ke server')
  }

  return data?.data || data
}

/**
 * Open Midtrans Snap modal
 */
export async function openSnapPaymentModal(snapToken, callbacks = {}) {
  await loadSnapScript()

  if (!window.snap || typeof window.snap.pay !== 'function') {
    throw new Error('Sistem pembayaran online tidak tersedia di browser')
  }

  return new Promise((resolve) => {
    window.snap.pay(snapToken, {
      onSuccess: (result) => {
        if (callbacks.onSuccess) callbacks.onSuccess(result)
        resolve({ status: 'success', result })
      },
      onPending: (result) => {
        if (callbacks.onPending) callbacks.onPending(result)
        resolve({ status: 'pending', result })
      },
      onError: (result) => {
        if (callbacks.onError) callbacks.onError(result)
        resolve({ status: 'error', result })
      },
      onClose: () => {
        if (callbacks.onClose) callbacks.onClose()
        resolve({ status: 'closed' })
      },
    })
  })
}

/**
 * Cancel active subscription via server-side authenticated RPC / Edge Function.
 * Strictly verifies identity and ownership server-side.
 * Does NOT delete history or issue fake refunds.
 *
 * @param {string} subscriptionId Subscription UUID to cancel
 * @param {string} [businessId] Optional linked business UUID
 * @returns {Promise<{ success: boolean, status: string, message: string }>}
 */
export async function cancelSubscription(subscriptionId, businessId = null) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr || !sessionData?.session) {
    throw new Error('Sesi login telah berakhir. Silakan login kembali.')
  }

  // 1. Try RPC cancel_subscription_atomic first
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('cancel_subscription_atomic', {
      p_subscription_id: subscriptionId,
      p_business_id: businessId || null,
    })

    if (!rpcErr && rpcData) {
      return rpcData
    }
    if (rpcErr && (rpcErr.message?.includes('tidak memiliki izin') || rpcErr.message?.includes('Akses ditolak'))) {
      throw new Error('Akses ditolak: Anda bukan pemilik langganan ini')
    }
  } catch (rpcEx) {
    if (rpcEx.message?.includes('Akses ditolak')) throw rpcEx
  }

  // 2. Fallback to Edge Function midtrans-subscription-snap action
  const { data, error } = await supabase.functions.invoke('midtrans-subscription-snap', {
    body: {
      action: 'cancel_subscription',
      subscription_id: subscriptionId,
      business_id: businessId,
    },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const errorJson = await error.context.json().catch(() => null)
      const serverMessage = errorJson?.error || error.message
      throw new Error(serverMessage)
    }
    throw new Error(error.message || 'Gagal menghentikan langganan. Silakan coba lagi.')
  }

  return data?.data || data
}


