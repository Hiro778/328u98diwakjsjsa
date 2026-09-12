/**
 * Product Service — reusable queries for product data.
 *
 * Centralized so ALL tools (HPP, Margin Analysis, BEP, Dashboard, etc.)
 * read from the same source instead of duplicating product queries.
 *
 * Rules:
 * - All queries are scoped by business_id (enforced by RLS + explicit filter)
 * - Only active products are returned by default
 * - product_id is the primary relation for cross-tool data
 */

import { supabase } from './supabase'

/**
 * Get all active products for a business.
 * Returns array of { id, name, sku, unit, unit_price, cost_price, category }
 * ordered by name.
 */
export async function getProductsByBusiness(businessId) {
  if (!businessId) return []

  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, unit, unit_price, cost_price, category, image_url, slogan')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('[productService] getProductsByBusiness error:', error)
    return []
  }

  return data || []
}

/**
 * Get a single product by ID.
 * Returns product object or null.
 */
export async function getProductById(productId, businessId) {
  if (!productId || !businessId) return null

  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, unit, unit_price, cost_price, category, description, image_url, slogan')
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) {
    console.error('[productService] getProductById error:', error)
    return null
  }

  return data
}
