import { formatCurrency } from '../../lib/orderNumber'

function ResultRow({ label, value, accent, highlight, muted }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-sm font-semibold min-w-0 text-right ${accent ? 'text-warm-500' : highlight ? 'text-profit-600' : muted ? 'text-text-muted' : 'text-navy-700'}`}>
        {value}
      </span>
    </div>
  )
}

function ScenarioRow({ scenario, isCurrent }) {
  return (
    <div className={`rounded-lg border p-3 ${isCurrent ? 'border-warm-300 bg-warm-50' : 'border-border bg-cream/50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-navy-700">{scenario.name}</span>
        <span className="text-xs font-semibold text-warm-500">{scenario.effectiveTaxRate}%</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Pendapatan</span>
          <span className="text-navy-700">{formatCurrency(scenario.revenue)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Biaya</span>
          <span className="text-navy-700">{formatCurrency(scenario.expenses)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Dasar Pajak</span>
          <span className="text-navy-700">{formatCurrency(scenario.taxableBase)}</span>
        </div>
        <div className="flex justify-between text-[10px] font-semibold border-t border-border/50 pt-1 mt-1">
          <span className="text-text-muted">Estimasi Pajak</span>
          <span className="text-warm-500">{formatCurrency(scenario.estimatedTax)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Sisa Pajak</span>
          <span className="text-navy-700">{formatCurrency(scenario.remainingTax)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Profit Setelah Pajak</span>
          <span className={scenario.postTaxProfit < 0 ? 'text-red-500' : 'text-profit-600'}>
            {formatCurrency(scenario.postTaxProfit)}
          </span>
        </div>
      </div>
    </div>
  )
}

function MonthRow({ month }) {
  return (
    <div className="rounded-lg border border-border bg-cream/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-navy-700">{month.month}</span>
        <span className="text-[10px] font-semibold text-warm-500">
          Estimasi: {formatCurrency(month.estimatedTax)}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Pendapatan</span>
          <span className="text-navy-700">{formatCurrency(month.revenue)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Biaya</span>
          <span className="text-navy-700">{formatCurrency(month.expenses)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Dasar Pajak</span>
          <span className="text-navy-700">{formatCurrency(month.taxableBase)}</span>
        </div>
        <div className="flex justify-between text-[10px] font-semibold border-t border-border/50 pt-1 mt-1">
          <span className="text-text-muted">Kumulatif Cadangan</span>
          <span className="text-profit-600">{formatCurrency(month.cumulativeTaxReserve)}</span>
        </div>
      </div>
    </div>
  )
}

export default function TaxPlanningResults({ result, onSave, saving, errors }) {
  return (
    <div className="space-y-5">
      {/* Disclaimer */}
      <div className="rounded-xl border border-warm-200 bg-warm-50 p-3">
        <p className="text-[10px] font-semibold text-warm-600">⚠️ Ini adalah estimasi perencanaan, bukan pajak resmi.</p>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-600">{err}</p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {result.warnings?.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700">{w}</p>
          ))}
        </div>
      )}

      {/* Hero: Estimasi Pajak */}
      <div className="rounded-2xl border border-warm-400/20 bg-warm-50 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-warm-500">Estimasi Pajak</p>
        <p className="mt-2 text-4xl font-extrabold text-navy-700">
          {formatCurrency(result.estimatedTax)}
        </p>
        <p className="mt-1 text-[10px] text-text-muted">
          {result.taxRegime === 'umkm_final' ? 'Pajak Final UMKM 0.5%' :
           result.taxRegime === 'pph_badan' ? 'PPh Badan 22%' :
           result.taxRegime === 'pph_non_pnbp' ? 'PPh Final 10%' :
           'Custom Rate'}
        </p>
      </div>

      {/* Key metrics */}
      <div className="space-y-3">
        <ResultRow label="Pendapatan Tahunan" value={formatCurrency(result.revenue)} />
        <ResultRow label="Biaya yang Dikurangkan" value={formatCurrency(result.deductibleExpenses)} />
        <ResultRow label="Dasar Pengenaan Pajak" value={formatCurrency(result.taxableBase)} accent />

        <hr className="border-border" />

        <ResultRow label="Pajak Sudah Dibayar" value={formatCurrency(result.taxAlreadyPaid)} />
        {result.taxCredits > 0 && (
          <ResultRow label="Kredit Pajak" value={formatCurrency(result.taxCredits)} />
        )}
        <ResultRow label="Sisa Pajak" value={formatCurrency(result.remainingTax)} accent />

        <hr className="border-border" />

        <ResultRow label="Tarif Efektif" value={`${result.effectiveTaxRate}%`} />
        <ResultRow label="Profit Setelah Pajak" value={formatCurrency(result.postTaxProfit)} highlight />
      </div>

      {/* Tax Reserve */}
      <div className="rounded-xl bg-cream p-4">
        <p className="text-xs font-bold text-navy-700 mb-2">Dana Cadangan Pajak</p>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Tahunan</span>
            <span className="font-semibold text-navy-700">{formatCurrency(result.annualTaxReserve)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Per Bulan</span>
            <span className="font-semibold text-warm-500">{formatCurrency(result.monthlyTaxReserve)}</span>
          </div>
        </div>
      </div>

      {/* Scenarios */}
      {result.scenarios?.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-navy-700">Perbandingan Skenario</p>
            <div className="space-y-2">
              {result.scenarios.map((s, i) => (
                <ScenarioRow key={i} scenario={s} isCurrent={i === 0} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Monthly Breakdown */}
      {result.monthlyBreakdown?.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-navy-700">Rincian Bulanan</p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {result.monthlyBreakdown.map((m, i) => (
                <MonthRow key={i} month={m} />
              ))}
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
          {saving ? 'Menyimpan...' : 'Simpan Tax Planning'}
        </button>
      </div>
    </div>
  )
}
