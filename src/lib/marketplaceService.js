/**
 * Marketplace Service — handles all marketplace integration operations.
 *
 * Uses OAuth redirect flow:
 * 1. Frontend calls initiateOAuth() → gets authorization URL
 * 2. Frontend redirects user to marketplace authorization page
 * 3. Marketplace redirects back to callback URL with code + state
 * 4. Callback page calls handleOAuthCallback() → tokens saved server-side
 *
 * Credentials/tokens are NEVER stored or processed in the frontend.
 */

import { supabase } from './supabase'

// ══════════════════════════════════════════════════════════
// OAuth Flow
// ══════════════════════════════════════════════════════════

/**
 * Initiate OAuth connection with a marketplace.
 * Returns the authorization URL to redirect the user to.
 *
 * @param {string} marketplace - 'shopee' | 'tokopedia' | 'tiktokshop'
 * @returns {{ authorization_url, state, expires_in } | { status: 'needs_setup', message }}
 */
export async function initiateOAuth(marketplace) {
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-connect', {
      body: { marketplace },
    })

    if (error) {
      // Detect function not deployed / network errors
      const msg = error.message || error.toString()
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return {
          status: 'needs_setup',
          marketplace,
          message: 'Integrasi marketplace belum aktif. Hubungi admin untuk mengaktifkan.'
        }
      }
      console.error('[marketplaceService] initiateOAuth error:', error)
      return { status: 'error', message: msg }
    }

    return data?.data || { status: 'error', message: 'No response from server' }
  } catch (err) {
    // Handle network/function not found errors
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return {
        status: 'needs_setup',
        marketplace,
        message: 'Integrasi marketplace belum aktif. Hubungi admin untuk mengaktifkan.'
      }
    }
    console.error('[marketplaceService] initiateOAuth error:', err)
    return { status: 'error', message: msg }
  }
}

/**
 * Handle OAuth callback from marketplace.
 * Exchange authorization code for tokens (server-side).
 *
 * @param {string} code - Authorization code from marketplace
 * @param {string} state - State parameter for CSRF protection
 * @returns {{ success, status, shop_name, shop_id, error? }}
 */
export async function handleOAuthCallback(code, state) {
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-oauth-callback', {
      body: { code, state },
    })

    if (error) {
      const msg = error.message || error.toString()
      // Detect function not deployed / network errors
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return {
          success: false,
          status: 'needs_setup',
          error: 'Integrasi marketplace belum aktif. Hubungi admin untuk mengaktifkan.'
        }
      }
      console.error('[marketplaceService] handleOAuthCallback error:', error)
      return { success: false, status: 'error', error: msg }
    }

    return data?.data || { success: false, status: 'error', error: 'No response' }
  } catch (err) {
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return {
        success: false,
        status: 'needs_setup',
        error: 'Integrasi marketplace belum aktif. Hubungi admin untuk mengaktifkan.'
      }
    }
    console.error('[marketplaceService] handleOAuthCallback error:', err)
    return { success: false, status: 'error', error: msg }
  }
}

/**
 * Check OAuth configuration status for all marketplaces.
 * Returns which marketplaces have credentials configured.
 *
 * @returns {{ marketplaces: Record<string, { configured, name }>, all_configured }}
 */
export async function getOAuthStatus() {
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-oauth-status', {
      method: 'GET',
    })

    if (error) {
      const msg = error.message || error.toString()
      // Detect function not deployed / network errors
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return { marketplaces: {}, all_configured: false, error: 'needs_setup' }
      }
      console.error('[marketplaceService] getOAuthStatus error:', error)
      return null
    }

    return data?.data || null
  } catch (err) {
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return { marketplaces: {}, all_configured: false, error: 'needs_setup' }
    }
    console.error('[marketplaceService] getOAuthStatus error:', err)
    return null
  }
}

// ══════════════════════════════════════════════════════════
// Connection Management
// ══════════════════════════════════════════════════════════

/**
 * Get all marketplace connections and sync summary for dashboard.
 */
