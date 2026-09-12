import { onNumericChange, onNumericBlur } from '../../lib/numberInput'
import { FORECAST_PERIODS, FREQUENCIES } from './calculateCashFlowForecast'

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

function TransactionRow({ item, index, type, setItem, removeItem, maxPeriods }) {
  const fieldPrefix = `${type}_${index}`

  return (
    <div className="rounded-xl border border-border bg-cream/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
          {type === 'inflows' ? 'Pemasukan' : 'Pengeluaran'} #{index + 1}
        </span>
        <button
          type="button"
          onClick={() => removeItem(type, index)}
          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label={`Hapus ${type === 'inflows' ? 'pemasukan' : 'pengeluaran'} ${index + 1}`}
        >
          Hapus
        </button>
      </div>

      <div>
        <FieldLabel label="Nama" />
        <input
          type="text"
          value={item.name}
          onChange={(e) => setItem(type, index, 'name', e.target.value)}
          placeholder={type === 'inflows' ? 'contoh: Penjualan' : 'contoh: Sewa'}
          className={`mt-1 ${inputCls}`}
        />
      </div>

      <div>
        <FieldLabel label="Jumlah" hint="(Rp)" />
        <MoneyInput
          value={item.amount}
          onChange={onNumericChange(fieldPrefix + '_amount', (field, val) => setItem(type, index, 'amount', val))}
          onBlur={onNumericBlur(fieldPrefix + '_amount', (field, val) => setItem(type, index, 'amount', val))}
          className="mt-1"
        />
      </div>

      <div>
        <FieldLabel label="Frekuensi" />
        <select
          value={item.frequency}
          onChange={(e) => setItem(type, index, 'frequency', e.target.value)}
          className={`mt-1 ${selectCls}`}
        >
          {Object.entries(FREQUENCIES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel label="Mulai periode" />
          <input
            type="text"
            inputMode="numeric"
            value={item.startPeriod}
            onChange={(e) => setItem(type, index, 'startPeriod', e.target.value)}
            placeholder="1"
            className={`mt-1 ${numCls}`}
          />
        </div>
        <div>
          <FieldLabel label="Akhir periode" hint="(opsional)" />
          <input
            type="text"
            inputMode="numeric"
            value={item.endPeriod}
            onChange={(e) => setItem(type, index, 'endPeriod', e.target.value)}
            placeholder={maxPeriods ? String(maxPeriods) : '—'}
            className={`mt-1 ${numCls}`}
          />
        </div>
      </div>
    </div>
  )
}

export default function CashFlowInputForm({ form, setField, transactions, setTransactions }) {
  const config = FORECAST_PERIODS[form.forecastPeriod]
  const maxPeriods = config?.periods || 12

  function addItem(type) {
    setTransactions(prev => ({
      ...prev,
      [type]: [...prev[type], {
        name: '',
        amount: '',
        frequency: 'monthly',
        startPeriod: '1',
        endPeriod: '',
      }],
    }))
  }

  function removeItem(type, index) {
    setTransactions(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }))
  }

  function setItem(type, index, field, value) {
    setTransactions(prev => {
      const updated = [...prev[type]]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, [type]: updated }
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Saldo Kas ── */}
      <div className="space-y-3">
        <SectionHeader title="Saldo Kas Saat Ini" subtitle="Jumlah uang tunai yang tersedia sekarang" />

        <div>
          <FieldLabel label="Saldo Kas" hint="(Rp)" />
          <MoneyInput
            value={form.openingCash}
            onChange={onNumericChange('openingCash', (field, val) => setField(field, val))}
            onBlur={onNumericBlur('openingCash', (field, val) => setField(field, val))}
            className="mt-1"
          />
          <p className="mt-1 text-[10px] text-text-muted">
            Total uang tunai di kas atau rekening saat ini
          </p>
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Periode Forecast ── */}
      <div className="space-y-3">
        <SectionHeader title="Periode Forecast" subtitle="Berapa lama proyeksi arus kas" />

        <div>
          <FieldLabel label="Periode" />
          <select
            value={form.forecastPeriod}
            onChange={(e) => setField('forecastPeriod', e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            {Object.entries(FORECAST_PERIODS).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Pemasukan ── */}
      <div className="space-y-3">
        <SectionHeader title="Pemasukan Kas" subtitle="Uang yang masuk ke bisnis Anda" />

        {transactions.inflows.map((item, i) => (
          <TransactionRow
            key={i}
            item={item}
            index={i}
            type="inflows"
            setItem={setItem}
            removeItem={removeItem}
            maxPeriods={maxPeriods}
          />
        ))}

        <button
          type="button"
          onClick={() => addItem('inflows')}
          className="w-full rounded-xl border-2 border-dashed border-profit-300 bg-profit-50/50 px-4 py-3 text-sm font-semibold text-profit-600 transition-colors hover:bg-profit-50"
        >
          + Tambah Pemasukan
        </button>
      </div>

      <hr className="border-border" />

      {/* ── Pengeluaran ── */}
      <div className="space-y-3">
        <SectionHeader title="Pengeluaran Kas" subtitle="Uang yang keluar dari bisnis Anda" />

        {transactions.outflows.map((item, i) => (
          <TransactionRow
            key={i}
            item={item}
            index={i}
            type="outflows"
            setItem={setItem}
            removeItem={removeItem}
            maxPeriods={maxPeriods}
          />
        ))}

        <button
          type="button"
          onClick={() => addItem('outflows')}
          className="w-full rounded-xl border-2 border-dashed border-red-300 bg-red-50/50 px-4 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
        >
          + Tambah Pengeluaran
        </button>
      </div>
    </div>
  )
}
