/**
 * Loan Simulation Service — reusable queries and mutations for Loan Simulation data.
 *
 * Centralized persistence layer following Context7 architecture patterns.
 * Ensures:
 * - Scoped by business_id (enforced by RLS + explicit filter)
 * - Numeric invariant sanitization (prevents NaN, Infinity, undefined)
 * - PostgREST error normalization (PGRST205, 42P01, 42501, 23503, 23502, 22P02)
 * - Safe amortized schedule jsonb handling
 */

import { supabase } from './supabase.js'
import { saveCalculationHistory } from './calculationHistoryService.js'

/**
 * Normalizes Supabase / PostgREST errors into descriptive user-safe error messages
 * while preserving full technical details in development console.
 */
export function normalizeLoanSimulationError(error) {
  if (!error) return ''

  console.error('[loanSimulationService] Supabase error:', {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })

  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()

  if (code === 'PGRST205' || code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
    return 'Tabel loan_simulations belum tersedia di database. Jalankan migration 015_loan_simulation.sql di Supabase Dashboard → SQL Editor.'
  }

  if (code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'Anda tidak memiliki akses untuk menyimpan data simulasi pinjaman pada bisnis ini.'
  }

  if (code === '23503' || msg.includes('foreign key')) {
    return 'Data referensi bisnis tidak ditemukan.'
  }

  if (code === '23502' || msg.includes('not-null')) {
    return 'Field wajib simulasi pinjaman belum lengkap.'
  }

  if (code === '22P02') {
    return 'Format data numerik tidak valid.'
  }

  return error.message || 'Gagal memproses simulasi pinjaman. Silakan coba lagi.'
}

export const normalizeLoanError = normalizeLoanSimulationError

/**
 * Safely validates and converts any value to a finite number.
 * Rejects NaN, Infinity, and out-of-range inputs.
 */
export function sanitizeNumeric(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = typeof value === 'string' ? Number(value.replace(/[^0-9.-]+/g, '')) : Number(value)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback
  return parsed
}

/**
 * Validates numeric input strictly, throwing an error if invalid.
 */
export function validateNumeric(value, fieldName = 'Field', { min = 0, max = 9999999999999.99, required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) {
      throw new Error(`${fieldName} wajib diisi.`)
    }
    return min
  }
  const parsed = typeof value === 'string' ? Number(value.replace(/[^0-9.-]+/g, '')) : Number(value)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`${fieldName} harus berupa angka yang valid.`)
  }
  if (parsed < min) {
    throw new Error(`${fieldName} tidak boleh kurang dari ${min}.`)
  }
  if (parsed > max) {
    throw new Error(`${fieldName} melebihi batas maksimum (${max}).`)
  }
  return parsed
}

/**
 * Save a new Loan Simulation record to Supabase.
 */
