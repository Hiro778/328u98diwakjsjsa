import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import {
  createAnalysis,
  updateAnalysis,
  addCompetitor,
  removeCompetitor,
  startAllResearch,
  pollResearchTask,
  startAnalysis,
  getAnalysis,
  listAnalyses,
  checkCompetitorCache,
  clearCache,
} from '../../../services/competitorAnalysisService';

const STATUS = {
  idle: 'idle',
  creating: 'creating',
  researching: 'researching',
  analyzing: 'analyzing',
  completed: 'completed',
  failed: 'failed',
};

export default function CompetitorAnalysisPage() {
  const { user, business } = useAuth();

  // Page state
  const [pageStatus, setPageStatus] = useState('empty'); // empty | input | researching | analyzing | results | history
  const [analyses, setAnalyses] = useState([]);

  // Analysis state
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [competitors, setCompetitors] = useState([]);

  // Form state
  const [newCompetitor, setNewCompetitor] = useState({
    name: '',
    website: '',
    location: '',
    industry: '',
  });

  // Research progress
  const [researchProgress, setResearchProgress] = useState(0);
  const [researchStatus, setResearchStatus] = useState('');
  const [tasks, setTasks] = useState([]);

  // Analysis progress
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState('');

  // Load analyses on mount
  useEffect(() => {
    if (business?.id) {
      loadAnalyses();
    }
  }, [business?.id]);

  async function loadAnalyses() {
    try {
      const data = await listAnalyses();
      setAnalyses(data);
    } catch (err) {
      console.error('Failed to load analyses:', err);
    }
  }

  // ============================================================
  // COMPETITOR MANAGEMENT
  // ============================================================

  function handleAddCompetitor() {
    if (!newCompetitor.name.trim()) {
      alert('Nama kompetitor wajib diisi');
      return;
    }

    const competitor = {
      id: crypto.randomUUID(),
      ...newCompetitor,
    };

    setCompetitors((prev) => [...prev, competitor]);
    setNewCompetitor({ name: '', website: '', location: '', industry: '' });
  }

  function handleRemoveCompetitor(index) {
    setCompetitors((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateCompetitor(index, field, value) {
    setCompetitors((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  // ============================================================
  // ANALYSIS FLOW
  // ============================================================

  async function handleCreateAnalysis() {
    if (competitors.length === 0) {
      alert('Minimal 1 kompetitor harus ditambahkan');
      return;
    }

    setPageStatus('creating');

    try {
      const analysis = await createAnalysis('Analisis Kompetitor', competitors);
      setCurrentAnalysis(analysis);
      setPageStatus('input');
    } catch (err) {
      alert(`Gagal membuat analisis: ${err.message}`);
      setPageStatus('input');
    }
  }

  async function handleStartResearch() {
    if (!currentAnalysis) return;
    if (competitors.length === 0) return;

    setPageStatus('researching');
    setResearchProgress(0);
    setResearchStatus('Mengumpulkan data...');

    try {
      // Update analysis input
      await updateAnalysis(currentAnalysis.id, {
        input_data: { competitors },
      });

      // Start all research tasks
      const taskIds = await startAllResearch(currentAnalysis.id);

      // Monitor progress
      let completedTasks = 0;
      setTasks(taskIds.map((id) => ({ id, status: 'pending', progress: 0 })));

      for (const taskId of taskIds) {
        setResearchStatus(`Meneliti ${competitors[completedTasks]?.name || 'kompetitor'}...`);
        setResearchProgress(Math.round(((completedTasks + 1) / taskIds.length) * 50));

        const task = await pollResearchTask(taskId);

        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...task } : t))
        );

        if (task.status === 'completed' || task.status === 'cached') {
          completedTasks++;
        } else {
          console.error('Task failed:', task);
        }
      }

      // Check if all research complete
      const allComplete = await checkCompetitorCache(currentAnalysis.id);
      if (allComplete) {
        setResearchProgress(100);
        setResearchStatus('Research selesai!');
        setPageStatus('analyzing');
        setTimeout(() => handleStartAnalysis(), 1000);
      }
    } catch (err) {
      console.error('Research failed:', err);
      setResearchStatus('Gagal mengumpulkan data');
      setPageStatus('analyzing');
      setTimeout(() => handleStartAnalysis(), 1000);
    }
  }

  async function handleStartAnalysis() {
    if (!currentAnalysis) return;

    setPageStatus('analyzing');
    setAnalysisProgress(0);
    setAnalysisStatus('Menganalisis...');

    try {
      const result = await startAnalysis(currentAnalysis.id);

      // Update analysis
      const updated = await getAnalysis(currentAnalysis.id);
      setCurrentAnalysis(updated);

      setAnalysisProgress(100);
      setAnalysisStatus('Analisis selesai!');
      setPageStatus('results');
      loadAnalyses(); // Refresh list
    } catch (err) {
      console.error('Analysis failed:', err);
      setAnalysisStatus(`Gagal menganalisis: ${err.message}`);
      setPageStatus('failed');
    }
  }

  function handleUpdateAnalysis() {
    if (!currentAnalysis) return;
    setPageStatus('researching');
    setResearchProgress(0);
    setResearchStatus('Memperbarui data...');

    // Update input first
    updateAnalysis(currentAnalysis.id, {
      input_data: { competitors },
    });

    // Clear cache for competitors with new data
    const clearPromises = competitors
      .filter((c) => c.name && (c.website || c.location || c.industry))
      .map((c) => clearCache(c.name, c));

    Promise.all(clearPromises).then(() => {
      setTimeout(() => handleStartResearch(), 500);
    });
  }

  function handleViewAnalysis(analysis) {
    setCurrentAnalysis(analysis);
    setCompetitors(analysis.input_data?.competitors || []);
    setPageStatus('results');
  }

  function handleNewAnalysis() {
    setCurrentAnalysis(null);
    setCompetitors([]);
    setResearchProgress(0);
    setAnalysisProgress(0);
    setPageStatus('input');
  }

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  function getStatusColor(status) {
    switch (status) {
      case 'completed':
      case 'cached':
        return 'text-profit-600';
      case 'failed':
        return 'text-error-600';
      case 'researching':
      case 'analyzing':
        return 'text-warm-500';
      case 'pending':
        return 'text-text-muted';
      default:
        return 'text-navy-600';
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'completed':
        return 'Selesai';
      case 'cached':
        return 'Dari cache';
      case 'failed':
        return 'Gagal';
      case 'researching':
        return 'Mencari data';
      case 'analyzing':
        return 'Menganalisis';
      case 'pending':
        return 'Menunggu';
      default:
        return status;
    }
  }

  // ============================================================
  // RENDER: EMPTY STATE
  // ============================================================

  if (pageStatus === 'empty' && analyses.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center py-20"
        >
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-navy-700 mb-4">
            Analisis Kompetitor
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-8">
            Identifikasi kompetitor bisnis Anda dan dapatkan wawasan strategis untuk memperkuat posisi pasar.
          </p>
          <button
            onClick={() => setPageStatus('input')}
            className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Mulai Analisis
          </button>
        </motion.div>
      </div>
    );
  }

  // ============================================================
  // RENDER: INPUT FORM
  // ============================================================

  if (pageStatus === 'input') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => setPageStatus('empty')}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-navy-600 mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali
          </button>
          <h1 className="text-2xl font-extrabold text-navy-700">Tambah Kompetitor</h1>
          <p className="text-sm text-text-secondary mt-1">
            Masukkan data kompetitor yang ingin dianalisis. Minimal 1, maksimal 5.
          </p>
        </div>

        {/* Competitor List */}
        {competitors.length > 0 && (
          <div className="space-y-4 mb-8">
            <h2 className="text-sm font-semibold text-navy-700 uppercase">
              Kompetitor ({competitors.length})
            </h2>
            {competitors.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-surface border border-border rounded-xl p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-navy-700">{c.name}</p>
                    {c.website && <p className="text-sm text-text-muted">{c.website}</p>}
                    {(c.location || c.industry) && (
                      <p className="text-xs text-text-muted mt-1">
                        {c.location && <span>{c.location} • </span>}
                        {c.industry && <span>{c.industry}</span>}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveCompetitor(i)}
                    className="text-text-muted hover:text-error-600 p-1"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Add Competitor Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface border border-border rounded-xl p-6"
        >
          <h2 className="text-sm font-semibold text-navy-700 uppercase mb-4">
            Tambah Kompetitor Baru
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Nama bisnis / brand *
              </label>
              <input
                type="text"
                value={newCompetitor.name}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
                placeholder="e.g. Kopi Kenangan"
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Website (opsional)
              </label>
              <input
                type="text"
                value={newCompetitor.website}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, website: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Lokasi (opsional)
              </label>
              <input
                type="text"
                value={newCompetitor.location}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, location: e.target.value })}
                placeholder="e.g. Jakarta"
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Industri / kategori (opsional)
              </label>
              <input
                type="text"
                value={newCompetitor.industry}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, industry: e.target.value })}
                placeholder="e.g. Coffee Shop"
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleAddCompetitor}
              disabled={!newCompetitor.name.trim()}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              + Tambah Kompetitor
            </button>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="mt-8 flex items-center justify-end gap-4">
          <button
            onClick={() => setPageStatus('empty')}
            className="px-6 py-2 text-text-muted hover:text-navy-700 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleCreateAnalysis}
            disabled={competitors.length === 0}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {competitors.length === 0
              ? 'Masukkan minimal 1 kompetitor'
              : `Analisis ${competitors.length} kompetitor`}
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: RESEARCHING
  // ============================================================

  if (pageStatus === 'researching') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <svg className="w-full h-full animate-spin text-indigo-500" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-bold text-navy-700">
              {researchProgress}%
            </div>
          </div>

          <h2 className="text-2xl font-extrabold text-navy-700 mb-2">Mengumpulkan Data</h2>
          <p className="text-lg text-text-secondary mb-8">{researchStatus}</p>

          <div className="space-y-2 max-w-md mx-auto">
            {tasks.map((task, i) => (
              <div key={task.id} className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    task.status === 'completed'
                      ? 'bg-profit-500 text-white'
                      : task.status === 'failed'
                      ? 'bg-error-500 text-white'
                      : task.status === 'cached'
                      ? 'bg-warm-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {task.status === 'completed' ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : task.status === 'failed' ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : task.status === 'cached' ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ) : (
                    <span className="animate-pulse">•</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-navy-700">
                    {competitors[i]?.name || `Kompetitor ${i + 1}`}
                  </p>
                  <p className={`text-xs ${getStatusColor(task.status)}`}>
                    {getStatusLabel(task.status)}
                  </p>
                </div>
                {task.progress > 0 && (
                  <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-8 text-xs text-text-muted">
            Data disimpan sementara untuk {competitors.length} kompetitor
          </p>
        </motion.div>
      </div>
    );
  }

  // ============================================================
  // RENDER: ANALYZING
  // ============================================================

  if (pageStatus === 'analyzing') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <svg className="w-full h-full animate-spin text-purple-500" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-bold text-navy-700">
              {analysisProgress}%
            </div>
          </div>

          <h2 className="text-2xl font-extrabold text-navy-700 mb-2">Menganalisis Data</h2>
          <p className="text-lg text-text-secondary mb-8">{analysisStatus}</p>

          <div className="space-y-3 max-w-md mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <span className="text-sm font-medium text-navy-700">Menganalisis positioning</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-navy-700">Membuat perbandingan</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-navy-700">Menyusun insight</span>
            </div>
          </div>

          <p className="mt-8 text-xs text-text-muted">
            AI menganalisis {competitors.length} kompetitor berdasarkan data terkumpul
          </p>
        </motion.div>
      </div>
    );
  }

  // ============================================================
  // RENDER: RESULTS DASHBOARD
  // ============================================================

  if (pageStatus === 'results' && currentAnalysis?.analysis_data) {
    const analysisData = currentAnalysis.analysis_data;
    const competitorsData = currentAnalysis.input_data?.competitors || [];

    return (
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setPageStatus('input')}
                className="flex items-center gap-2 text-sm text-text-muted hover:text-navy-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Input
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-navy-600 font-medium">Hasil</span>
            </div>
            <h1 className="text-3xl font-extrabold text-navy-700">{currentAnalysis.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-text-muted">
              <span>
                Data terakhir diperbarui:{' '}
                {currentAnalysis.updated_at
                  ? new Date(currentAnalysis.updated_at).toLocaleDateString('id-ID', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-'}
              </span>
              {analysisData?.data_sources?.research_timestamp && (
                <span>
                  Diteliti: {new Date(analysisData.data_sources.research_timestamp).toLocaleDateString('id-ID', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setPageStatus('input')}
              className="px-4 py-2 border border-border rounded-lg hover:bg-surface transition-colors"
            >
              Edit Kompetitor
            </button>
            <button
              onClick={handleUpdateAnalysis}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Perbarui Analisis
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* EXECUTIVE SUMMARY */}
            {analysisData.executive_summary && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Ringkasan Eksekutif</h2>
                <div className="bg-surface border border-border rounded-xl p-5">
                  <p className="text-text-secondary leading-relaxed">
                    {analysisData.executive_summary.overview}
                  </p>
                  {analysisData.executive_summary.key_takeaways?.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {analysisData.executive_summary.key_takeaways.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                          <span className="text-indigo-500 mt-0.5">•</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* COMPETITOR COMPARISON */}
            {analysisData.competitor_comparison && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Perbandingan Kompetitor</h2>
                <div className="overflow-x-auto bg-surface border border-border rounded-xl">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium">
                      <tr>
                        <th className="px-4 py-3 rounded-l-lg">Kompetitor</th>
                        <th className="px-4 py-3">Positioning</th>
                        <th className="px-4 py-3">Produk Utama</th>
                        <th className="px-4 py-3">Pricing</th>
                        <th className="px-4 py-3 rounded-r-lg">Digital Presence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {analysisData.competitor_comparison.rows?.length > 0 ? (
                        analysisData.competitor_comparison.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-medium text-navy-700">{row.competitor}</td>
                            <td className="px-4 py-3 text-text-secondary">{row.positioning}</td>
                            <td className="px-4 py-3 text-text-secondary">{row.key_products}</td>
                            <td className="px-4 py-3 text-text-secondary">{row.pricing}</td>
                            <td className="px-4 py-3 text-text-secondary">{row.digital_presence}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                            Data perbandingan tidak tersedia
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* POSITIONING ANALYSIS */}
            {analysisData.positioning_analysis && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Positioning & Value Proposition</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(analysisData.positioning_analysis.by_competitor || {}).map(
                    ([name, data], i) => (
                      <div key={i} className="bg-surface border border-border rounded-xl p-5">
                        <h3 className="font-semibold text-navy-700 mb-3">{name}</h3>
                        {data.target_audience && (
                          <div className="mb-2">
                            <span className="text-xs font-medium text-text-muted uppercase">Target</span>
                            <p className="text-sm text-text-secondary">{data.target_audience}</p>
                          </div>
                        )}
                        {data.positioning && (
                          <div className="mb-2">
                            <span className="text-xs font-medium text-text-muted uppercase">Positioning</span>
                            <p className="text-sm text-text-secondary">{data.positioning}</p>
                          </div>
                        )}
                        {data.value_proposition && (
                          <div>
                            <span className="text-xs font-medium text-text-muted uppercase">Value Prop</span>
                            <p className="text-sm text-text-secondary">{data.value_proposition}</p>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </section>
            )}

            {/* PRODUCT ANALYSIS */}
            {analysisData.product_analysis && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Produk & Layanan</h2>
                <div className="bg-surface border border-border rounded-xl p-5">
                  {analysisData.product_analysis.product_categories?.length > 0 && (
                    <div className="mb-4">
                      <span className="text-xs font-medium text-text-muted uppercase mb-2 block">
                        Kategori Produk
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {analysisData.product_analysis.product_categories.map((p, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysisData.product_analysis.unique_differentiators?.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-text-muted uppercase mb-2 block">
                        Differentiator
                      </span>
                      <ul className="space-y-2">
                        {analysisData.product_analysis.unique_differentiators.map((d, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                            <span className="text-warm-500 mt-0.5">★</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* DIGITAL PRESENCE */}
            {analysisData.digital_presence_analysis && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Digital Presence</h2>
                <div className="bg-surface border border-border rounded-xl p-5">
                  {analysisData.digital_presence_analysis.website_quality && (
                    <div className="mb-4">
                      <span className="text-xs font-medium text-text-muted uppercase mb-1 block">
                        Website Quality
                      </span>
                      <p className="text-sm text-text-secondary">
                        {analysisData.digital_presence_analysis.website_quality}
                      </p>
                    </div>
                  )}
                  {analysisData.digital_presence_analysis.social_media_coverage && (
                    <div>
                      <span className="text-xs font-medium text-text-muted uppercase mb-2 block">
                        Social Media
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { name: 'Instagram', key: 'instagram' },
                          { name: 'TikTok', key: 'tiktok' },
                          { name: 'Facebook', key: 'facebook' },
                          { name: 'Twitter / X', key: 'twitter' },
                          { name: 'LinkedIn', key: 'linkedin' },
                        ].map((social) => {
                          const status = analysisData.digital_presence_analysis.social_media_coverage[social.key];
                          return (
                            <div
                              key={social.key}
                              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                                status === 'present'
                                  ? 'bg-green-50 text-green-700'
                                  : status === 'absent'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-gray-50 text-gray-600'
                              }`}
                            >
                              <span className="text-lg">{social.name}</span>
                              <span className="ml-auto text-xs font-medium">
                                {status === 'present' ? 'Ada' : status === 'absent' ? 'Tidak' : 'Tidak diketahui'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* OBSERVED STRENGTHS & WEAKNESSES */}
            {(analysisData.observed_strengths?.length > 0 ||
              analysisData.observed_weaknesses?.length > 0) && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Analisis SWOT</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysisData.observed_strengths?.length > 0 && (
                    <div className="bg-green-50/50 border border-green-100 rounded-xl p-5">
                      <h3 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Kekuatan (Observed)
                      </h3>
                      <ul className="space-y-2">
                        {analysisData.observed_strengths.map((s, i) => (
                          <li key={i} className="text-sm text-text-secondary">
                            <span className="text-green-600 font-medium">•</span>{' '}
                            {s.finding}
                            {s.source && <span className="text-xs text-text-muted ml-1">({s.source})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysisData.observed_weaknesses?.length > 0 && (
                    <div className="bg-red-50/50 border border-red-100 rounded-xl p-5">
                      <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Kelemahan (Observed)
                      </h3>
                      <ul className="space-y-2">
                        {analysisData.observed_weaknesses.map((w, i) => (
                          <li key={i} className="text-sm text-text-secondary">
                            <span className="text-red-600 font-medium">•</span>{' '}
                            {w.finding}
                            {w.source && <span className="text-xs text-text-muted ml-1">({w.source})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* OPPORTUNITIES */}
            {analysisData.market_opportunities?.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Peluang Pasar</h2>
                <div className="bg-surface border border-border rounded-xl p-5">
                  <ul className="space-y-3">
                    {analysisData.market_opportunities.map((o, i) => (
                      <li key={i} className="flex gap-3">
                        <div className="mt-1">
                          <svg className="w-5 h-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-text-secondary">{o.opportunity}</p>
                          {o.evidence && (
                            <p className="text-xs text-text-muted mt-1">Bukti: {o.evidence}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* RECOMMENDATIONS */}
            {analysisData.strategic_recommendations?.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-bold text-navy-700 mb-3">Rekomendasi Strategis</h2>
                <div className="space-y-4">
                  {analysisData.strategic_recommendations.map((r, i) => (
                    <div key={i} className="bg-surface border border-border rounded-xl p-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs">
                            {i + 1}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-navy-700 mb-1">{r.recommendation}</p>
                          {r.rationale && (
                            <p className="text-sm text-text-secondary mb-2">{r.rationale}</p>
                          )}
                          {r.expected_impact && (
                            <div className="text-xs text-warm-600 bg-warm-50 px-3 py-1.5 rounded-lg inline-block">
                              {r.expected_impact}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* DATA SOURCES */}
            {analysisData.data_sources && (
              <section className="pt-6 border-t border-gray-200">
                <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  Sumber Data
                </h2>
                <div className="space-y-2 text-sm text-text-secondary">
                  <p>
                    Data dikumpulkan pada: {analysisData.data_sources.research_timestamp
                      ? new Date(analysisData.data_sources.research_timestamp).toLocaleString('id-ID')
                      : '-'}
                  </p>
                  {analysisData.data_sources.websites_scraped?.length > 0 && (
                    <div>
                      <span className="font-medium">Website:</span>
                      <ul className="list-disc ml-5 mt-1 space-y-1">
                        {analysisData.data_sources.websites_scraped.map((w, i) => (
                          <li key={i} className="text-text-secondary truncate">
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysisData.data_sources.social_media_found?.length > 0 && (
                    <div>
                      <span className="font-medium">Social Media:</span>
                      <ul className="list-disc ml-5 mt-1 space-y-1">
                        {analysisData.data_sources.social_media_found.map((s, i) => (
                          <li key={i} className="text-text-secondary">
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ============================================================
  // RENDER: HISTORY LIST
  // ============================================================

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-extrabold text-navy-700">Riwayat Analisis</h1>
        <button
          onClick={handleNewAnalysis}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Analisis Baru
        </button>
      </div>

      {analyses.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 text-gray-300">
            <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <p className="text-text-secondary">Belum ada riwayat analisis</p>
          <button
            onClick={handleNewAnalysis}
            className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Mulai analisis pertama Anda
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map((analysis) => (
            <motion.div
              key={analysis.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-surface border border-border rounded-xl p-5 hover:border-indigo-200 transition-colors cursor-pointer"
              onClick={() => handleViewAnalysis(analysis)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-navy-700">{analysis.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
                    <span>
                      {analysis.input_data?.competitors?.length || 0} kompetitor
                    </span>
                    <span>•</span>
                    <span>
                      {analysis.created_at
                        ? new Date(analysis.created_at).toLocaleDateString('id-ID', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '-'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        analysis.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : analysis.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {analysis.status === 'completed'
                        ? 'Selesai'
                        : analysis.status === 'failed'
                        ? 'Gagal'
                        : 'Dalam proses'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewAnalysis(analysis);
                    }}
                    className="px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    Lihat
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
