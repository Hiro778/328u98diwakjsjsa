import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import BackButton from '../../../components/BackButton';
import {
  calculateAdsEconomics,
  formatCurrencyIdr,
  formatPercent,
  formatRatio,
  UNAVAILABLE_LABEL,
} from '../../../lib/adsCalculatorEngine';
import { ADS_RECOMMENDATIONS } from '../../../data/adsRecommendations';

export default function AdsPage() {
  const [searchParams, setSearchParams] = useSearchParams({ tab: 'calculator' });
  const activeTab = searchParams.get('tab') === 'recommendation' ? 'recommendation' : 'calculator';

  const setTab = (tab) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <BackButton fallbackUrl="/dashboard/marketing" label="Kembali" />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Ads</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Analisis dan hitung performa iklan berdasarkan data nyata.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('calculator')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === 'calculator'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>🧮</span>
          <span>Ads Calculator</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('recommendation')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === 'recommendation'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>🔎</span>
          <span>Rekomendasi Ads</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'calculator' ? <AdsCalculatorTab /> : <AdsRecommendationTab />}
    </div>
  );
}

/**
 * 🧮 Ads Calculator Component
 */
function AdsCalculatorTab() {
  // Stage 1 Inputs
  const [sellingPrice, setSellingPrice] = useState('100000');
  const [cogs, setCogs] = useState('40000');
  const [variableFee, setVariableFee] = useState('10000');
  const [targetMargin, setTargetMargin] = useState('20');

  // Stage 2 Inputs (All Optional)
  const [budget, setBudget] = useState('');
  const [actualAdSpend, setActualAdSpend] = useState('');
  const [impressions, setImpressions] = useState('');
  const [clicks, setClicks] = useState('');
  const [conversions, setConversions] = useState('');
  const [revenue, setRevenue] = useState('');

  // Pure deterministic calculation memo
  const result = useMemo(() => {
    return calculateAdsEconomics({
      sellingPrice: sellingPrice !== '' ? Number(sellingPrice) : undefined,
      cogs: cogs !== '' ? Number(cogs) : undefined,
      variableFee: variableFee !== '' ? Number(variableFee) : undefined,
      targetMargin: targetMargin !== '' ? Number(targetMargin) : undefined,
      budget: budget !== '' ? Number(budget) : undefined,
      actualAdSpend: actualAdSpend !== '' ? Number(actualAdSpend) : undefined,
      impressions: impressions !== '' ? Number(impressions) : undefined,
      clicks: clicks !== '' ? Number(clicks) : undefined,
      conversions: conversions !== '' ? Number(conversions) : undefined,
      revenue: revenue !== '' ? Number(revenue) : undefined,
    });
  }, [
    sellingPrice,
    cogs,
    variableFee,
    targetMargin,
    budget,
    actualAdSpend,
    impressions,
    clicks,
    conversions,
    revenue,
  ]);

  const { stage1, stage2, errors, warnings, status, conclusion } = result;

  return (
    <div className="space-y-8">
      {/* Input Errors Notification */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <p className="font-semibold">Mohon periksa data input kamu:</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Input Consistency Warning Notification (Non-blocking - calc.md Requirement 3) */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          <div className="flex items-center gap-2 font-semibold text-amber-400">
            <span>⚠️</span>
            <span>Pemberitahuan Konsistensi Input:</span>
          </div>
          <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs text-slate-200">
            {warnings.map((warn, i) => (
              <li key={i}>{typeof warn === 'string' ? warn : warn.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Grid: Inputs (Left) & Pre-Campaign Results (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Unit Economics Form */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              1
            </span>
            <h2 className="text-base font-bold text-text-primary">Tentang Bisnis (Unit Economics)</h2>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Masukkan struktur harga dan biaya pokok per transaksi untuk menentukan batas aman biaya iklan.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Harga Jual / Revenue per Order <span className="text-danger">*</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-text-muted">
                  Rp
                </span>
                <input
                  type="number"
                  min="1"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="100.000"
                  className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                HPP per Order <span className="text-danger">*</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-text-muted">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  value={cogs}
                  onChange={(e) => setCogs(e.target.value)}
                  placeholder="40.000"
                  className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Fee / Biaya Variabel per Order <span className="text-danger">*</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-text-muted">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  value={variableFee}
                  onChange={(e) => setVariableFee(e.target.value)}
                  placeholder="10.000"
                  className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-text-muted">Ongkir ditanggung, komisi marketplace, packing.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Target Margin Keuntungan (%) <span className="text-[10px] text-text-muted">(Opsional)</span>
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  value={targetMargin}
                  onChange={(e) => setTargetMargin(e.target.value)}
                  placeholder="20"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-text-muted">
                  %
                </span>
              </div>
              <p className="mt-1 text-[11px] text-text-muted">Persentase laba bersih yang kamu inginkan.</p>
            </div>
          </div>
        </div>

        {/* Campaign Inputs Form */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info/10 text-xs font-bold text-info">
              2
            </span>
            <h2 className="text-base font-bold text-text-primary">Data Iklan Aktual (Opsional)</h2>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Isi metrik kampanye yang sudah berjalan untuk mengevaluasi efisiensi biaya iklan aktual.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Budget Iklan (Rencana)
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-text-muted">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="1.000.000"
                  className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Actual Ad Spend (Biaya Riil)
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-text-muted">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  value={actualAdSpend}
                  onChange={(e) => setActualAdSpend(e.target.value)}
                  placeholder="600.000"
                  className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Impressions
              </label>
              <input
                type="number"
                min="0"
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
                placeholder="25.000"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Clicks
              </label>
              <input
                type="number"
                min="0"
                value={clicks}
                onChange={(e) => setClicks(e.target.value)}
                placeholder="714"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Conversions / Orders
              </label>
              <input
                type="number"
                min="0"
                value={conversions}
                onChange={(e) => setConversions(e.target.value)}
                placeholder="20"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Revenue Aktual
              </label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-text-muted">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  placeholder="1.500.000"
                  className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TAHAP 1: SEBELUM IKLAN */}
      {stage1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
              Tahap 1 — Parameter Sebelum Iklan (Batas Ekonomi)
            </h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Deterministik
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="Contribution / Order"
              value={formatCurrencyIdr(stage1.contribution)}
              subtext="Sisa uang per order setelah HPP & Fee"
              tooltip="Uang yang tersisa dari satu penjualan setelah HPP dan biaya variabel."
              highlight
            />
            <MetricCard
              label="Break-even CPA"
              value={formatCurrencyIdr(stage1.breakEvenCpa)}
              subtext="Maksimal biaya iklan/order"
              tooltip="Biaya iklan maksimum per order sebelum margin kontribusi habis."
            />
            <MetricCard
              label="Break-even ROAS"
              value={formatRatio(stage1.breakEvenRoas)}
              subtext="Titik impas omzet vs spend"
              tooltip="Berapa rupiah revenue yang harus dihasilkan untuk setiap Rp1 biaya iklan agar tidak rugi."
            />
            <MetricCard
              label="Target Profit / Order"
              value={stage1.targetProfit !== null ? formatCurrencyIdr(stage1.targetProfit) : UNAVAILABLE_LABEL}
              subtext={stage1.targetMargin !== null ? `${formatPercent(stage1.targetMargin, 0)} dari harga` : 'Isi target margin'}
              tooltip="Keuntungan bersih yang diinginkan per order."
            />
            <MetricCard
              label="Target CPA"
              value={stage1.targetCpa !== null ? formatCurrencyIdr(stage1.targetCpa) : (stage1.targetCpaWarning || UNAVAILABLE_LABEL)}
              subtext={stage1.targetCpaValid ? 'Batas ideal biaya iklan' : 'Target margin terlalu tinggi'}
              warning={!stage1.targetCpaValid}
              tooltip="Biaya akuisisi maksimal per order agar target profit bisnis tercapai."
            />
            <MetricCard
              label="Target ROAS"
              value={stage1.targetRoas !== null ? formatRatio(stage1.targetRoas) : UNAVAILABLE_LABEL}
              subtext={stage1.targetRoas !== null ? 'ROAS incaran' : 'Isi target margin'}
              tooltip="Target efisiensi rasio belanja iklan untuk mencapai target margin bisnis."
            />
          </div>
        </div>
      )}

      {/* TAHAP 2: PERFORMA CAMPAIGN */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
            Tahap 2 — Performa Campaign Aktual
          </h3>
          {status && status.cpaStatus && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                status.cpaStatus.includes('Di atas Break-even')
                  ? 'bg-danger/15 text-danger border border-danger/30'
                  : status.cpaStatus.includes('Di bawah Target')
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'bg-warning/15 text-warning border border-warning/30'
              }`}
            >
              {status.cpaStatus}
            </span>
          )}
        </div>

        {stage2 && stage2.actualAdSpend !== null && stage2.conversions !== null ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            <MetricCard
              label="Actual Ad Spend"
              value={formatCurrencyIdr(stage2.actualAdSpend)}
              subtext="Uang riil yang keluar"
              tooltip="Total biaya iklan yang benar-benar dibelanjakan (bukan estimasi budget)."
            />
            <MetricCard
              label="Actual CPC"
              value={stage2.actualCpc !== null ? formatCurrencyIdr(stage2.actualCpc) : UNAVAILABLE_LABEL}
              subtext={stage2.clicks ? `${stage2.clicks} klik` : 'Butuh klik'}
              tooltip="Rata-rata biaya per satu kali klik iklan."
            />
            <MetricCard
              label="Actual CVR"
              value={stage2.actualCvr !== null ? formatPercent(stage2.actualCvr) : UNAVAILABLE_LABEL}
              subtext="Conversion Rate"
              tooltip="Persentase pengunjung yang berubah menjadi pembeli."
            />
            <MetricCard
              label="Actual CPA"
              value={stage2.actualCpa !== null ? formatCurrencyIdr(stage2.actualCpa) : UNAVAILABLE_LABEL}
              subtext="Biaya / conversion"
              tooltip="Biaya iklan yang dihabiskan untuk mendapatkan satu transaksi riil."
              highlight
            />
            <MetricCard
              label="Actual ROAS"
              value={stage2.actualRoas !== null ? formatRatio(stage2.actualRoas) : UNAVAILABLE_LABEL}
              subtext="Revenue / Spend"
              tooltip="Berapa rupiah omzet yang didapat untuk setiap Rp1 biaya iklan."
              highlight
            />
            <MetricCard
              label="ACOS"
              value={stage2.acos !== null ? formatPercent(stage2.acos) : UNAVAILABLE_LABEL}
              subtext="Spend / Attributed Revenue"
              tooltip="Persentase biaya iklan terhadap revenue yang diatribusikan ke iklan."
            />
            {stage2.tacos !== null && (
              <MetricCard
                label="TACOS"
                value={formatPercent(stage2.tacos)}
                subtext="Total Spend / Store Revenue"
                tooltip="Total biaya iklan dibanding total revenue toko."
              />
            )}
            <MetricCard
              label="Profit Setelah Iklan"
              value={stage2.estimatedProfitAfterAds !== null ? formatCurrencyIdr(stage2.estimatedProfitAfterAds) : UNAVAILABLE_LABEL}
              subtext="Estimasi contribution bersih"
              tooltip="Total margin kontribusi dikurangi biaya belanja iklan riil."
              highlight
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-text-muted">
            Masukkan <strong>Actual Ad Spend</strong> dan <strong>Conversions</strong> pada formulir Data Iklan untuk menampilkan metrik performa aktual.
          </div>
        )}
      </div>

      {/* KESIMPULAN UNTUK PEMULA */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">💡</span>
          <h3 className="text-base font-bold text-text-primary">Kesimpulan Analisis</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-text-primary">
          {conclusion}
        </p>
        <div className="mt-4 border-t border-primary/10 pt-3 text-xs text-text-muted">
          * Kesimpulan ini dihasilkan secara deterministik berdasarkan angka yang kamu masukkan. Ini bukan jaminan hasil campaign di masa depan.
        </div>
      </div>
    </div>
  );
}

/**
 * Clean metric card presentation component
 */
function MetricCard({ label, value, subtext, tooltip, highlight, warning }) {
  return (
    <div
      title={tooltip}
      className={`flex flex-col justify-between rounded-xl border p-4 transition-shadow ${
        warning
          ? 'border-danger/30 bg-danger/5'
          : highlight
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-surface'
      }`}
    >
      <div>
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        <p className={`mt-1.5 text-base font-bold sm:text-lg ${warning ? 'text-danger' : 'text-text-primary'}`}>
          {value}
        </p>
      </div>
      {subtext && (
        <p className="mt-2 text-[11px] text-text-muted truncate" title={subtext}>
          {subtext}
        </p>
      )}
    </div>
  );
}

/**
 * 🔎 Rekomendasi Ads Component (Source-first architecture for UMKM)
 * Adheres strictly to ads.md & dashboard visual tokens
 */
function AdsRecommendationTab() {
  const [platformFilter, setPlatformFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const platforms = ['All', 'Meta Ads', 'TikTok Ads', 'Google Ads'];
  const categories = ['All', 'Video Kreatif', 'Retargeting Pelanggan', 'Budget Kecil / Struktur', 'Katalog Produk'];

  const filteredItems = useMemo(() => {
    return ADS_RECOMMENDATIONS.filter((item) => {
      const matchPlatform = platformFilter === 'All' || item.platform === platformFilter;
      const matchCategory = categoryFilter === 'All' || item.category === categoryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        q === '' ||
        item.title.toLowerCase().includes(q) ||
        (item.situation && item.situation.toLowerCase().includes(q)) ||
        (item.bestFor && item.bestFor.toLowerCase().includes(q)) ||
        (item.metrics && item.metrics.some((m) => m.toLowerCase().includes(q))) ||
        (item.commonMistake && item.commonMistake.toLowerCase().includes(q));
      return matchPlatform && matchCategory && matchQuery;
    });
  }, [platformFilter, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Guidance */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-xs text-primary font-bold">
                🎯
              </span>
              <h2 className="text-sm font-bold text-text-primary sm:text-base">
                Rekomendasi Praktis Beriklan untuk UMKM
              </h2>
            </div>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-2xl">
              Panduan berbasis sumber resmi dan situasi riil bisnis UMKM. Gunakan metrik target dari Ads Calculator
              sebagai acuan batas aman sebelum memulai kampanye.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto text-[11px] font-semibold text-success bg-success/10 border border-success/20 px-3 py-1.5 rounded-xl">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span>100% Sumber Resmi Terverifikasi</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3">
        {/* Platform Selection */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-text-muted mr-1">Platform:</span>
            {platforms.map((p) => {
              const isActive = platformFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformFilter(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                      : 'border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {p === 'All' ? 'Semua Platform' : p}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari solusi atau metrik (CTR, CPA, Reels)..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-text-muted mr-1">Topik Praktis:</span>
          {categories.map((c) => {
            const isCatActive = categoryFilter === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isCatActive
                    ? 'bg-text-primary text-background'
                    : 'bg-surface-hover/80 text-text-muted hover:text-text-primary'
                }`}
              >
                {c === 'All' ? 'Semua Topik' : c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recommendation List */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
            >
              {/* Card Body */}
              <div className="space-y-4">
                {/* 1. Platform & Tag */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        item.platform === 'Meta Ads'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : item.platform === 'TikTok Ads'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      }`}
                    >
                      {item.platform}
                    </span>
                    {item.category && (
                      <span className="rounded-md bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-muted">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-muted">{item.updatedAt}</span>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-text-primary leading-snug">
                  {item.title}
                </h3>

                {/* 2. Situation (Cocok untuk) */}
                <div className="rounded-xl border border-border/60 bg-surface-elevated/70 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <span>💡</span>
                    <span>Cocok untuk:</span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed pl-5">
                    {item.situation || item.bestFor}
                  </p>
                </div>

                {/* 3. Actions (Lakukan) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <span>🚀</span>
                    <span>Lakukan:</span>
                  </div>
                  <ul className="space-y-1.5 pl-5 list-disc text-xs text-text-secondary leading-relaxed">
                    {(item.actions || item.howToTry || []).map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>

                {/* 4. Metrics (Pantau) */}
                {item.metrics && item.metrics.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                      <span>📊</span>
                      <span>Pantau:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {item.metrics.map((m, idx) => (
                        <span
                          key={idx}
                          className="rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-mono font-semibold text-primary"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Common Mistake (Perhatian / Kesalahan umum) */}
                {(item.commonMistake || item.risks) && (
                  <div className="rounded-xl border border-warning/25 bg-warning/10 p-3 text-xs text-warning/90 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-warning">
                      <span>⚠️</span>
                      <span>Kesalahan Umum:</span>
                    </div>
                    <p className="pl-5 text-[11px] leading-relaxed">
                      {item.commonMistake || item.risks}
                    </p>
                  </div>
                )}
              </div>

              {/* 6. Official Resource (Pelajari) */}
              <div className="mt-5 border-t border-border pt-4">
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-xs font-semibold text-text-primary transition-all hover:border-primary/40 hover:bg-surface-hover hover:text-primary"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-primary group-hover:scale-110 transition-transform">📖</span>
                    <span className="truncate">
                      Pelajari: <span className="text-text-secondary group-hover:text-primary">{item.sourceName}</span>
                    </span>
                  </div>
                  <svg
                    className="h-3.5 w-3.5 flex-shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Tidak ditemukan rekomendasi yang cocok dengan filter atau kata kunci pencarian.
        </div>
      )}
    </div>
  );
}
