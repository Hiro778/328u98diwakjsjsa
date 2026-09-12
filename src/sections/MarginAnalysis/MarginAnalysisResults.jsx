import { formatCurrency } from '../../lib/orderNumber'

function ResultRow({ label, value, accent, subtitle }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs text-text-muted">{label}</span>
        {subtitle && <p className="text-[10px] text-text-muted/70">{subtitle}</p>}
      </div>
      <span className={`text-sm font-semibold ${accent ? 'text-warm-500' : 'text-navy-700'}`}>
        {value}
      </span>
    </div>
  )
}

export default function MarginAnalysisResults({
  result,
  scenarios,
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

      {/* Hero: Profit per Unit */}
      <div className="rounded-2xl border border-warm-400/20 bg-warm-50 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-warm-500">Profit / Unit</p>
        <p className="mt-2 text-4xl font-extrabold text-navy-700">
          {result.profitPerUnit !== 0 ? formatCurrency(result.profitPerUnit) : 'Rp 0'}
        </p>
      </div>

      {/* Per-unit breakdown */}
      <div className="space-y-3">
        <ResultRow
          label="HPP / Cost"
          value={formatCurrency(result.costPerUnit)}
        />
        <ResultRow
          label="Biaya Penjualan"
          value={formatCurrency(result.sellingCostPerUnit)}
        />
        <ResultRow
          label="Total Cost / Unit"
          value={formatCurrency(result.totalCostPerUnit)}
        />

        <hr className="border-border" />

        {result.discountAmount > 0 && (
          <>
            <ResultRow
              label="Harga Normal"
              value={formatCurrency(result.grossSellingPrice)}
            />
            <ResultRow
              label="Diskon"
              value={`-${formatCurrency(result.discountAmount)}`}
            />
          </>
        )}
        <ResultRow
          label="Harga Jual"
          value={formatCurrency(result.effectiveSellingPrice)}
          accent
        />
        <ResultRow
          label="Profit / Unit"
          value={formatCurrency(result.profitPerUnit)}
          accent
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cream p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-text-muted">Margin</p>
            <p className="mt-1 text-lg font-extrabold text-navy-700">
              {result.marginPercent.toFixed(2)}%
            </p>
            <p className="text-[10px] text-text-muted">laba / harga jual</p>
          </div>
          <div className="rounded-xl bg-cream p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-text-muted">Markup</p>
            <p className="mt-1 text-lg font-extrabold text-navy-700">
              {result.markupPercent.toFixed(2)}%
            </p>
            <p className="text-[10px] text-text-muted">laba / HPP</p>
          </div>
        </div>
      </div>

      {/* Quantity analysis */}
      {result.quantity > 1 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-navy-700">Analisis {result.quantity} Unit</h3>
            <ResultRow label="Revenue" value={formatCurrency(result.revenue)} />
            <ResultRow label="Total Cost" value={formatCurrency(result.totalCost)} />
            <ResultRow label="Total Profit" value={formatCurrency(result.totalProfit)} accent />
          </div>
        </>
      )}

      {/* Scenario comparison */}
      {scenarios.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-navy-700">Perbandingan Harga</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-semibold text-text-muted">Harga</th>
                    <th className="py-2 text-right font-semibold text-text-muted">Profit</th>
                    <th className="py-2 text-right font-semibold text-text-muted">Margin</th>
                    <th className="py-2 text-right font-semibold text-text-muted">Markup</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border/50 ${
                        Math.abs(s.sellingPrice - result.effectiveSellingPrice) < 1
                          ? 'bg-warm-50 font-semibold'
                          : ''
                      }`}
                    >
                      <td className="py-2 text-navy-700">{formatCurrency(s.sellingPrice)}</td>
                      <td className="py-2 text-right text-navy-700">{formatCurrency(s.profit)}</td>
                      <td className="py-2 text-right text-navy-700">{s.marginPercent.toFixed(2)}%</td>
                      <td className="py-2 text-right text-navy-700">{s.markupPercent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Save button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !result.isValid}
          className="w-full rounded-xl bg-warm-400 px-5 py-3 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan Analisis'}
        </button>
      </div>
    </div>
  )
}
