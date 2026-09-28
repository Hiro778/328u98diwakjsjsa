// creativeStudioService.js
// Client-side service for Creative Studio
// All credit operations go through Edge Functions (server-side authoritative)
// Frontend NEVER determines cost — only sends action_type

import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Get current user's session token
 */
async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

/**
 * Resolve business_id for the current authenticated user.
 * Queries businesses table by owner_id (correct FK relationship).
 * Safely handles users with multiple businesses by ordering by created_at desc.
 */
export async function resolveBusinessId(explicitBusinessId = null) {
  if (explicitBusinessId) return explicitBusinessId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !business?.id) throw new Error('No business found');
  return business.id;
}

/**
 * Call an Edge Function with auth
 */
async function callEdgeFunction(functionName, body, businessId = null) {
  const token = await getSessionToken();
  if (!token) throw new Error('Not authenticated');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || '',
  };

  if (businessId) {
    headers['x-business-id'] = businessId;
  }

  const payload = { ...body };
  if (businessId && !payload.business_id) {
    payload.business_id = businessId;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Edge function error: ${response.status}`);
  }

  return data;
}

// ============================================================
// CREDIT OPERATIONS
// ============================================================

/**
 * Get current credit balance
 */
export async function getCreditBalance(businessId = null) {
  const resolvedBusinessId = await resolveBusinessId(businessId);

  const { data } = await supabase
    .from('creative_credits')
    .select('available, reserved, consumed, total_earned')
    .eq('business_id', resolvedBusinessId)
    .maybeSingle();

  return data || { available: 0, reserved: 0, consumed: 0, total_earned: 0 };
}

/**
 * Generate unique idempotency key for credit operations
 */
function generateIdempotencyKey(action, context) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${context}:${action}:${timestamp}:${random}`;
}

// ============================================================
// CAMPAIGN OPERATIONS
// ============================================================

/**
 * Create a new campaign
 */
export async function createCampaign(name, businessId = null) {
  const resolvedBusinessId = await resolveBusinessId(businessId);

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      business_id: resolvedBusinessId,
      name: name || 'New Campaign',
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * List campaigns for current business
 */
export async function listCampaigns(businessId = null) {
  const resolvedBusinessId = await resolveBusinessId(businessId);

  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('business_id', resolvedBusinessId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ============================================================
// CREATIVE BRIEF OPERATIONS
// ============================================================

/**
 * Create a creative brief
 */
export async function createCreativeBrief(campaignId, briefData, productId = null) {
  const { data, error } = await supabase
    .from('creative_briefs')
    .insert({
      campaign_id: campaignId,
      product_id: productId,
      brief_json: briefData,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get creative brief
 */
export async function getCreativeBrief(briefId) {
  const { data, error } = await supabase
    .from('creative_briefs')
    .select('*')
    .eq('id', briefId)
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// PRD OPERATIONS
// ============================================================

/**
 * Generate PRD from creative brief
 * Cost: 1 credit (determined server-side)
 */
export async function generatePRD(briefId, productId = null, businessId = null) {
  return callEdgeFunction('creative-generate-prd', {
    brief_id: briefId,
    product_id: productId,
    business_id: businessId,
  }, businessId);
}

/**
 * Revise existing PRD
 * Cost: 1 credit (determined server-side)
 */
export async function revisePRD(prdId, revisionInstructions, businessId = null) {
  return callEdgeFunction('creative-revise-prd', {
    prd_id: prdId,
    revision_instructions: revisionInstructions,
    business_id: businessId,
  }, businessId);
}

/**
 * Get PRD by ID
 */
export async function getPRD(prdId) {
  const { data, error } = await supabase
    .from('creative_prds')
    .select('*')
    .eq('id', prdId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * List PRDs for a brief
 */
export async function listPRDs(briefId) {
  const { data, error } = await supabase
    .from('creative_prds')
    .select('*')
    .eq('brief_id', briefId)
    .order('version', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ============================================================
// COPY OPERATIONS
// ============================================================

/**
 * Generate copy from approved PRD
 * Cost: 1 credit (determined server-side)
 */
export async function generateCopy(prdId) {
  return callEdgeFunction('creative-generate-copy', {
    prd_id: prdId,
  });
}

/**
 * Get asset by ID
 */
export async function getAsset(assetId) {
  const { data, error } = await supabase
    .from('creative_assets')
    .select('*')
    .eq('id', assetId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * List assets for a PRD
 */
export async function listAssets(prdId) {
  const { data, error } = await supabase
    .from('creative_assets')
    .select('*')
    .eq('prd_id', prdId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ============================================================
// GENERATION STATUS
// ============================================================

/**
 * Get generation status
 */
export async function getGenerationStatus(generationId) {
  const { data, error } = await supabase
    .from('creative_generations')
    .select('*')
    .eq('id', generationId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Poll generation until complete
 */
export async function pollGeneration(generationId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const gen = await getGenerationStatus(generationId);

    if (gen.status === 'completed' || gen.status === 'failed') {
      return gen;
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Generation timed out');
}

// ============================================================
// VIDEO GENERATOR (ATLAS CLOUD)
// ============================================================

/**
 * Generate video using Atlas Cloud provider (bytedance/seedance-2.0-mini/text-to-video)
 * Backend edge function: creative-generate-video
 */
export async function generateVideo({ prdId = null, prompt = '', imageUrl = null, duration = 8 } = {}) {
  return callEdgeFunction('creative-generate-video', {
    action: 'generate',
    prd_id: prdId,
    prompt,
    image_url: imageUrl,
    duration,
  });
}

/**
 * Check Atlas Cloud video generation status
 */
export async function getVideoGenerationStatus(taskId, generationId = null, assetId = null) {
  return callEdgeFunction('creative-generate-video', {
    action: 'status',
    task_id: taskId,
    generation_id: generationId,
    asset_id: assetId,
  });
}

/**
 * Poll Atlas Cloud video generation until complete or failed (max 60 attempts, 5s interval)
 */
export async function pollVideoGeneration(taskId, generationId = null, assetId = null, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await getVideoGenerationStatus(taskId, generationId, assetId);
    if (res.status === 'completed' || res.status === 'failed') {
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Video generation timed out');
}

