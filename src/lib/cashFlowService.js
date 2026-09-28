/**
 * Cash Flow Service — reusable queries and mutations for Cash Flow Forecast data.
 *
 * Centralized persistence layer following Context7 architecture patterns.
 * Ensures:
 * - Scoped by business_id (enforced by RLS + explicit filter)
 * - Numeric invariant sanitization (prevents NaN, Infinity, undefined)
 * - PostgREST error normalization (PGRST205, 42P01, 42501, 23503, etc.)
 * - Immutable snapshots for historical projections
 */

import { supabase } from './supabase'

/**
 * Normalizes Supabase / PostgREST errors into descriptive user-safe error messages
 * while preserving full technical details in development console.
 */
export function normalizeCashFlowError(error) {
  if (!error) return ''

  console.error('[cashFlowService] Supabase error:', {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })

  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()

  if (code === '42P01' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache')) {
    return 'Tabel cash_flow_forecasts belum tersedia di database. Jalankan migration 011_cash_flow_forecast.sql di Supabase Dashboard → SQL Editor.'
  }

  if (code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'Anda tidak memiliki akses untuk menyimpan data Cash Flow Forecast pada bisnis ini.'
  }

  if (code === '23503' || msg.includes('foreign key')) {
    return 'Data referensi bisnis tidak ditemukan.'
  }

  if (code === '23502' || msg.includes('not-null')) {
    return 'Field wajib Cash Flow Forecast belum lengkap.'
  }

  if (code === '22P02') {
    return 'Format data numerik tidak valid.'
  }

  return 'Gagal menyimpan forecast. Silakan coba lagi.'
}

/**
 * Safely converts any value to a finite number fallback.
 */
export function sanitizeNumeric(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = typeof value === 'string' ? Number(value.replace(/[^0-9.-]+/g, '')) : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Save a new Cash Flow Forecast record to Supabase.
 */
export async function saveCashFlowForecast(payload) {
  if (!payload?.business_id) {
    throw new Error('Business ID wajib disertakan.')
  }

  const num = (v) => sanitizeNumeric(v, 0)

  const sanitizedPayload = {
    business_id: payload.business_id,
    forecast_name: (payload.forecast_name || '').trim(),
    forecast_period: payload.forecast_period || '3_months',
    opening_cash: num(payload.opening_cash),
    total_inflows: num(payload.total_inflows),
    total_outflows: num(payload.total_outflows),
    net_cash_flow: num(payload.net_cash_flow),
    closing_cash: num(payload.closing_cash),
    minimum_cash_balance: num(payload.minimum_cash_balance),
    maximum_cash_balance: num(payload.maximum_cash_balance),
    shortfall_detected: Boolean(payload.shortfall_detected),
    shortfall_amount: num(payload.shortfall_amount),
    inflows: Array.isArray(payload.inflows) ? payload.inflows : [],
    outflows: Array.isArray(payload.outflows) ? payload.outflows : [],
    periods: Array.isArray(payload.periods) ? payload.periods : [],
  }

  const { data, error } = await supabase
    .from('cash_flow_forecasts')
    .insert(sanitizedPayload)
    .select()
    .single()

  if (error) {
    const errorMsg = normalizeCashFlowError(error)
    const err = new Error(errorMsg)
    err.raw = error
    throw err
  }

  return data
}

/**
 * Load history of Cash Flow Forecasts for a specific business.
 */
export async function getCashFlowForecastsByBusiness(businessId, limit = 20) {
  if (!businessId) return []

  const { data, error } = await supabase
    .from('cash_flow_forecasts')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[cashFlowService] getCashFlowForecastsByBusiness error:', error)
    return []
  }

  return data || []
}

/**
 * Delete a Cash Flow Forecast record by ID scoped by business_id.
 */
export async function deleteCashFlowForecast(id, businessId) {
  if (!id || !businessId) return false

  const { error } = await supabase
    .from('cash_flow_forecasts')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)

  if (error) {
    console.error('[cashFlowService] deleteCashFlowForecast error:', error)
    return false
  }

  return true
}
