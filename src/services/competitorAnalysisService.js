// competitorAnalysisService.js
// Client-side service for Competitor Analysis
// All research/analysis operations go through Edge Functions (server-side)

import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Get current session token
 */
async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

/**
 * Resolve business_id for current authenticated user
 */
async function resolveBusinessId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single();

  if (error || !business?.id) throw new Error('No business found');
  return business.id;
}

/**
 * Call Edge Function with auth
 */
async function callEdgeFunction(functionName, body) {
  const token = await getSessionToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Edge function error: ${response.status}`);
  }

  return data;
}

// ============================================================
// ANALYSIS OPERATIONS
// ============================================================

/**
 * Create a new competitor analysis
 */
export async function createAnalysis(title, competitors, businessContext = {}) {
  const businessId = await resolveBusinessId();

  const { data, error } = await supabase
    .from('competitor_analyses')
    .insert({
      business_id: businessId,
      title: title || 'New Analysis',
      status: 'draft',
      input_data: {
        competitors,
        business_context: businessContext,
      },
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update analysis input data (add more competitors, etc.)
 */
export async function updateAnalysis(analysisId, updates) {
  const { data, error } = await supabase
    .from('competitor_analyses')
    .update(updates)
    .eq('id', analysisId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Add a competitor to an analysis
 */
export async function addCompetitor(analysisId, competitor) {
  const { data: analysis, error: analysisError } = await supabase
    .from('competitor_analyses')
    .select('input_data, status')
    .eq('id', analysisId)
    .single();

  if (analysisError || !analysis) throw new Error('Analysis not found');

  const competitors = analysis.input_data.competitors || [];
  competitors.push(competitor);

  return updateAnalysis(analysisId, {
    input_data: {
      ...analysis.input_data,
      competitors,
    },
  });
}

/**
 * Remove a competitor from analysis
 */
export async function removeCompetitor(analysisId, competitorIndex) {
  const { data: analysis } = await supabase
    .from('competitor_analyses')
    .select('input_data')
    .eq('id', analysisId)
    .single();

  if (!analysis) throw new Error('Analysis not found');

  const competitors = analysis.input_data.competitors || [];
  competitors.splice(competitorIndex, 1);

  return updateAnalysis(analysisId, {
    input_data: {
      ...analysis.input_data,
      competitors,
    },
  });
}

// ============================================================
// RESEARCH OPERATIONS
// ============================================================

/**
 * Start research for a competitor
 * Returns research task ID
 */
export async function startCompetitorResearch(analysisId, competitorId, competitorName, options = {}) {
  const { website, location, industry } = options;

  return callEdgeFunction('competitor-research', {
    analysis_id: analysisId,
    competitor_id: competitorId,
    competitor_name: competitorName,
    website: website || null,
    location: location || null,
    industry: industry || null,
  });
}

/**
 * Check research task status
 */
export async function getResearchTaskStatus(taskId) {
  const { data, error } = await supabase
    .from('competitor_research_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Poll research task until complete
 */
export async function pollResearchTask(taskId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const task = await getResearchTaskStatus(taskId);

    if (['completed', 'cached', 'failed'].includes(task.status)) {
      return task;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Research timed out');
}

/**
 * Start research for all competitors in an analysis
 * Returns array of task IDs
 */
export async function startAllResearch(analysisId) {
  const { data: analysis, error: analysisError } = await supabase
    .from('competitor_analyses')
    .select('input_data')
    .eq('id', analysisId)
    .single();

  if (analysisError || !analysis) throw new Error('Analysis not found');

  const competitors = analysis.input_data.competitors || [];

  if (competitors.length === 0) {
    throw new Error('No competitors to research');
  }

  // Update analysis status
  await supabase
    .from('competitor_analyses')
    .update({ status: 'researching' })
    .eq('id', analysisId);

  // Create research tasks and start them
  const taskIds = [];
  for (const competitor of competitors) {
    const { data: task, error: taskError } = await supabase
      .from('competitor_research_tasks')
      .insert({
        analysis_id: analysisId,
        competitor_id: competitor.id || crypto.randomUUID(),
        competitor_name: competitor.name,
        website: competitor.website || null,
        location: competitor.location || null,
        industry: competitor.industry || null,
        status: 'pending',
        progress: 0,
      })
      .select()
      .single();

    if (taskError) {
      console.error('Failed to create research task:', taskError);
      continue;
    }

    taskIds.push(task.id);
  }

  return taskIds;
}

/**
 * Check if all research tasks are complete
 */
export async function checkResearchComplete(analysisId) {
  const { data: tasks } = await supabase
    .from('competitor_research_tasks')
    .select('status')
    .eq('analysis_id', analysisId);

  if (!tasks || tasks.length === 0) return false;

  const allComplete = tasks.every(
    (t) => ['completed', 'cached', 'failed'].includes(t.status)
  );

  return allComplete;
}

// ============================================================
// ANALYSIS OPERATIONS
// ============================================================

/**
 * Start AI analysis of compiled research data
 */
export async function startAnalysis(analysisId) {
  return callEdgeFunction('competitor-analyze', {
    analysis_id: analysisId,
  });
}

/**
 * Get analysis by ID
 */
export async function getAnalysis(analysisId) {
  const { data, error } = await supabase
    .from('competitor_analyses')
    .select(`
      *,
      competitor_research_tasks(*)
    `)
    .eq('id', analysisId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * List analyses for current business
 */
export async function listAnalyses() {
  const businessId = await resolveBusinessId();

  const { data, error } = await supabase
    .from('competitor_analyses')
    .select(`
      id,
      title,
      status,
      input_data,
      analysis_data,
      created_at,
      updated_at
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Delete an analysis
 */
export async function deleteAnalysis(analysisId) {
  const { error } = await supabase
    .from('competitor_analyses')
    .delete()
    .eq('id', analysisId);

  if (error) throw error;
  return true;
}

// ============================================================
// HISTORY & CACHE
// ============================================================

/**
 * Get cache status for a competitor
 * Returns true if cached data exists and is valid (within 7 days)
 */
export async function checkCompetitorCache(competitorName, options = {}) {
  const businessId = await resolveBusinessId();

  const { data, error } = await supabase.rpc('competitor_cache_exists', {
    p_business_id: businessId,
    p_competitor_name: competitorName,
    p_website: options.website || null,
    p_location: options.location || null,
    p_industry: options.industry || null,
  });

  if (error) throw error;
  return data;
}

/**
 * Get cached research data for a competitor
 */
export async function getCompetitorCache(competitorName, options = {}) {
  const businessId = await resolveBusinessId();

  const { data, error } = await supabase.rpc('get_competitor_cache', {
    p_business_id: businessId,
    p_competitor_name: competitorName,
    p_website: options.website || null,
    p_location: options.location || null,
    p_industry: options.industry || null,
  });

  if (error) throw error;
  return data;
}

/**
 * Save research data to cache (for manual cache population)
 */
export async function saveToCache(competitorName, researchData, options = {}) {
  const businessId = await resolveBusinessId();

  const { error } = await supabase
    .from('competitor_research_cache')
    .upsert({
      business_id: businessId,
      competitor_name: competitorName,
      website: options.website || null,
      location: options.location || null,
      industry: options.industry || null,
      research_data: researchData,
      sources: options.sources || [],
    })
    .select();

  if (error) throw error;
  return true;
}

/**
 * Clear cache for a competitor (force re-research)
 */
export async function clearCache(competitorName, options = {}) {
  const businessId = await resolveBusinessId();

  const { error } = await supabase
    .from('competitor_research_cache')
    .delete()
    .eq('business_id', businessId)
    .eq('competitor_name', competitorName)
    .eq('website', options.website || '')
    .eq('location', options.location || '')
    .eq('industry', options.industry || '');

  if (error) throw error;
  return true;
}
