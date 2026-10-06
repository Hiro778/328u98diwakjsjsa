import { formatCurrency } from '../../lib/orderNumber'
import { LOAN_METHODS } from './calculateLoanSimulation'

function ResultRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-sm font-semibold min-w-0 text-right ${accent ? 'text-warm-500' : 'text-navy-700'}`}>
        {value}
      </span>
    </div>
  )
}

function ComparisonTable({ comparison }) {
  if (!comparison || comparison.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-2 text-left font-semibold text-text-muted">Metode</th>
            <th className="pb-2 text-right font-semibold text-text-muted">Cicilan Awal</th>
            <th className="pb-2 text-right font-semibold text-text-muted">Cicilan Akhir</th>
            <th className="pb-2 text-right font-semibold text-text-muted">Total Bunga</th>
            <th className="pb-2 text-right font-semibold text-text-muted">Total Bayar</th>
          </tr>
        </thead>
        <tbody>
          {comparison.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2 font-medium text-navy-700">{row.methodName}</td>
              <td className="py-2 text-right text-navy-700">{formatCurrency(row.firstPayment)}</td>
              <td className="py-2 text-right text-navy-700">{formatCurrency(row.lastPayment)}</td>
              <td className="py-2 text-right font-semibold text-warm-500">{formatCurrency(row.totalInterest)}</td>
              <td className="py-2 text-right font-semibold text-navy-700">{formatCurrency(row.totalPayment)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AmortizationTable({ schedule }) {
  if (!schedule || schedule.length === 0) return null

  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-[10px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border">
            <th className="py-1.5 text-left font-semibold text-text-muted">#</th>
            <th className="py-1.5 text-right font-semibold text-text-muted">Saldo Awal</th>
            <th className="py-1.5 text-right font-semibold text-text-muted">Cicilan</th>
            <th className="py-1.5 text-right font-semibold text-text-muted">Pokok</th>
            <th className="py-1.5 text-right font-semibold text-text-muted">Bunga</th>
            <th className="py-1.5 text-right font-semibold text-text-muted">Saldo Akhir</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row) => (
            <tr key={row.period} className="border-b border-border/30">
              <td className="py-1 text-text-muted">{row.period}</td>
              <td className="py-1 text-right text-navy-700">{formatCurrency(row.openingBalance)}</td>
              <td className="py-1 text-right font-semibold text-navy-700">{formatCurrency(row.payment)}</td>
              <td className="py-1 text-right text-navy-700">{formatCurrency(row.principalPayment)}</td>
              <td className="py-1 text-right text-warm-500">{formatCurrency(row.interestPayment)}</td>
              <td className="py-1 text-right text-navy-700">{formatCurrency(row.closingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LoanSimulationResults({ result, comparison, onSave, saving, errors, saveMessage }) {
  return (
    <div className="space-y-5">
      {/* Disclaimer */}
      <div className="rounded-xl border border-warm-200 bg-warm-50 p-3">
        <p className="text-[10px] font-semibold text-warm-600">
          ⚠️ Simulasi ini adalah estimasi. Bunga, biaya, dan ketentuan aktual dapat berbeda sesuai produk pinjaman.
        </p>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-600">{err}</p>
          ))}
        </div>
      )}

      {/* Hero: Monthly Payment */}
      {result.isValid && (
        <div className="rounded-2xl border border-warm-400/20 bg-warm-50 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-warm-500">Cicilan per Bulan</p>
          <p className="mt-2 text-4xl font-extrabold text-navy-700">
            {formatCurrency(result.monthlyPayment)}
          </p>
          <p className="mt-1 text-[10px] text-text-muted">
            {LOAN_METHODS[result.method]} · {result.tenorMonths} bulan
          </p>
        </div>
      )}

      {/* Summary */}
      {result.isValid && (
        <div className="space-y-3">
          <ResultRow label="Pokok Pinjaman" value={formatCurrency(result.principal)} />
          <ResultRow label="Suku Bunga" value={`${result.annualInterestRate}% / tahun`} />
          <ResultRow label="Cicilan Pertama" value={formatCurrency(result.firstPayment)} />
          {result.method !== 'flat' && (
            <ResultRow label="Cicilan Terakhir" value={formatCurrency(result.lastPayment)} />
          )}

          <hr className="border-border" />

          <ResultRow label="Total Bunga" value={formatCurrency(result.totalInterest)} accent />
          <ResultRow label="Total Biaya" value={formatCurrency(result.totalFees)} />
          <ResultRow label="Total Pembayaran" value={formatCurrency(result.totalPayment)} accent />
          <ResultRow label="Biaya Pinjaman" value={formatCurrency(result.effectiveTotalCost)} />
        </div>
      )}

      {/* Comparison */}
      {comparison && comparison.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-navy-700">Perbandingan Metode</p>
            <ComparisonTable comparison={comparison} />
          </div>
        </>
      )}

      {/* Amortization Schedule */}
      {result.isValid && result.amortizationSchedule?.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-navy-700">Jadwal Pembayaran</p>
            <AmortizationTable schedule={result.amortizationSchedule} />
          </div>
        </>
      )}

      {/* Save */}
      {result.isValid && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full rounded-xl bg-warm-400 px-5 py-3 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Simulasi'}
          </button>
          {saveMessage && (
            <p className="mt-2 text-center text-xs font-semibold text-emerald-600">
              {saveMessage}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
