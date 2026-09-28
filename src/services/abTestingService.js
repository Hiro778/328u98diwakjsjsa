/**
 * A/B Testing Service
 *
 * Provides tenant-isolated CRUD for A/B experiments, variants, and results.
 * All operations against Supabase with RLS enforced server-side.
 */

import { supabase } from '../lib/supabase.js'

// ─────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────

export const CHANNELS = [
  'Instagram',
  'Facebook',
  'TikTok',
  'WhatsApp',
  'Email',
  'Website',
  'Other',
]

export const METRICS = [
  'CTR',
  'Conversion Rate',
  'Engagement Rate',
  'Leads',
  'Revenue',
  'Purchases',
  'Custom',
]

export const STATUSES = {
  draft: 'Draft',
  running: 'Running',
  completed: 'Completed',
  archived: 'Archived',
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

/**
 * Resolve current business_id from the authenticated Supabase session.
 * Returns null if not authenticated or no business found.
 */
export async function resolveBusinessId() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return null

  const { data, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (error || !data) return null
  return data.id
}

// ─────────────────────────────────────────────────────────
// EXPERIMENTS
// ─────────────────────────────────────────────────────────

/**
 * List all experiments for a business, newest first.
 */
export async function listExperiments(businessId) {
  if (!businessId) return { data: [], error: new Error('businessId required') }

  const { data, error } = await supabase
    .from('ab_experiments')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[ABTestingService] listExperiments error:', error)
    return { data: [], error }
  }
  return { data: data || [], error: null }
}

/**
 * Create a new experiment (status: draft) and its Variant A & B.
 * experimentData: { name, objective, channel, primary_metric, custom_metric?,
 *                   start_at?, end_at?, variantA: { name, content }, variantB: { name, content } }
 */
export async function createExperiment(businessId, experimentData) {
  if (!businessId) return { data: null, error: new Error('businessId required') }

  const { variantA, variantB, ...expFields } = experimentData

  // Insert experiment
  const { data: exp, error: expErr } = await supabase
    .from('ab_experiments')
    .insert({
      business_id: businessId,
      name: expFields.name,
      objective: expFields.objective,
      channel: expFields.channel,
      primary_metric: expFields.primary_metric,
      custom_metric: expFields.custom_metric || null,
      start_at: expFields.start_at || null,
      end_at: expFields.end_at || null,
      status: 'draft',
    })
    .select()
    .single()

  if (expErr) {
    console.error('[ABTestingService] createExperiment error:', expErr)
    return { data: null, error: expErr }
  }

  // Insert Variant A
  const { error: varAErr } = await supabase.from('ab_variants').insert({
    experiment_id: exp.id,
    business_id: businessId,
    variant_key: 'A',
    name: variantA.name,
    content: variantA.content,
  })

  if (varAErr) {
    console.error('[ABTestingService] createVariantA error:', varAErr)
    // Cleanup experiment on variant failure
    await supabase.from('ab_experiments').delete().eq('id', exp.id)
    return { data: null, error: varAErr }
  }

  // Insert Variant B
  const { error: varBErr } = await supabase.from('ab_variants').insert({
    experiment_id: exp.id,
    business_id: businessId,
    variant_key: 'B',
    name: variantB.name,
    content: variantB.content,
  })

  if (varBErr) {
    console.error('[ABTestingService] createVariantB error:', varBErr)
    await supabase.from('ab_experiments').delete().eq('id', exp.id)
    return { data: null, error: varBErr }
  }

  return { data: exp, error: null }
}

/**
 * Get full detail of an experiment: experiment + variants + latest results.
 */
export async function getExperiment(id, businessId) {
  if (!id || !businessId) return { data: null, error: new Error('id and businessId required') }

  const { data: exp, error: expErr } = await supabase
    .from('ab_experiments')
    .select('*')
    .eq('id', id)
    .eq('business_id', businessId)
    .single()

  if (expErr) {
    console.error('[ABTestingService] getExperiment error:', expErr)
    return { data: null, error: expErr }
  }

  const { data: variants, error: varErr } = await supabase
    .from('ab_variants')
    .select('*')
    .eq('experiment_id', id)
    .order('variant_key', { ascending: true })

  if (varErr) {
    console.error('[ABTestingService] getVariants error:', varErr)
    return { data: null, error: varErr }
  }

  const { data: results, error: resErr } = await supabase
    .from('ab_results')
    .select('*')
    .eq('experiment_id', id)

  if (resErr) {
    console.error('[ABTestingService] getResults error:', resErr)
    return { data: null, error: resErr }
  }

  return {
    data: {
      ...exp,
      variants: variants || [],
      results: results || [],
    },
    error: null,
  }
}

