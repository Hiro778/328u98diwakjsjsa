/**
 * Google Business Profile Service
 * Handles all GBP integration operations via Supabase Edge Functions.
 *
 * Credentials/tokens are NEVER stored or processed in the frontend.
 */

import { supabase } from './supabase'

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function handleFunctionError(error) {
  const msg = error?.message || error?.toString() || ''
  if (
    msg.includes('FunctionsFetchError') ||
    msg.includes('Failed to send') ||
    msg.includes('404') ||
    msg.includes('Not Found')
  ) {
    return { status: 'needs_setup', message: 'Google Business Profile belum aktif. Hubungi admin untuk mengaktifkan.' }
  }
  return { status: 'error', message: msg }
}

// ══════════════════════════════════════════════════════════
// OAuth Flow
// ══════════════════════════════════════════════════════════

/**
 * Initiate OAuth connection with Google Business Profile.
 * Returns the authorization URL to redirect the user to.
 */
export async function initiateOAuth() {
  try {
    const { data, error } = await supabase.functions.invoke('google-business-connect', {
      method: 'POST',
      body: {},
    })

    if (error) return handleFunctionError(error)
    return data?.data || { status: 'error', message: 'No response from server' }
  } catch (err) {
    return handleFunctionError(err)
  }
}

/**
 * Handle OAuth callback from Google.
 * Exchange authorization code for tokens (server-side).
 */
export async function handleOAuthCallback(code, state) {
  try {
    const { data, error } = await supabase.functions.invoke('google-business-callback', {
      body: { code, state },
    })

    if (error) return { success: false, status: 'error', error: error.message || error.toString() }
    return data?.data || { success: false, status: 'error', error: 'No response' }
  } catch (err) {
    const msg = err?.message || err?.toString() || ''
    if (msg.includes('FunctionsFetchError') || msg.includes('404')) {
      return { success: false, status: 'needs_setup', error: 'Google Business Profile belum aktif.' }
    }
    return { success: false, status: 'error', error: msg }
  }
}

// ══════════════════════════════════════════════════════════
// Connection Status
// ══════════════════════════════════════════════════════════

/**
 * Get current connection status, locations, and feature availability.
 */
export async function getConnectionStatus() {
  try {
    const { data, error } = await supabase.functions.invoke('google-business-status', {
      method: 'GET',
    })

    if (error) return handleFunctionError(error)
    return data?.data || null
  } catch (err) {
    return handleFunctionError(err)
  }
}

// ══════════════════════════════════════════════════════════
// Reviews
// ══════════════════════════════════════════════════════════

/**
 * List reviews for a location.
 */
export async function getReviews(locationId, pageToken) {
  try {
    let url = `google-business-reviews?location_id=${locationId}`
    if (pageToken) url += `&page_token=${pageToken}`

    const { data, error } = await supabase.functions.invoke(url, { method: 'GET' })

    if (error) return handleFunctionError(error)
    return data?.data || { available: false, reviews: [] }
  } catch (err) {
    return handleFunctionError(err)
  }
}

/**
 * Reply to a review.
 */
export async function replyToReview(locationId, reviewId, comment) {
  try {
    const { data, error } = await supabase.functions.invoke('google-business-reviews', {
      method: 'POST',
      body: { location_id: locationId, review_id: reviewId, comment },
    })

    if (error) return { success: false, error: error.message }
    return data?.data || { success: false, error: 'No response' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Delete reply from a review.
 */
export async function deleteReply(locationId, reviewId) {
  try {
    const { data, error } = await supabase.functions.invoke(
      `google-business-reviews?location_id=${locationId}&review_id=${reviewId}`,
      { method: 'DELETE' }
    )

    if (error) return { success: false, error: error.message }
    return data?.data || { success: false, error: 'No response' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ══════════════════════════════════════════════════════════
// Local Posts
// ══════════════════════════════════════════════════════════

/**
 * List local posts for a location.
 */
export async function getPosts(locationId, pageToken) {
  try {
    let url = `google-business-posts?location_id=${locationId}`
    if (pageToken) url += `&page_token=${pageToken}`

    const { data, error } = await supabase.functions.invoke(url, { method: 'GET' })

    if (error) return handleFunctionError(error)
    return data?.data || { available: false, posts: [] }
  } catch (err) {
    return handleFunctionError(err)
  }
}

/**
 * Create a local post.
 */
export async function createPost(locationId, { summary, call_to_action, url: ctaUrl }) {
  try {
    const { data, error } = await supabase.functions.invoke('google-business-posts', {
      method: 'POST',
      body: { location_id: locationId, summary, call_to_action, url: ctaUrl },
    })

    if (error) return { success: false, error: error.message }
    return data?.data || { success: false, error: 'No response' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Delete a local post.
 */
export async function deletePost(locationId, postId) {
  try {
    const { data, error } = await supabase.functions.invoke(
      `google-business-posts?location_id=${locationId}&post_id=${postId}`,
      { method: 'DELETE' }
    )

    if (error) return { success: false, error: error.message }
    return data?.data || { success: false, error: 'No response' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ══════════════════════════════════════════════════════════
// Performance
// ══════════════════════════════════════════════════════════

/**
 * Fetch performance metrics for a location.
 */
export async function getPerformance(locationId, { daily_metrics, start_date, end_date } = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('google-business-performance', {
      method: 'POST',
      body: { location_id: locationId, daily_metrics, start_date, end_date },
    })

    if (error) return handleFunctionError(error)
    return data?.data || { available: false, metrics: [] }
  } catch (err) {
    return handleFunctionError(err)
  }
}

/**
 * Get search keyword impressions.
 */
export async function getSearchKeywords(locationId) {
  try {
    const { data, error } = await supabase.functions.invoke(
      `google-business-performance?location_id=${locationId}`,
      { method: 'GET' }
    )

    if (error) return handleFunctionError(error)
    return data?.data || { available: false, searchKeywords: [] }
  } catch (err) {
    return handleFunctionError(err)
  }
}

// ══════════════════════════════════════════════════════════
// Disconnect
// ══════════════════════════════════════════════════════════

/**
 * Disconnect Google Business Profile.
 * Revokes OAuth access and removes stored credentials.
 */
export async function disconnect() {
  try {
    const { data, error } = await supabase.functions.invoke('google-business-disconnect', {
      method: 'POST',
      body: {},
    })

    if (error) return { success: false, error: error.message }
    return data?.data || { success: false, error: 'No response' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
