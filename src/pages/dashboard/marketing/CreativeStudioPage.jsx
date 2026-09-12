import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router';
import {
  createCampaign,
  listCampaigns,
  createCreativeBrief,
  getCreativeBrief,
  generatePRD,
  revisePRD,
  listPRDs,
  generateCopy,
  listAssets,
  getCreditBalance,
} from '../../../services/creativeStudioService';
import { supabase } from '../../../lib/supabase';

// ============================================================
// Credit Cost Constants (PROPOSED BUSINESS RULE)
// Server determines cost, these are for UI display only
// ============================================================
const CREDIT_COSTS = {
  prd_generate: 1,
  prd_revision: 1,
  copy_generate: 1,
  image_standard: 2,
  image_premium: 4,
  video_fast: 6,
  video_premium: 10,
};

export default function CreativeStudioPage() {
  const { user, business, subscription } = useAuth();
  const navigate = useNavigate();

  // State
  const [credits, setCredits] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [brief, setBrief] = useState(null);
  const [prd, setPrd] = useState(null);
  const [prdVersions, setPrdVersions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('campaign'); // campaign | brief | prd | approve | copy | assets

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
  }, [user]);

  async function loadCredits() {
    try {
      const balance = await getCreditBalance();
      setCredits(balance);
    } catch (err) {
      console.error('Failed to load credits:', err);
    }
  }

  async function loadCampaigns() {
    try {
      const list = await listCampaigns();
      setCampaigns(list);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    }
  }

  async function loadProducts() {
    if (!business?.id) return;
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, unit_price, description')
        .eq('business_id', business.id)
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
      const campaign = await createCampaign(briefForm.campaign_name || 'New Campaign');
      setSelectedCampaign(campaign);
      setStep('brief');
    } catch (err) {
      setError(err.message);
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
      const briefData = await createCreativeBrief(
        selectedCampaign.id,
        briefForm,
        selectedProductId
      );
      setBrief(briefData);
      setStep('prd');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // PRD OPERATIONS
  // ============================================================

  async function handleGeneratePRD() {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePRD(brief.id, selectedProductId);
      setPrd({
        id: result.prdId,
        prd_content: result.prdContent,
        version: 1,
        status: 'ready',
      });
      setCredits(result.credits);
      setStep('approve');
    } catch (err) {
      setError(err.message);
      // Refresh credits on error
      await loadCredits();
    } finally {
      setLoading(false);
    }
  }

  async function handleRevisePRD() {
    if (!revisionInstructions.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await revisePRD(prd.id, revisionInstructions);
      setPrd({
        id: result.prdId,
        prd_content: result.prdContent,
        version: result.version,
        status: 'ready',
      });
      setCredits(result.credits);
      setRevisionInstructions('');
      // Refresh PRD versions
      const versions = await listPRDs(brief.id);
      setPrdVersions(versions);
    } catch (err) {
      setError(err.message);
      await loadCredits();
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // COPY OPERATIONS
  // ============================================================

  async function handleGenerateCopy() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateCopy(prd.id);
      setAssets(prev => [result, ...prev]);
      setCredits(result.credits);
      setStep('assets');
    } catch (err) {
      setError(err.message);
      await loadCredits();
    } finally {
      setLoading(false);
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

  if (!subscription || subscription.status !== 'active' || subscription.plan === 'free') {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-4">BisnisSehat Pro Required</h2>
        <p className="text-gray-600 mb-4">
          Creative Studio requires an active Pro subscription.
        </p>
        <button
          onClick={() => navigate('/pricing')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Upgrade to Pro
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Creative Studio</h1>
          <p className="text-gray-600 mt-1">
            Generate marketing content with AI assistance
          </p>
        </div>

        {/* Credit Balance */}
        {credits && (
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-lg">
            <div className="text-sm opacity-90">Creative Credits</div>
            <div className="text-2xl font-bold">{credits.available}</div>
            <div className="text-xs opacity-75">
              {credits.consumed} used this period
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          <strong>Error:</strong> {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center mb-8 text-sm">
        {['campaign', 'brief', 'prd', 'approve', 'copy', 'assets'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === s
                  ? 'bg-indigo-600 text-white'
                  : ['campaign', 'brief', 'prd', 'approve', 'copy', 'assets'].indexOf(step) > i
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`ml-2 ${
                step === s ? 'text-indigo-600 font-medium' : 'text-gray-500'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 5 && <div className="w-8 h-px bg-gray-300 mx-2"></div>}
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
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>
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
                placeholder="What's the visual and emotional feel? (e.g., warm, professional, playful)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Platform *
              </label>
              <textarea
                value={briefForm.platform}
                onChange={(e) =>
                  setBriefForm({ ...briefForm, platform: e.target.value })
                }
                placeholder="Where will this be posted? (e.g., Instagram, TikTok, Facebook)"
                rows={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CTA (Call to Action)
                </label>
                <input
                  type="text"
                  value={briefForm.cta}
                  onChange={(e) =>
                    setBriefForm({ ...briefForm, cta: e.target.value })
                  }
                  placeholder="e.g., Buy Now, Learn More"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleSubmitBrief}
              disabled={loading || !briefForm.objective || !briefForm.target_audience || !briefForm.vibe_style || !briefForm.platform}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Brief'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Generate PRD */}
      {step === 'prd' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Generate AI Creative PRD</h2>
          <p className="text-sm text-gray-600 mb-4">
            AI will analyze your brief and product data to create a comprehensive creative brief.
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
              <strong>Credit Cost:</strong> {CREDIT_COSTS.prd_generate} credit
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              You have {credits?.available || 0} credits remaining
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('brief')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleGeneratePRD}
              disabled={loading || (credits?.available || 0) < CREDIT_COSTS.prd_generate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate PRD'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Review & Approve PRD */}
      {step === 'approve' && prd && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Review PRD (v{prd.version})</h2>

          {/* PRD Content */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-96 overflow-y-auto">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
              {JSON.stringify(prd.prd_content, null, 2)}
            </pre>
          </div>

          {/* Revision Form */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium text-gray-700 mb-2">Request Revision</h3>
            <p className="text-xs text-gray-500 mb-2">
              Describe what you'd like changed. Cost: {CREDIT_COSTS.prd_revision} credit.
            </p>
            <textarea
              value={revisionInstructions}
              onChange={(e) => setRevisionInstructions(e.target.value)}
              placeholder="e.g., Make the headline more catchy, adjust tone to be more professional..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 mb-3"
            />
            <div className="flex gap-3">
              <button
                onClick={handleRevisePRD}
                disabled={loading || !revisionInstructions.trim() || (credits?.available || 0) < CREDIT_COSTS.prd_revision}
                className="px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
              >
                {loading ? 'Revising...' : 'Revise PRD'}
              </button>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep('prd')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep('copy')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Approve & Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Generate Copy */}
      {step === 'copy' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Generate Marketing Copy</h2>
          <p className="text-sm text-gray-600 mb-4">
            AI will generate marketing copy based on your approved PRD.
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Credit Cost:</strong> {CREDIT_COSTS.copy_generate} credit
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              You have {credits?.available || 0} credits remaining
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('approve')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleGenerateCopy}
              disabled={loading || (credits?.available || 0) < CREDIT_COSTS.copy_generate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Copy'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: Assets */}
      {step === 'assets' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Generated Assets</h2>

          {assets.length === 0 ? (
            <p className="text-gray-500">No assets generated yet.</p>
          ) : (
            <div className="space-y-4">
              {assets.map((asset, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">Copy</span>
                    <span className="text-xs text-gray-500">
                      {new Date(asset.created_at).toLocaleString()}
                    </span>
                  </div>
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                    {JSON.stringify(asset.copyContent || asset.metadata, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('copy')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => {
                // Reset for new generation
                setSelectedCampaign(null);
                setBrief(null);
                setPrd(null);
                setAssets([]);
                setStep('campaign');
                loadCredits();
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create New Campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
