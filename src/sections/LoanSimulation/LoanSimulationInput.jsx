import { onNumericChange, onNumericBlur } from '../../lib/numberInput'
import { LOAN_METHODS, TENOR_UNITS } from './calculateLoanSimulation'

const inputCls = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50'
const numCls = `${inputCls} text-right overflow-x-auto`
const selectCls = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none'

function FieldLabel({ label, hint }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {hint && <span className="text-[10px] text-text-muted/70">{hint}</span>}
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-navy-700">{title}</h3>
      {subtitle && <p className="text-[11px] text-text-muted">{subtitle}</p>}
    </div>
  )
}

function MoneyInput({ value, onChange, onBlur, placeholder = '0', className = '' }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`${numCls} ${className}`}
    />
  )
}

export default function LoanSimulationInput({ form, setField }) {
  function handleTenorChange(value) {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0 || num !== Math.floor(num)) {
      setField('tenorValue', value)
      return
    }
    setField('tenorValue', value)
    // Convert to months
    const months = form.tenorUnit === 'years' ? num * 12 : num
    setField('tenorMonths', months)
  }

  function handleTenorUnitChange(unit) {
    setField('tenorUnit', unit)
    const num = Number(form.tenorValue)
    if (Number.isFinite(num) && num > 0) {
      const months = unit === 'years' ? num * 12 : num
      setField('tenorMonths', months)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Pinjaman ── */}
      <div className="space-y-3">
        <SectionHeader title="Parameter Pinjaman" subtitle="Masukkan detail pinjaman yang ingin disimulasikan" />

        <div>
          <FieldLabel label="Jumlah Pinjaman" hint="(Rp)" />
          <MoneyInput
            value={form.principal}
            onChange={onNumericChange('principal', (f, v) => setField(f, v))}
            onBlur={onNumericBlur('principal', (f, v) => setField(f, v))}
            className="mt-1"
          />
        </div>

        <div>
          <FieldLabel label="Suku Bunga" hint="(% per tahun)" />
          <MoneyInput
            value={form.annualInterestRate}
            onChange={onNumericChange('annualInterestRate', (f, v) => setField(f, v))}
            onBlur={onNumericBlur('annualInterestRate', (f, v) => setField(f, v))}
            placeholder="12"
            className="mt-1 w-32"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Tenor" />
            <MoneyInput
              value={form.tenorValue}
              onChange={(e) => handleTenorChange(e.target.value)}
              onBlur={(e) => handleTenorChange(e.target.value)}
              placeholder="12"
              className="mt-1"
            />
          </div>
          <div>
            <FieldLabel label="Unit" />
            <select
              value={form.tenorUnit}
              onChange={(e) => handleTenorUnitChange(e.target.value)}
              className={`mt-1 ${selectCls}`}
            >
              {Object.entries(TENOR_UNITS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <FieldLabel label="Metode Bunga" />
          <select
            value={form.method}
            onChange={(e) => setField('method', e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            {Object.entries(LOAN_METHODS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-text-muted">
            {form.method === 'flat' && 'Bunga dihitung dari pokok pinjaman awal. Cicilan tetap.'}
            {form.method === 'effective' && 'Bunga dihitung dari sisa pokok. Cicilan menurun.'}
            {form.method === 'annuity' && 'Cicilan tetap setiap bulan (pokok + bunga).'}
          </p>
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Biaya Tambahan ── */}
      <div className="space-y-3">
        <SectionHeader title="Biaya Tambahan" subtitle="Biaya di luar bunga (opsional)" />

        <div>
          <FieldLabel label="Biaya Administrasi" hint="(Rp)" />
          <MoneyInput
            value={form.adminFee}
            onChange={onNumericChange('adminFee', (f, v) => setField(f, v))}
            onBlur={onNumericBlur('adminFee', (f, v) => setField(f, v))}
            className="mt-1"
          />
        </div>

        <div>
          <FieldLabel label="Biaya Provisi" hint="(% dari pokok)" />
          <MoneyInput
            value={form.provisionRate}
            onChange={onNumericChange('provisionRate', (f, v) => setField(f, v))}
            onBlur={onNumericBlur('provisionRate', (f, v) => setField(f, v))}
            placeholder="0"
            className="mt-1 w-32"
          />
        </div>

        <div>
          <FieldLabel label="Biaya Lain" hint="(Rp)" />
          <MoneyInput
            value={form.otherFee}
            onChange={onNumericChange('otherFee', (f, v) => setField(f, v))}
            onBlur={onNumericBlur('otherFee', (f, v) => setField(f, v))}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  )
}