export async function getMarketplaceStatus() {
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-status', {
      method: 'GET',
    })

    if (error) {
      const msg = error.message || error.toString()
      // Detect function not deployed / network errors
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return { connections: [], error: 'needs_setup' }
      }
      console.error('[marketplaceService] getMarketplaceStatus error:', error)
      return null
    }

    return data?.data || null
  } catch (err) {
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return { connections: [], error: 'needs_setup' }
    }
    console.error('[marketplaceService] getMarketplaceStatus error:', err)
    return null
  }
}

/**
 * Disconnect a marketplace connection.
 * Calls the marketplace's revoke endpoint if available.
 *
 * @param {string} connectionId
 */
export async function disconnectMarketplace(connectionId) {
  try {
    const { error } = await supabase.functions.invoke('marketplace-disconnect', {
      body: { connection_id: connectionId },
    })

    if (error) {
      const msg = error.message || error.toString()
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return { success: false, error: 'Fitur belum aktif. Hubungi admin.' }
      }
      console.error('[marketplaceService] disconnectMarketplace error:', error)
      return { success: false, error: msg }
    }

    return { success: true }
  } catch (err) {
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return { success: false, error: 'Fitur belum aktif. Hubungi admin.' }
    }
    console.error('[marketplaceService] disconnectMarketplace error:', err)
    return { success: false, error: msg }
  }
}

// ══════════════════════════════════════════════════════════
// Product Sync
// ══════════════════════════════════════════════════════════

/**
 * Sync products from marketplace (pull) or push local changes (push).
 * @param {string} connectionId
 * @param {'pull'|'push'} action
 */
export async function syncProducts(connectionId, action = 'pull') {
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-sync-products', {
      body: { connection_id: connectionId, action },
    })

    if (error) {
      const msg = error.message || error.toString()
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return { success: false, error: 'Fitur sync belum aktif. Hubungi admin.' }
      }
      console.error('[marketplaceService] syncProducts error:', error)
      return { success: false, error: msg }
    }

    return { success: true, ...data?.data }
  } catch (err) {
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return { success: false, error: 'Fitur sync belum aktif. Hubungi admin.' }
    }
    console.error('[marketplaceService] syncProducts error:', err)
    return { success: false, error: msg }
  }
}

/**
 * Get all marketplace product mappings for a connection.
 */
export async function getMarketplaceProducts(connectionId) {
  try {
    const { data, error } = await supabase
      .from('marketplace_products')
      .select(`
        *,
        local_product:products(id, name, sku, unit_price, category, image_url)
      `)
      .eq('connection_id', connectionId)
      .order('marketplace_name')

    if (error) {
      console.error('[marketplaceService] getMarketplaceProducts error:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[marketplaceService] getMarketplaceProducts error:', err)
    return []
  }
}

/**
 * Link a marketplace product to a local product.
 * @param {string} mappingId - marketplace_products.id
 * @param {string|null} localProductId - products.id (null to unlink)
 */
export async function linkProduct(mappingId, localProductId) {
  try {
    const { error } = await supabase
      .from('marketplace_products')
      .update({ local_product_id: localProductId })
      .eq('id', mappingId)

    if (error) {
      console.error('[marketplaceService] linkProduct error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('[marketplaceService] linkProduct error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Import a marketplace product as a new local product.
 */
export async function importProduct(mappingId) {
  try {
    // Get the mapping
    const { data: mapping, error: fetchError } = await supabase
      .from('marketplace_products')
      .select('*')
      .eq('id', mappingId)
      .single()

    if (fetchError || !mapping) {
      return { success: false, error: 'Mapping not found' }
    }

    // Create local product
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        business_id: mapping.business_id,
        name: mapping.marketplace_name,
        sku: mapping.marketplace_sku,
        unit_price: mapping.marketplace_price,
        category: mapping.marketplace_category,
        image_url: mapping.marketplace_image_url,
        unit: 'pcs',
        cost_price: 0,
        is_active: true,
      })
      .select('id')
      .single()

    if (productError) {
      console.error('[marketplaceService] importProduct insert error:', productError)
      return { success: false, error: productError.message }
    }

    // Create inventory record
    await supabase.from('inventory').insert({
      product_id: product.id,
      quantity: mapping.marketplace_stock,
      min_stock: 0,
      maximum_stock: 0,
    })

    // Link the mapping
    await supabase
      .from('marketplace_products')
      .update({ local_product_id: product.id })
      .eq('id', mappingId)

    return { success: true, product_id: product.id }
  } catch (err) {
    console.error('[marketplaceService] importProduct error:', err)
    return { success: false, error: err.message }
  }
}

// ══════════════════════════════════════════════════════════
// Inventory Sync
// ══════════════════════════════════════════════════════════

/**
 * Push stock updates to marketplace.
 * @param {string} connectionId
 * @param {string[]} [productIds] - specific product IDs to sync (all mapped if empty)
 */
export async function syncInventory(connectionId, productIds = []) {
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-sync-inventory', {
      body: { connection_id: connectionId, product_ids: productIds },
    })

    if (error) {
      const msg = error.message || error.toString()
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return { success: false, error: 'Fitur sync belum aktif. Hubungi admin.' }
      }
      console.error('[marketplaceService] syncInventory error:', error)
      return { success: false, error: msg }
    }

    return { success: true, ...data?.data }
  } catch (err) {
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return { success: false, error: 'Fitur sync belum aktif. Hubungi admin.' }
    }
    console.error('[marketplaceService] syncInventory error:', err)
    return { success: false, error: msg }
  }
}

