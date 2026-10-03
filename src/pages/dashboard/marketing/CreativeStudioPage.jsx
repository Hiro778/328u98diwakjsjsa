import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router';
import BackButton from '../../../components/BackButton';
import {
  createCampaign,
  listCampaigns,
  createCreativeBrief,
  generatePRD,
  revisePRD,
  listPRDs,
  generateOpenGenerativeVideo,
  pollOpenGenerativeVideo,
} from '../../../services/creativeStudioService';
import { getCreditOverview } from '../../../services/creativeCreditService';
import { supabase } from '../../../lib/supabase';

// ============================================================
// Token Cost Constants (SINGLE SOURCE OF TRUTH: 20 Tokens per ai.md)
// Server determines cost, these are for UI display and pre-checks
// ============================================================
const CREDIT_COSTS = {
  prd_generate: 20,
  prd_revision: 20,
  copy_generate: 20,
};

export default function CreativeStudioPage() {
  const { user, business, isPro, refreshFreeAiUsage } = useAuth();
  const navigate = useNavigate();

  // State
  const [credits, setCredits] = useState(null);
  const [creditOverview, setCreditOverview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [brief, setBrief] = useState(null);
  const [prd, setPrd] = useState(null);
  const [, setPrdVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('campaign'); // campaign | brief | prd (PRD is terminal)

  // AI Video generator state (Phase 12 Integration)
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState(null);
  const [videoError, setVideoError] = useState(null);

  // Brief form state
  const [briefForm, setBriefForm] = useState({
    campaign_name: '',
    objective: '',
    target_audience: '',
    vibe_style: '',
    platform: '',
    cta: '',
    offer_promo: '',
    duration_seconds: '',
    language: 'id',
    negative_constraints: '',
    brand_constraints: '',
    additional_instructions: '',
  });

  // PRD revision state
  const [revisionInstructions, setRevisionInstructions] = useState('');

  // Product selection
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);

  // ============================================================
  // INITIALIZATION
  // ============================================================

  useEffect(() => {
    if (user) {
      loadCredits();
      loadCampaigns();
      loadProducts();
    }
  }, [user, business?.id]);

  async function loadCredits(overrideBusinessId = null) {
    try {
      const targetBizId = overrideBusinessId || selectedCampaign?.business_id || business?.id;
      if (!targetBizId) return;
      const ov = await getCreditOverview(targetBizId);
      setCreditOverview(ov);
      setCredits(ov.balance);
      if (refreshFreeAiUsage) {
        refreshFreeAiUsage();
      }
    } catch (err) {
      console.error('Failed to load credits:', err);
    }
  }

  async function loadCampaigns() {
    try {
      const list = await listCampaigns(business?.id);
      setCampaigns(list);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      setCampaigns([]);
    }
  }

  async function loadProducts(overrideBusinessId = null) {
    const targetBizId = overrideBusinessId || selectedCampaign?.business_id || business?.id;
    if (!targetBizId) return;
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, unit_price, description')
        .eq('business_id', targetBizId)
        .eq('is_active', true)
        .order('name');
      setProducts(data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  }

  // ============================================================
  // CAMPAIGN OPERATIONS
  // ============================================================

  async function handleCreateCampaign() {
    setLoading(true);
    setError(null);
    try {
      const campaign = await createCampaign(briefForm.campaign_name || 'New Campaign', business?.id);
      setSelectedCampaign(campaign);
      if (campaign?.business_id) {
        loadCredits(campaign.business_id);
        loadProducts(campaign.business_id);
      }
      setStep('brief');
    } catch (err) {
      console.error('Failed to create campaign:', err);
      setError(err?.message || 'Terjadi kendala saat membuat campaign. Pastikan skema database telah aktif dan silakan coba kembali.');
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // BRIEF OPERATIONS
  // ============================================================

  async function handleSubmitBrief() {
    setLoading(true);
    setError(null);
    try {
      if (!selectedCampaign?.id) {
        throw new Error('Campaign context tidak ditemukan.');
      }
      const briefData = await createCreativeBrief(
        selectedCampaign.id,
        briefForm,
        selectedProductId
      );
      setBrief(briefData);
      setStep('prd');
      if (selectedCampaign.business_id) {
        await loadCredits(selectedCampaign.business_id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // PRD OPERATIONS (TERMINAL STEP)
  // ============================================================

  async function handleGeneratePRD() {
    setLoading(true);
    setError(null);
    try {
      // Authoritative source of truth: campaign.business_id
      let targetBusinessId = selectedCampaign?.business_id || business?.id;
      if (!targetBusinessId && brief?.campaign_id) {
        const { data: cData } = await supabase
          .from('campaigns')
          .select('id, business_id, name')
          .eq('id', brief.campaign_id)
          .maybeSingle();
        if (cData?.business_id) {
          targetBusinessId = cData.business_id;
          if (!selectedCampaign) setSelectedCampaign(cData);
        }
      }

      if (!targetBusinessId) {
        throw new Error('Business context tidak ditemukan untuk campaign ini.');
      }

      const result = await generatePRD(brief.id, selectedProductId, targetBusinessId);
      setPrd({
        id: result.prdId,
        prd_content: result.prdContent,
        version: 1,
        status: 'ready',
        is_free_generation: Boolean(result.isFreeUsage || result.prdContent?.is_free_generation),
      });
      setCredits(result.credits);
      // TERMINAL STEP: Stop at PRD, remain on 'prd' step
      setStep('prd');
      const versions = await listPRDs(brief.id);
      setPrdVersions(versions);
      if (refreshFreeAiUsage) {
        await refreshFreeAiUsage();
      }
      await loadCredits(targetBusinessId);
    } catch (err) {
      setError(err.message || 'Business context tidak ditemukan untuk campaign ini.');
      await loadCredits(selectedCampaign?.business_id || business?.id);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevisePRD() {
    if (!revisionInstructions.trim()) return;
    setLoading(true);
    setError(null);
    try {
      let targetBusinessId = selectedCampaign?.business_id || business?.id;
      if (!targetBusinessId && brief?.campaign_id) {
        const { data: cData } = await supabase
          .from('campaigns')
          .select('id, business_id, name')
          .eq('id', brief.campaign_id)
          .maybeSingle();
        if (cData?.business_id) {
          targetBusinessId = cData.business_id;
          if (!selectedCampaign) setSelectedCampaign(cData);
        }
      }

      if (!targetBusinessId) {
        throw new Error('Business context tidak ditemukan untuk campaign ini.');
      }

      const result = await revisePRD(prd.id, revisionInstructions, targetBusinessId);
      setPrd({
        id: result.prdId,
        prd_content: result.prdContent,
        version: result.version,
        status: 'ready',
        is_free_generation: Boolean(prd?.is_free_generation),
      });
      setCredits(result.credits);
      setRevisionInstructions('');
      const versions = await listPRDs(brief.id);
      setPrdVersions(versions);
      setStep('prd');
      await loadCredits(targetBusinessId);
    } catch (err) {
      setError(err.message || 'Business context tidak ditemukan untuk campaign ini.');
      await loadCredits(selectedCampaign?.business_id || business?.id);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // AI VIDEO GENERATION (PHASE 12 - OPEN-GENERATIVE-AI)
  // ============================================================

  async function handleGenerateVideo() {
    setVideoError(null);
    setVideoResult(null);

    if (!isPro) {
      setVideoError('PRO_REQUIRED: Fitur AI Video Generator membutuhkan langganan BisnisSehat Pro.');
      return;
    }

    const available = credits?.available ?? 0;
    if (available < 20) {
      setVideoError('INSUFFICIENT_CREDITS: Saldo Creative Credits tidak mencukupi (dibutuhkan 20 kredit).');
      return;
    }

    setVideoLoading(true);
    try {
      const targetBizId = selectedCampaign?.business_id || business?.id;
      const prompt =
        prd?.prd_content?.video_script ||
        prd?.prd_content?.video_concept ||
        prd?.prd_content?.headline ||
        'Video promosi produk UMKM';

      const genRes = await generateOpenGenerativeVideo({
        prdId: prd?.id,
        prompt,
        businessId: targetBizId,
      });

      if (genRes?.taskId) {
        const pollRes = await pollOpenGenerativeVideo(genRes.taskId, genRes.generationId, genRes.assetId, targetBizId);
        setVideoResult(pollRes?.videoUrl || pollRes);
      } else {
        setVideoResult(genRes);
      }
      await loadCredits(targetBizId);
    } catch (err) {
      setVideoError(err.message || 'PROVIDER_ERROR: Terjadi kendala saat generate video.');
    } finally {
      setVideoLoading(false);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  if (!user || !business) {
    return (
      <div className="p-6 text-center text-gray-500">
        Loading...
      </div>
    );
  }

  const hasFreeTrial = Boolean(creditOverview?.freeUsageAvailable);
  const availableCredits = credits?.available ?? 0;
  const canGeneratePRD = hasFreeTrial || availableCredits >= CREDIT_COSTS.prd_generate;
  const canRevisePRD = availableCredits >= CREDIT_COSTS.prd_revision;

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 min-w-0 w-full">
      <BackButton fallbackUrl="/dashboard/marketing" label="Kembali" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">AI Creative Studio</h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            Generate marketing brief and PRD with AI assistance
          </p>
        </div>

        {/* Credit Balance & Free AI Badge */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
          {creditOverview && (
            <div className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 sm:px-4 py-2 rounded-xl shadow-sm">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Creative Credits
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-extrabold text-blue-600 dark:text-blue-400">
                    {creditOverview.balance?.available ?? 0}
                  </span>
                  <span className="text-xs text-gray-400">Credits</span>
                </div>
              </div>
              <div className="h-7 w-px bg-gray-200 dark:bg-gray-800" />
              <div className="text-xs">
                {creditOverview.freeUsageAvailable ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300">
                    🎁 1x AI Gratis
                  </span>
                ) : (
                  <span className="text-gray-500 text-xs">
                    {creditOverview.monthConsumed ?? 0} dipakai bulan ini
                  </span>
                )}
              </div>
            </div>
          )}
          {isPro ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
              ⭐ Pro • 15.000 Kredit/bln
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border-blue-500/20">
              Akses Basic (Top up kredit terpisah)
            </span>
          )}
          <button
            onClick={() => navigate('/dashboard/marketing/credits')}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm cursor-pointer shrink-0"
          >
            + Top Up
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Progress Steps: Campaign -> Brief -> PRD (Workflow stops at PRD) */}
      <div className="flex items-center mb-6 sm:mb-8 text-xs sm:text-sm overflow-x-auto pb-2 min-w-0 w-full">
        {['campaign', 'brief', 'prd'].map((s, i) => (
          <div key={s} className="flex items-center shrink-0">
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-semibold text-xs ${
                step === s
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : ['campaign', 'brief', 'prd'].indexOf(step) > i
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`ml-1.5 sm:ml-2 font-medium ${
                step === s ? 'text-indigo-600' : 'text-gray-500'
              }`}
            >
              {s === 'prd' ? 'PRD' : s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 2 && <div className="w-5 sm:w-12 h-px bg-gray-300 mx-1.5 sm:mx-3 shrink-0"></div>}
          </div>
        ))}
      </div>

      {/* STEP 1: Campaign */}
      {step === 'campaign' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Create Campaign</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={briefForm.campaign_name}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, campaign_name: e.target.value })
                }
                placeholder="e.g., Product Launch Q4 2024"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleCreateCampaign}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>

            {/* List existing campaigns if any */}
            {campaigns.length > 0 && (
              <div className="pt-4 border-t border-gray-100">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Atau Pilih Campaign Tersimpan
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {campaigns.map((c) => (
                    <div
                      key={c.id}
                      onClick={async () => {
                        setSelectedCampaign(c);
                        if (c?.business_id) {
                          loadCredits(c.business_id);
                          loadProducts(c.business_id);
                        }
                        setBriefForm(prev => ({ ...prev, campaign_name: c.name }));
                        try {
                          const { data: briefs } = await supabase
                            .from('creative_briefs')
                            .select('*')
                            .eq('campaign_id', c.id)
                            .order('created_at', { ascending: false })
                            .limit(1);
                          if (briefs && briefs.length > 0) {
                            const b = briefs[0];
                            setBrief(b);
                            if (b.product_id) setSelectedProductId(b.product_id);
                            if (b.brief_json) {
                              setBriefForm(prev => ({
                                ...prev,
                                campaign_name: c.name,
                                ...b.brief_json,
                              }));
                            }
                            const prds = await listPRDs(b.id);
                            if (prds && prds.length > 0) {
                              setPrd(prds[0]);
                              setPrdVersions(prds);
                              setStep('prd');
                              return;
                            }
                            setStep('prd');
                            return;
                          }
                        } catch (err) {
                          console.error('Error fetching campaign details:', err);
                        }
                        setStep('brief');
                      }}
                      className="p-3 border border-gray-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer transition-colors flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-gray-800">{c.name}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(c.created_at).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Creative Brief */}
      {step === 'brief' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Creative Brief</h2>
          <p className="text-sm text-gray-600 mb-4">
            Describe your marketing content needs. All fields are free text — type what you want.
          </p>

          {/* Product Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Product (Optional)
            </label>
            <select
              value={selectedProductId || ''}
              onChange={(e) => setSelectedProductId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No product selected</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ''} — Rp{p.unit_price?.toLocaleString()}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              AI will use actual product data from your database
            </p>
          </div>

          {/* Brief Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Objective *
              </label>
              <textarea
                value={briefForm.objective}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, objective: e.target.value })
                }
                placeholder="What should this content achieve?"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Audience *
              </label>
              <textarea
                value={briefForm.target_audience}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, target_audience: e.target.value })
                }
                placeholder="Who is this content for?"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vibe / Style *
              </label>
              <textarea
                value={briefForm.vibe_style}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, vibe_style: e.target.value })
                }
                placeholder="e.g., Energetic, Minimalist, Professional, Playful..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Platform *
                </label>
                <input
                  type="text"
                  value={briefForm.platform}
                  onChange={(e) =>
                    setBriefForm({ ...briefForm, platform: e.target.value })
                  }
                  placeholder="e.g., Instagram, TikTok, LinkedIn"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Call to Action (CTA)
                </label>
                <input
                  type="text"
                  value={briefForm.cta}
                  onChange={(e) =>
                    setBriefForm({ ...briefForm, cta: e.target.value })
                  }
                  placeholder="e.g., Shop Now, Link in Bio"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Offer / Promo
                </label>
                <input
                  type="text"
                  value={briefForm.offer_promo}
                  onChange={(e) =>
                    setBriefForm({ ...briefForm, offer_promo: e.target.value })
                  }
                  placeholder="e.g., Free Shipping, 20% Off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Language
                </label>
                <input
                  type="text"
                  value={briefForm.language}
                  onChange={(e) =>
                    setBriefForm({ ...briefForm, language: e.target.value })
                  }
                  placeholder="id"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (seconds, for video)
              </label>
              <input
                type="text"
                value={briefForm.duration_seconds}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, duration_seconds: e.target.value })
                }
                placeholder="5-8"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Negative Constraints
              </label>
              <textarea
                value={briefForm.negative_constraints}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, negative_constraints: e.target.value })
                }
                placeholder="What to avoid? (e.g., no stock photos, no bright colors)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Instructions
              </label>
              <textarea
                value={briefForm.additional_instructions}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, additional_instructions: e.target.value })
                }
                placeholder="Any other requirements or context?"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('campaign')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={handleSubmitBrief}
              disabled={loading || !briefForm.objective || !briefForm.target_audience || !briefForm.vibe_style || !briefForm.platform}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Saving...' : 'Save Brief'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Generate & Review PRD (TERMINAL STEP) */}
      {step === 'prd' && (
        <div className="space-y-6">
          {!prd ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Generate AI Creative PRD</h2>
              <p className="text-sm text-gray-600 mb-4">
                AI will analyze your brief and product data to create a comprehensive creative PRD.
              </p>

              {/* Brief Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-gray-700 mb-2">Brief Summary</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-gray-500">Objective:</dt>
                  <dd className="text-gray-900">{briefForm.objective}</dd>
                  <dt className="text-gray-500">Audience:</dt>
                  <dd className="text-gray-900">{briefForm.target_audience}</dd>
                  <dt className="text-gray-500">Style:</dt>
                  <dd className="text-gray-900">{briefForm.vibe_style}</dd>
                  <dt className="text-gray-500">Platform:</dt>
                  <dd className="text-gray-900">{briefForm.platform}</dd>
                </dl>
              </div>

              {/* Product Info */}
              {selectedProductId && (
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <h3 className="font-medium text-blue-700 mb-2">Selected Product</h3>
                  {products.find(p => p.id === selectedProductId) && (
                    <p className="text-sm text-blue-900">
                      {products.find(p => p.id === selectedProductId).name}
                      {' — '}
                      Rp{products.find(p => p.id === selectedProductId).unit_price?.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>Credit Cost:</strong> {hasFreeTrial ? '0 credit (Gratis 1x Trial)' : `${CREDIT_COSTS.prd_generate} credit`}
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  {hasFreeTrial
                    ? 'Anda memiliki kuota 1x AI gratis seumur hidup'
                    : `You have ${availableCredits} credits remaining`}
                </p>
              </div>

              {!canGeneratePRD && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Batas Penggunaan Gratis Tercapai</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Kuota 1x AI gratis telah digunakan. Upgrade ke Pro atau top up Creative Credits untuk melanjutkan pembuatan konten.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
                  >
                    Upgrade ke Pro
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('brief')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={handleGeneratePRD}
                  disabled={loading || !canGeneratePRD}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? 'Generating...' : 'Generate PRD'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Hasil Creative PRD (v{prd.version})
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tahap akhir: PRD telah tersimpan dan siap digunakan untuk panduan konten Anda.
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                  ✓ PRD Selesai
                </span>
              </div>

              {/* PRD Content */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-96 overflow-y-auto border border-gray-200">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                  {JSON.stringify(prd.prd_content, null, 2)}
                </pre>
              </div>

              {/* Revision Form */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-700 mb-2">Minta Revisi PRD</h3>
                <p className="text-xs text-gray-500 mb-2">
                  Jelaskan perubahan yang diinginkan. Biaya: {CREDIT_COSTS.prd_revision} credit.
                </p>
                {!canRevisePRD && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-3 text-xs flex items-center justify-between">
                    <span>Kredit tidak cukup untuk revisi ({CREDIT_COSTS.prd_revision} kredit diperlukan).</span>
                    <button
                      onClick={() => navigate('/pricing')}
                      className="font-semibold text-indigo-600 hover:underline ml-2 cursor-pointer"
                    >
                      Upgrade ke Pro
                    </button>
                  </div>
                )}
                <textarea
                  value={revisionInstructions}
                  onChange={(e) => setRevisionInstructions(e.target.value)}
                  placeholder="Contoh: Buat headline lebih menarik, sesuaikan tone agar lebih kasual..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 mb-3"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleRevisePRD}
                    disabled={loading || !revisionInstructions.trim() || !canRevisePRD}
                    className="px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading ? 'Revising...' : 'Revise PRD'}
                  </button>
                </div>
              </div>

              {/* Terminal Actions: Back to brief or Start New Campaign */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-200 mt-6">
                <button
                  onClick={() => setStep('brief')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  Kembali ke Brief
                </button>
                <button
                  onClick={() => {
                    setSelectedCampaign(null);
                    setBrief(null);
                    setPrd(null);
                    setPrdVersions([]);
                    setBriefForm({
                      campaign_name: '',
                      objective: '',
                      target_audience: '',
                      vibe_style: '',
                      platform: '',
                      cta: '',
                      offer_promo: '',
                      duration_seconds: '',
                      language: 'id',
                      negative_constraints: '',
                      brand_constraints: '',
                      additional_instructions: '',
                    });
                    setSelectedProductId(null);
                    setStep('campaign');
                    loadCampaigns();
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  + Buat Campaign Baru
                </button>
              </div>
            </div>
          )}

          {/* Feature: Generate Video (AI Video Generator - Coming Soon per struk.md) */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-800">Generate Video (AI Video Generator)</h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    COMING SOON
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Buat video promosi otomatis berdurasi 8 detik berdasarkan naskah PRD Anda menggunakan backend Atlas Cloud & Open-Generative-AI.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs text-gray-600">
                  <p className="font-medium text-gray-700">Integrasi backend Atlas Cloud & Open-Generative-AI aktif & terverifikasi.</p>
                  <p className="text-gray-500 mt-0.5">
                    Fitur antarmuka publik sedang dalam tahap finalisasi dan segera dibuka untuk seluruh pengguna.
                  </p>
                </div>
                {!isPro ? (
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 bg-gray-200 text-gray-400 text-xs font-semibold rounded-lg cursor-not-allowed shrink-0"
                  >
                    Coming Soon
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={videoLoading || (credits?.available ?? 0) < 20}
                    onClick={handleGenerateVideo}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg shrink-0 ${
                      videoLoading || (credits?.available ?? 0) < 20
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'
                    }`}
                  >
                    {videoLoading ? 'Memproses Video...' : 'Generate Video (20 Kredit)'}
                  </button>
                )}
              </div>

              {/* State: Pro-required state reminder */}
              {!isPro && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between">
                  <span>AI Video Generator eksklusif untuk pelanggan BisnisSehat Pro.</span>
                  <button
                    type="button"
                    onClick={() => navigate('/pricing')}
                    className="underline font-semibold hover:text-blue-900 cursor-pointer ml-2"
                  >
                    Upgrade ke Pro
                  </button>
                </div>
              )}

              {/* State: Insufficient credit state */}
              {isPro && (credits?.available ?? 0) < 20 && !videoLoading && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
                  <span>Saldo tidak cukup (tersedia: {credits?.available ?? 0} kredit, dibutuhkan 20).</span>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/marketing/creative-credits')}
                    className="underline font-semibold hover:text-amber-900 cursor-pointer ml-2"
                  >
                    Top Up Kredit
                  </button>
                </div>
              )}

              {/* State: Provider error state */}
              {videoError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {videoError}
                </div>
              )}

              {/* State: Loading state */}
              {videoLoading && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Sedang memproses video melalui AI engine... Mohon tunggu beberapa saat.</span>
                </div>
              )}

              {/* State: Success state */}
              {videoResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                  <p className="font-semibold mb-2">Video Berhasil Dibuat!</p>
                  {typeof videoResult === 'string' && videoResult.startsWith('http') ? (
                    <div className="space-y-2">
                      <video controls className="w-full max-w-xs rounded-lg shadow-sm" src={videoResult} />
                      <a href={videoResult} target="_blank" rel="noopener noreferrer" className="inline-block text-indigo-600 underline font-medium">
                        Unduh Video
                      </a>
                    </div>
                  ) : (
                    <p className="text-gray-600">Task video selesai diproses oleh AI video engine.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
