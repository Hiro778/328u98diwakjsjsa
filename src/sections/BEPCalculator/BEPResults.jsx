import { formatCurrency } from '../../lib/orderNumber'

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

export default function BEPResults({
  result,
  onSave,
  saving,
  errors,
}) {
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

      {/* Hero: BEP Units */}
      <div className="rounded-2xl border border-warm-400/20 bg-warm-50 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-warm-500">BEP</p>
        <p className="mt-2 text-4xl font-extrabold text-navy-700">
          {result.bepUnits > 0 ? `${result.bepUnits} unit` : '—'}
        </p>
      </div>

      {/* BEP Revenue */}
      {result.bepRevenue > 0 && (
        <div className="rounded-xl bg-cream p-4 text-center">
          <p className="text-xs font-bold text-text-muted">BEP Penjualan</p>
          <p className="mt-1 text-2xl font-extrabold text-warm-500">{formatCurrency(result.bepRevenue)}</p>
        </div>
      )}

      {/* Breakdown */}
      <div className="space-y-3">
        <ResultRow label="Biaya Tetap" value={formatCurrency(result.fixedCosts)} />
        <ResultRow label="Biaya Variabel / Unit" value={formatCurrency(result.variableCostPerUnit)} />
        <ResultRow label="Harga Jual / Unit" value={formatCurrency(result.sellingPricePerUnit)} />

        <hr className="border-border" />

        <ResultRow label="Contribution Margin / Unit" value={formatCurrency(result.contributionMarginPerUnit)} accent />
        <ResultRow label="Contribution Margin Ratio" value={`${result.contributionMarginRatio.toFixed(2)}%`} accent />
      </div>

      {/* Fixed cost breakdown */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-navy-700">Rincian Biaya Tetap</p>
        {result.rent > 0 && <ResultRow label="Sewa" value={formatCurrency(result.rent)} />}
        {result.fixedLabor > 0 && <ResultRow label="Gaji Tetap" value={formatCurrency(result.fixedLabor)} />}
        {result.utilities > 0 && <ResultRow label="Utilitas" value={formatCurrency(result.utilities)} />}
        {result.software > 0 && <ResultRow label="Software" value={formatCurrency(result.software)} />}
        {result.otherFixedCosts > 0 && <ResultRow label="Lainnya" value={formatCurrency(result.otherFixedCosts)} />}
      </div>

      {/* Margin of Safety */}
      {result.actualUnits > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-navy-700">Margin of Safety</p>
            <ResultRow label="Penjualan Aktual" value={`${result.actualUnits} unit · ${formatCurrency(result.actualRevenue)}`} />
            <ResultRow label="MoS" value={formatCurrency(result.marginOfSafety)} />
            <ResultRow label="MoS %" value={`${result.marginOfSafetyPercent.toFixed(2)}%`} accent />
          </div>
        </>
      )}

      {/* Target Profit */}
      {result.targetProfit > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-navy-700">Target Profit</p>
            <ResultRow label="Target Profit" value={formatCurrency(result.targetProfit)} />
            <div className="rounded-xl bg-cream p-4">
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">Unit Dibutuhkan</span>
                <span className="text-sm font-bold text-navy-700">{result.requiredUnitsForTargetProfit} unit</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-xs text-text-muted">Penjualan Dibutuhkan</span>
                <span className="text-sm font-bold text-warm-500">{formatCurrency(result.requiredRevenueForTargetProfit)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !result.isValid}
          className="w-full rounded-xl bg-warm-400 px-5 py-3 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan BEP'}
        </button>
      </div>
    </div>
  )
}