/**
 * Update a Draft experiment (name, objective, channel, primary_metric,
 * custom_metric, start_at, end_at, and optionally variant A/B).
 * Only allowed when status === 'draft'.
 */
export async function updateExperiment(id, businessId, updates) {
  if (!id || !businessId) return { data: null, error: new Error('id and businessId required') }

  const { variantA, variantB, ...expFields } = updates

  const allowedFields = [
    'name', 'objective', 'channel', 'primary_metric',
    'custom_metric', 'start_at', 'end_at',
  ]
  const expUpdate = {}
  for (const key of allowedFields) {
    if (key in expFields) expUpdate[key] = expFields[key]
  }
  expUpdate.updated_at = new Date().toISOString()

  const { data: exp, error: expErr } = await supabase
    .from('ab_experiments')
    .update(expUpdate)
    .eq('id', id)
    .eq('business_id', businessId)
    .eq('status', 'draft')
    .select()
    .single()

  if (expErr) {
    console.error('[ABTestingService] updateExperiment error:', expErr)
    return { data: null, error: expErr }
  }

  // Update Variant A if provided
  if (variantA) {
    await supabase
      .from('ab_variants')
      .update({
        name: variantA.name,
        content: variantA.content,
        updated_at: new Date().toISOString(),
      })
      .eq('experiment_id', id)
      .eq('variant_key', 'A')
  }

  // Update Variant B if provided
  if (variantB) {
    await supabase
      .from('ab_variants')
      .update({
        name: variantB.name,
        content: variantB.content,
        updated_at: new Date().toISOString(),
      })
      .eq('experiment_id', id)
      .eq('variant_key', 'B')
  }

  return { data: exp, error: null }
}

/**
 * Start a Draft experiment → status: 'running'
 */
