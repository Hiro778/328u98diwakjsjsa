/**
 * BEP Service — reusable queries and mutations for BEP calculation data.
 *
 * Centralized persistence layer following Context7 architecture patterns.
 * Ensures:
 * - Scoped by business_id (enforced by RLS + explicit filter)
 * - Numeric invariant sanitization (prevents NaN, Infinity, undefined)
 * - PostgREST error normalization (PGRST205, 42P01, 42501, 23503, etc.)
 * - History snapshots are immutable
 */

import { supabase } from './supabase'

/**
 * Normalizes Supabase / PostgREST errors into descriptive user-safe error messages
 * while preserving full technical details in development console.
 */
export function normalizeBepError(error) {
  if (!error) return ''

  console.error('[bepService] Supabase error:', {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })

  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()

  if (code === '42P01' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache')) {
    return 'Tabel bep_calculations belum tersedia di database. Jalankan migration 010_bep_calculator.sql di Supabase Dashboard → SQL Editor.'
  }

  if (code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'Anda tidak memiliki akses untuk menyimpan data BEP pada bisnis ini.'
  }

  if (code === '23503' || msg.includes('foreign key')) {
    return 'Data referensi tidak ditemukan. Periksa produk yang dipilih.'
  }

  if (code === '23502' || msg.includes('not-null')) {
    return 'Field wajib BEP belum lengkap.'
  }

  if (code === '22P02') {
    return 'Format data numerik tidak valid.'
  }

  return 'Gagal menyimpan BEP. Silakan coba lagi.'
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
 * Save a new BEP calculation record to Supabase.
 */
export async function saveBepCalculation(payload) {
  if (!payload?.business_id) {
    throw new Error('Business ID wajib disertakan.')
  }

  const num = (v) => sanitizeNumeric(v, 0)

  const sanitizedPayload = {
    business_id: payload.business_id,
    product_id: payload.product_id || null,
    product_name: (payload.product_name || '').trim(),
    selling_price_per_unit: num(payload.selling_price_per_unit),
    material_cost_per_unit: num(payload.material_cost_per_unit),
    packaging_cost_per_unit: num(payload.packaging_cost_per_unit),
    sales_fee_per_unit: num(payload.sales_fee_per_unit),
    other_variable_cost_per_unit: num(payload.other_variable_cost_per_unit),
    variable_cost_per_unit: num(payload.variable_cost_per_unit),
    rent: num(payload.rent),
    fixed_labor: num(payload.fixed_labor),
    utilities: num(payload.utilities),
    software: num(payload.software),
    other_fixed_costs: num(payload.other_fixed_costs),
    fixed_costs: num(payload.fixed_costs),
    contribution_margin_per_unit: num(payload.contributionMarginPerUnit ?? payload.contribution_margin_per_unit),
    contribution_margin_ratio: num(payload.contributionMarginRatio ?? payload.contribution_margin_ratio),
    bep_units: num(payload.bep_units),
    bep_revenue: num(payload.bep_revenue),
    actual_units: Math.floor(num(payload.actual_units)),
    actual_revenue: num(payload.actual_revenue),
    margin_of_safety: num(payload.margin_of_safety),
    margin_of_safety_percent: num(payload.margin_of_safety_percent),
    target_profit: num(payload.target_profit),
    required_units_for_target_profit: num(payload.required_units_for_target_profit),
    required_revenue_for_target_profit: num(payload.required_revenue_for_target_profit),
  }

  const { data, error } = await supabase
    .from('bep_calculations')
    .insert(sanitizedPayload)
    .select()
    .single()

  if (error) {
    const errorMsg = normalizeBepError(error)
    const err = new Error(errorMsg)
    err.raw = error
    throw err
  }

  return data
}

/**
 * Load history of BEP calculations for a specific business.
 */
export async function getBepCalculationsByBusiness(businessId, limit = 20) {
  if (!businessId) return []

  const { data, error } = await supabase
    .from('bep_calculations')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[bepService] getBepCalculationsByBusiness error:', error)
    return []
  }

  return data || []
}

/**
 * Delete a BEP calculation record by ID scoped by business_id.
 */
export async function deleteBepCalculation(id, businessId) {
  if (!id || !businessId) return false

  const { error } = await supabase
    .from('bep_calculations')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)

  if (error) {
    console.error('[bepService] deleteBepCalculation error:', error)
    return false
  }

  return true
}
