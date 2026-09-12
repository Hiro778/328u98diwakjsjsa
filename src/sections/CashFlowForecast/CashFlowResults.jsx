import { formatCurrency } from '../../lib/orderNumber'

function ResultRow({ label, value, accent, highlight }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-sm font-semibold min-w-0 text-right ${accent ? 'text-warm-500' : highlight ? 'text-profit-600' : 'text-navy-700'}`}>
        {value}
      </span>
    </div>
  )
}

function PeriodRow({ period }) {
  const isNegative = period.closingBalance < 0
  return (
    <div className={`rounded-lg border p-3 ${isNegative ? 'border-red-200 bg-red-50' : 'border-border bg-cream/50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-navy-700">{period.periodLabel}</span>
        <span className={`text-xs font-semibold ${isNegative ? 'text-red-500' : 'text-navy-700'}`}>
          {formatCurrency(period.closingBalance)}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Saldo awal</span>
          <span className="text-navy-700">{formatCurrency(period.openingBalance)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Pemasukan</span>
          <span className="text-profit-600">+{formatCurrency(period.totalInflows)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">Pengeluaran</span>
          <span className="text-red-500">-{formatCurrency(period.totalOutflows)}</span>
        </div>
        <div className="flex justify-between text-[10px] font-semibold border-t border-border/50 pt-1 mt-1">
          <span className="text-text-muted">Arus kas bersih</span>
          <span className={period.netCashFlow >= 0 ? 'text-profit-600' : 'text-red-500'}>
            {period.netCashFlow >= 0 ? '+' : ''}{formatCurrency(period.netCashFlow)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function CashFlowResults({ result, onSave, saving, errors }) {
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

      {/* Shortfall warning */}
      {result.shortfallDetected && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-600">Saldo kas diproyeksikan menurun</p>
              <p className="mt-1 text-xs text-red-500">
                Saldo kas akan mencapai {formatCurrency(result.minimumCashBalance)} — terjadi kekurangan kas sebesar {formatCurrency(result.shortfallAmount)}.
                Pertimbangkan untuk menambah pemasukan atau menunda pengeluaran.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero: Closing Cash */}
      <div className={`rounded-2xl p-6 text-center ${result.shortfallDetected ? 'border-2 border-red-300 bg-red-50' : 'border border-warm-400/20 bg-warm-50'}`}>
        <p className="text-xs font-bold uppercase tracking-wide text-warm-500">Saldo Kas Akhir</p>
        <p className={`mt-2 text-4xl font-extrabold ${result.closingCash < 0 ? 'text-red-600' : 'text-navy-700'}`}>
          {formatCurrency(result.closingCash)}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {result.periodType === 'weekly' ? 'setelah minggu terakhir' : 'setelah bulan terakhir'}
        </p>
      </div>

      {/* Summary */}
      <div className="space-y-3">
        <ResultRow label="Saldo Kas Saat Ini" value={formatCurrency(result.openingCash)} />
        <ResultRow label="Total Pemasukan" value={formatCurrency(result.totalInflows)} highlight />
        <ResultRow label="Total Pengeluaran" value={formatCurrency(result.totalOutflows)} />
        <ResultRow label="Arus Kas Bersih" value={formatCurrency(result.netCashFlow)} accent />

        <hr className="border-border" />

        <ResultRow label="Saldo Minimum" value={formatCurrency(result.minimumCashBalance)} />
        <ResultRow label="Saldo Maksimum" value={formatCurrency(result.maximumCashBalance)} />
      </div>

      {/* Period breakdown */}
      {result.periods.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-navy-700">Rincian per Periode</p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {result.periods.map(p => (
                <PeriodRow key={p.periodNumber} period={p} />
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
          {saving ? 'Menyimpan...' : 'Simpan Forecast'}
        </button>
      </div>
    </div>
  )
}