// ══════════════════════════════════════════════════════════
// Order Sync
// ══════════════════════════════════════════════════════════

/**
 * Sync orders from marketplace.
 * @param {string} connectionId
 * @param {string} [since] - ISO date string to fetch orders since
 */
export async function syncOrders(connectionId, since) {
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-sync-orders', {
      body: { connection_id: connectionId, since },
    })

    if (error) {
      const msg = error.message || error.toString()
      if (msg.includes('FunctionsFetchError') ||
          msg.includes('Failed to send') ||
          msg.includes('404') ||
          msg.includes('Not Found')) {
        return { success: false, error: 'Fitur sync belum aktif. Hubungi admin.' }
      }
      console.error('[marketplaceService] syncOrders error:', error)
      return { success: false, error: msg }
    }

    return { success: true, ...data?.data }
  } catch (err) {
    const msg = err.message || err.toString()
    if (msg.includes('FunctionsFetchError') ||
        msg.includes('Failed to send') ||
        msg.includes('fetch')) {
      return { success: false, error: 'Fitur sync belum aktif. Hubungi admin.' }
    }
    console.error('[marketplaceService] syncOrders error:', err)
    return { success: false, error: msg }
  }
}

/**
 * Get marketplace orders for a connection or all connections.
 */
export async function getMarketplaceOrders(connectionId, filters = {}) {
  try {
    let query = supabase
      .from('marketplace_orders')
      .select('*')
      .order('marketplace_created_at', { ascending: false })

    if (connectionId) {
      query = query.eq('connection_id', connectionId)
    }

    if (filters.status) {
      query = query.eq('order_status', filters.status)
    }

    if (filters.limit) {
      query = query.limit(filters.limit)
    } else {
      query = query.limit(100)
    }

    const { data, error } = await query

    if (error) {
      console.error('[marketplaceService] getMarketplaceOrders error:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[marketplaceService] getMarketplaceOrders error:', err)
    return []
  }
}

// ══════════════════════════════════════════════════════════
// Sync Logs
// ══════════════════════════════════════════════════════════

/**
 * Get sync logs with optional filters.
 */
export async function getSyncLogs(filters = {}) {
  try {
    let query = supabase
      .from('marketplace_sync_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.marketplace) {
      query = query.eq('marketplace', filters.marketplace)
    }

    if (filters.sync_type) {
      query = query.eq('sync_type', filters.sync_type)
    }

    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    if (filters.connection_id) {
      query = query.eq('connection_id', filters.connection_id)
    }

    const limit = filters.limit || 50
    query = query.limit(limit)

    const { data, error } = await query

    if (error) {
      console.error('[marketplaceService] getSyncLogs error:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[marketplaceService] getSyncLogs error:', err)
    return []
  }
}