export async function startExperiment(id, businessId) {
  if (!id || !businessId) return { data: null, error: new Error('id and businessId required') }

  const { data, error } = await supabase
    .from('ab_experiments')
    .update({
      status: 'running',
      start_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', businessId)
    .eq('status', 'draft')
    .select()
    .single()

  if (error) {
    console.error('[ABTestingService] startExperiment error:', error)
    return { data: null, error }
  }
  return { data, error: null }
}

/**
 * Complete a Running experiment → status: 'completed'
 */
export async function completeExperiment(id, businessId) {
  if (!id || !businessId) return { data: null, error: new Error('id and businessId required') }

  const { data, error } = await supabase
    .from('ab_experiments')
    .update({
      status: 'completed',
      end_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', businessId)
    .eq('status', 'running')
    .select()
    .single()

  if (error) {
    console.error('[ABTestingService] completeExperiment error:', error)
    return { data: null, error }
  }
  return { data, error: null }
}

/**
 * Archive a Completed (or Running) experiment → status: 'archived'
 */
export async function archiveExperiment(id, businessId) {
  if (!id || !businessId) return { data: null, error: new Error('id and businessId required') }

  const { data, error } = await supabase
    .from('ab_experiments')
    .update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', businessId)
    .in('status', ['completed', 'running'])
    .select()
    .single()

  if (error) {
    console.error('[ABTestingService] archiveExperiment error:', error)
    return { data: null, error }
  }
  return { data, error: null }
}

/**
 * Delete an experiment and all associated variants/results (cascade).
 * Allowed for all statuses (draft, running, completed, archived) by the business owner.
 */
export async function deleteExperiment(id, businessId) {
  if (!id || !businessId) return { error: new Error('id and businessId required') }

  const { error } = await supabase
    .from('ab_experiments')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)

  if (error) {
    console.error('[ABTestingService] deleteExperiment error:', error)
    return { error }
  }
  return { error: null }
}

// ─────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────

/**
 * Upsert result metrics for a specific variant of an experiment.
 * metricsObj: { impressions, clicks, conversions, engagement, leads, revenue, purchases }
 */
export async function saveResults(experimentId, variantId, businessId, metricsObj) {
  if (!experimentId || !variantId || !businessId) {
    return { data: null, error: new Error('experimentId, variantId, businessId required') }
  }

  const { data, error } = await supabase
    .from('ab_results')
    .upsert(
      {
        experiment_id: experimentId,
        variant_id: variantId,
        business_id: businessId,
        impressions: Number(metricsObj.impressions) || 0,
        clicks: Number(metricsObj.clicks) || 0,
        conversions: Number(metricsObj.conversions) || 0,
        engagement: Number(metricsObj.engagement) || 0,
        leads: Number(metricsObj.leads) || 0,
        revenue: Number(metricsObj.revenue) || 0,
        purchases: Number(metricsObj.purchases) || 0,
        recorded_at: new Date().toISOString(),
      },
      {
        onConflict: 'experiment_id,variant_id',
      }
    )
    .select()
    .single()

  if (error) {
    console.error('[ABTestingService] saveResults error:', error)
    return { data: null, error }
  }
  return { data, error: null }
}

// ─────────────────────────────────────────────────────────
// CALCULATIONS (pure, no side-effects)
// ─────────────────────────────────────────────────────────

/**
 * Calculate derived metrics from a raw result record.
 * All division-by-zero cases return null.
 *
 * @param {object} result - { impressions, clicks, conversions, engagement, leads, revenue, purchases }
 * @returns {object} - derived metrics (CTR, conversionRate, engagementRate, revenuePerImpression, revenuePerClick)
 */
export function calculateMetrics(result) {
  if (!result) return {}

  const impressions = Number(result.impressions) || 0
  const clicks = Number(result.clicks) || 0
  const conversions = Number(result.conversions) || 0
  const engagement = Number(result.engagement) || 0
  const revenue = Number(result.revenue) || 0

  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : null,
    engagementRate: impressions > 0 ? (engagement / impressions) * 100 : null,
    revenuePerImpression: impressions > 0 ? revenue / impressions : null,
    revenuePerClick: clicks > 0 ? revenue / clicks : null,
  }
}

/**
 * Compare two metric objects and compute diff + pct diff for a given metric key.
 *
 * @param {number|null} valA - value for variant A
 * @param {number|null} valB - value for variant B
 * @returns {{ diff: number|null, pctDiff: number|null }}
 */
export function compareMetric(valA, valB) {
  if (valA === null || valA === undefined || valB === null || valB === undefined) {
    return { diff: null, pctDiff: null }
  }
  const diff = valB - valA
  const pctDiff = valA !== 0 ? (diff / valA) * 100 : null
  return { diff, pctDiff }
}

// ─────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────

/**
 * Validate experiment form data.
 * @param {object} data
 * @returns {{ valid: boolean, errors: object }}
 */
export function validateExperiment(data = {}) {
  const errors = {}

  if (!data.name || !String(data.name).trim()) {
    errors.name = 'Nama eksperimen wajib diisi.'
  }

  if (!data.objective || !String(data.objective).trim()) {
    errors.objective = 'Tujuan eksperimen wajib diisi.'
  }

  if (!data.channel || !CHANNELS.includes(data.channel)) {
    errors.channel = 'Pilih channel yang valid.'
  }

  if (!data.primary_metric || !METRICS.includes(data.primary_metric)) {
    errors.primary_metric = 'Pilih metrik utama yang valid.'
  }

  if (data.primary_metric === 'Custom' && !String(data.custom_metric || '').trim()) {
    errors.custom_metric = 'Nama metrik kustom wajib diisi.'
  }

  const varA = data.variantA || {}
  const varB = data.variantB || {}

  if (!varA.name || !String(varA.name).trim()) {
    errors.variantA_name = 'Nama Variant A wajib diisi.'
  }
  if (!varA.content || !String(varA.content).trim()) {
    errors.variantA_content = 'Konten Variant A wajib diisi.'
  }
  if (!varB.name || !String(varB.name).trim()) {
    errors.variantB_name = 'Nama Variant B wajib diisi.'
  }
  if (!varB.content || !String(varB.content).trim()) {
    errors.variantB_content = 'Konten Variant B wajib diisi.'
  }

  // Variant A and B must be different (both name and content can't be identical simultaneously)
  if (
    varA.name &&
    varB.name &&
    varA.content &&
    varB.content &&
    String(varA.name).trim() === String(varB.name).trim() &&
    String(varA.content).trim() === String(varB.content).trim()
  ) {
    errors.variantB_content = 'Variant B harus berbeda dari Variant A.'
  }

  // start_at <= end_at
  if (data.start_at && data.end_at) {
    const start = new Date(data.start_at)
    const end = new Date(data.end_at)
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start > end) {
      errors.end_at = 'Tanggal akhir harus setelah tanggal mulai.'
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Check if an experiment status allows editing.
 */
export function isEditable(status) {
  return status === 'draft'
}

/**
 * Check if an experiment status allows result recording.
 */
export function canRecordResults(status) {
  return status === 'running'
}

/**
 * Check if an experiment status is read-only (archived).
 */
export function isReadOnly(status) {
  return status === 'archived'
}

/**
 * Check if an experiment status allows deletion.
 * All statuses (draft, running, completed, archived) can be deleted by business owner.
 */
export function canDelete(status) {
  return ['draft', 'running', 'completed', 'archived'].includes(status)
}