export async function saveLoanSimulation(payload, existingHistory = []) {
  if (!payload?.business_id) {
    throw new Error('Business ID wajib disertakan.')
  }

  // Strict numeric validation
  const principal = validateNumeric(payload.principal, 'Jumlah pinjaman', { min: 1, required: true })
  const annualInterestRate = validateNumeric(payload.annual_interest_rate, 'Suku bunga tahunan', { min: 0, max: 100 })
  const tenorMonths = Math.max(1, Math.round(validateNumeric(payload.tenor_months, 'Tenor pinjaman', { min: 1, max: 600, required: true })))

  const method = (payload.method || 'annuity').toLowerCase()
  if (!['flat', 'effective', 'annuity'].includes(method)) {
    throw new Error('Metode bunga tidak valid.')
  }

  const adminFee = sanitizeNumeric(payload.admin_fee, 0)
  const provisionRate = sanitizeNumeric(payload.provision_rate, 0)
  const otherFee = sanitizeNumeric(payload.other_fee, 0)
  const monthlyPayment = sanitizeNumeric(payload.monthly_payment, 0)
  const totalInterest = sanitizeNumeric(payload.total_interest, 0)
  const totalFees = sanitizeNumeric(payload.total_fees, 0)
  const totalPayment = sanitizeNumeric(payload.total_payment, 0)
  const effectiveTotalCost = sanitizeNumeric(payload.effective_total_cost, 0)

  const sanitizedPayload = {
    business_id: payload.business_id,
    principal,
    annual_interest_rate: annualInterestRate,
    tenor_months: tenorMonths,
    method,
    admin_fee: adminFee,
    provision_rate: provisionRate,
    other_fee: otherFee,
    monthly_payment: monthlyPayment,
    total_interest: totalInterest,
    total_fees: totalFees,
    total_payment: totalPayment,
    effective_total_cost: effectiveTotalCost,
    schedule: Array.isArray(payload.schedule) ? payload.schedule : [],
  }

  const saveRes = await saveCalculationHistory(supabase, {
    table: 'loan_simulations',
    toolType: 'loan_simulation',
    businessId: payload.business_id,
    payload: sanitizedPayload,
    existingHistory,
  })

  if (!saveRes.success) {
    const errorMsg = normalizeLoanSimulationError(saveRes.error)
    const err = new Error(errorMsg)
    err.raw = saveRes.error
    throw err
  }

  return saveRes.data
}

/**
 * Update an existing Loan Simulation record.
 */
export async function updateLoanSimulation(id, businessId, payload) {
  if (!id || !businessId) {
    throw new Error('ID dan Business ID wajib disertakan.')
  }

  const principal = validateNumeric(payload.principal, 'Jumlah pinjaman', { min: 1, required: true })
  const annualInterestRate = validateNumeric(payload.annual_interest_rate, 'Suku bunga tahunan', { min: 0, max: 100 })
  const tenorMonths = Math.max(1, Math.round(validateNumeric(payload.tenor_months, 'Tenor pinjaman', { min: 1, max: 600, required: true })))

  const method = (payload.method || 'annuity').toLowerCase()
  if (!['flat', 'effective', 'annuity'].includes(method)) {
    throw new Error('Metode bunga tidak valid.')
  }

  const sanitizedPayload = {
    principal,
    annual_interest_rate: annualInterestRate,
    tenor_months: tenorMonths,
    method,
    admin_fee: sanitizeNumeric(payload.admin_fee, 0),
    provision_rate: sanitizeNumeric(payload.provision_rate, 0),
    other_fee: sanitizeNumeric(payload.other_fee, 0),
    monthly_payment: sanitizeNumeric(payload.monthly_payment, 0),
    total_interest: sanitizeNumeric(payload.total_interest, 0),
    total_fees: sanitizeNumeric(payload.total_fees, 0),
    total_payment: sanitizeNumeric(payload.total_payment, 0),
    effective_total_cost: sanitizeNumeric(payload.effective_total_cost, 0),
    schedule: Array.isArray(payload.schedule) ? payload.schedule : [],
  }

  const { data, error } = await supabase
    .from('loan_simulations')
    .update(sanitizedPayload)
    .eq('id', id)
    .eq('business_id', businessId)
    .select()
    .single()

  if (error) {
    const errorMsg = normalizeLoanSimulationError(error)
    const err = new Error(errorMsg)
    err.raw = error
    throw err
  }

  return data
}

/**
 * Load history of Loan Simulations for a specific business.
 */
export async function getLoanSimulationsByBusiness(businessId, limit = 20) {
  if (!businessId) return []

  const { data, error } = await supabase
    .from('loan_simulations')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[loanSimulationService] getLoanSimulationsByBusiness error:', error)
    return []
  }

  return data || []
}

/**
 * Delete a Loan Simulation record by ID scoped by business_id.
 */
export async function deleteLoanSimulation(id, businessId) {
  if (!id || !businessId) return false

  const { error } = await supabase
    .from('loan_simulations')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)

  if (error) {
    console.error('[loanSimulationService] deleteLoanSimulation error:', error)
    return false
  }

  return true
}
