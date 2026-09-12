import { formatCurrency } from '../../lib/orderNumber'

export default function HPPResults({
  result,
  form,
  setField,
  onSave,
  saving,
  onApplyToProduct,
  applying,
  errors,
}) {
  const priceMode = form.priceMode || 'markup'

  return (
    <div className="space-y-5">
      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-600">{err}</p>
          ))}
        </div>
      )}

      {/* HPP per Unit — hero number */}
      <div className="rounded-2xl border border-warm-400/20 bg-warm-50 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-warm-500">HPP / Unit</p>
        <p className="mt-2 text-4xl font-extrabold text-navy-700">
          {result.hppPerUnit > 0 ? formatCurrency(result.hppPerUnit) : '--'}
        </p>
        {(!form.quantityProduced || Number(form.quantityProduced) <= 0) && (
          <p className="mt-2 text-[11px] text-text-muted italic">
            Masukkan jumlah produksi untuk menghitung HPP.
          </p>
        )}
        {Number(form.quantityProduced) > 0 && result.totalCost === 0 && (
          <p className="mt-2 text-[11px] text-text-muted italic">
            Belum ada biaya produksi yang dimasukkan.
          </p>
        )}
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        <ResultRow label="Total Biaya Produksi" value={formatCurrency(result.totalCost)} />
        <ResultRow label="Jumlah Produksi" value={`${Number(form.quantityProduced) || 0} ${form.productionUnit || 'pcs'}`} />
        <ResultRow label="Bahan Baku" value={formatCurrency(result.materialCost)} />
        <ResultRow label="Kemasan" value={formatCurrency(result.packagingCost)} />
        <ResultRow label="Tenaga Kerja" value={formatCurrency(result.directLaborCost)} />
        <ResultRow label="Overhead" value={formatCurrency(result.overheadCost)} />
        {result.otherCost > 0 && <ResultRow label="Biaya Lain" value={formatCurrency(result.otherCost)} />}
        {Number(form.wastePercent) > 0 && (
          <ResultRow label="Waste/Susut" value={`${form.wastePercent}%`} />
        )}
      </div>

      <hr className="border-border" />

      {/* Price mode selector */}
      <div>
        <p className="text-xs font-bold text-text-muted mb-2">Target Harga Jual</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setField('priceMode', 'markup')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
              priceMode === 'markup'
                ? 'bg-warm-400 text-white'
                : 'border border-border bg-surface text-text-secondary hover:bg-cream'
            }`}
          >
            Markup
          </button>
          <button
            type="button"
            onClick={() => setField('priceMode', 'margin')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
              priceMode === 'margin'
                ? 'bg-warm-400 text-white'
                : 'border border-border bg-surface text-text-secondary hover:bg-cream'
            }`}
          >
            Margin
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            value={priceMode === 'markup' ? form.markupPercent : form.marginPercent}
            onChange={(e) => setField(priceMode === 'markup' ? 'markupPercent' : 'marginPercent', e.target.value)}
            min="0"
            max={priceMode === 'margin' ? '99.99' : undefined}
            className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm text-navy-700 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
          />
          <span className="text-sm text-text-muted">%</span>
          <span className="text-[11px] text-text-muted">
            {priceMode === 'markup' ? 'di atas HPP' : 'dari harga jual'}
          </span>
        </div>
      </div>

      {/* Selling price results */}
      {result.sellingPrice > 0 && result.hppPerUnit > 0 && (
        <div className="space-y-3">
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs font-bold text-text-muted">Harga Jual Rekomendasi</p>
            <p className="mt-1 text-2xl font-extrabold text-warm-500">{formatCurrency(result.sellingPrice)}</p>
          </div>
          <ResultRow label="Estimasi Laba / Unit" value={formatCurrency(result.profitPerUnit)} accent />
          <ResultRow label="Margin Aktual" value={`${result.actualMargin.toFixed(2)}%`} />
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={
            saving ||
            !result.isValid ||
            !form.productName.trim() ||
            !form.quantityProduced ||
            Number(form.quantityProduced) <= 0 ||
            result.hppPerUnit <= 0 ||
            !Number.isFinite(result.hppPerUnit)
          }
          className="w-full rounded-xl bg-warm-400 px-5 py-3 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan HPP'}
        </button>

        <button
          type="button"
          onClick={onApplyToProduct}
          disabled={applying || !result.isValid || result.hppPerUnit <= 0}
          className="w-full rounded-xl border border-border px-5 py-3 text-sm font-bold text-navy-700 transition-all hover:bg-cream disabled:opacity-60"
        >
          {applying ? 'Menerapkan...' : 'Gunakan sebagai HPP Produk'}
        </button>
      </div>
    </div>
  )
}

function ResultRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-sm font-semibold ${accent ? 'text-warm-500' : 'text-navy-700'}`}>
        {value}
      </span>
    </div>
  )
}
