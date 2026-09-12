/**
 * HPP Service — reusable queries for HPP data.
 *
 * Centralized so ALL tools (Margin Analysis, BEP, Dashboard, etc.)
 * read from the same source instead of duplicating queries.
 *
 * Rules:
 * - product_id is the primary relation
 * - latest HPP = most recent valid saved calculation (ORDER BY created_at DESC)
 * - history is immutable snapshots — editing a product does NOT change old records
 * - all queries are scoped by business_id (enforced by RLS + explicit filter)
 */

import { supabase } from './supabase'

/**
 * Get the latest HPP calculation for a product.
 * Returns { hpp_per_unit, selling_price, total_cost, material_cost,
 *            packaging_cost, direct_labor_cost, overhead_cost, other_cost,
 *            waste_percentage, quantity_produced, production_unit,
 *            markup_percent, margin_percent, price_mode, created_at }
 * or null if no calculation exists.
 *
 * Deterministic: ORDER BY created_at DESC, LIMIT 1.
 */
export async function getLatestHPPByProduct(productId, businessId) {
  if (!productId || !businessId) return null

  const { data, error } = await supabase
    .from('hpp_calculations')
    .select(`
      id,
      hpp_per_unit,
      selling_price,
      total_cost,
      material_cost,
      packaging_cost,
      direct_labor_cost,
      overhead_cost,
      other_cost,
      waste_percentage,
      quantity_produced,
      production_unit,
      markup_percent,
      margin_percent,
      price_mode,
      cost_breakdown,
      created_at
    `)
    .eq('product_id', productId)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[hppService] getLatestHPPByProduct error:', error)
    return null
  }

  return data
}

/**
 * Get full HPP history for a product.
 * Returns array of calculations ordered by created_at DESC.
 */
export async function getHPPHistoryByProduct(productId, businessId) {
  if (!productId || !businessId) return []

  const { data, error } = await supabase
    .from('hpp_calculations')
    .select(`
      id,
      product_name,
      hpp_per_unit,
      selling_price,
      total_cost,
      material_cost,
      quantity_produced,
      production_unit,
      waste_percentage,
      markup_percent,
      margin_percent,
      price_mode,
      created_at
    `)
    .eq('product_id', productId)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[hppService] getHPPHistoryByProduct error:', error)
    return []
  }

  return data || []
}

/**
 * Get the latest VALID HPP for a product.
 * "Valid" means hpp_per_unit > 0 and no calculation errors at time of save.
 * Falls back through history if the most recent has hpp_per_unit = 0.
 *
 * Used by tools that NEED a valid cost basis (Margin Analysis, BEP, etc.).
 */
export async function getLatestValidHPP(productId, businessId) {
  if (!productId || !businessId) return null

  const { data, error } = await supabase
    .from('hpp_calculations')
    .select(`
      id,
      hpp_per_unit,
      selling_price,
      total_cost,
      material_cost,
      markup_percent,
      margin_percent,
      price_mode,
      created_at
    `)
    .eq('product_id', productId)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[hppService] getLatestValidHPP error:', error)
    return null
  }

  // Return the most recent calculation with hpp_per_unit > 0
  const valid = (data || []).find(c => c.hpp_per_unit > 0)
  return valid || null
}

/**
 * Get the latest HPP value as a plain number (for quick lookups).
 * Returns number or 0 if none found.
 */
export async function getLatestHPPValue(productId, businessId) {
  const hpp = await getLatestValidHPP(productId, businessId)
  return hpp?.hpp_per_unit || 0
}
