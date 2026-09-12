import { onNumericChange, onNumericBlur } from '../../lib/numberInput'
import { TAX_REGIMES, EXPENSE_CATEGORIES } from './calculateTaxPlanning'

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

function ExpenseRow({ item, index, setItem, removeItem }) {
  const fieldPrefix = `exp_${index}`
  return (
    <div className="rounded-xl border border-border bg-cream/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
          Biaya #{index + 1}
        </span>
        <button
          type="button"
          onClick={() => removeItem(index)}
          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label={`Hapus biaya ${index + 1}`}
        >
          Hapus
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel label="Kategori" />
          <select
            value={item.category}
            onChange={(e) => setItem(index, 'category', e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            {EXPENSE_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel label="Periode" />
          <select
            value={item.period}
            onChange={(e) => setItem(index, 'period', e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            <option value="monthly">Bulanan</option>
            <option value="annual">Tahunan</option>
          </select>
        </div>
      </div>

      <div>
        <FieldLabel label="Jumlah" hint="(Rp)" />
        <MoneyInput
          value={item.amount}
          onChange={onNumericChange(fieldPrefix + '_amount', (field, val) => setItem(index, 'amount', val))}
          onBlur={onNumericBlur(fieldPrefix + '_amount', (field, val) => setItem(index, 'amount', val))}
          className="mt-1"
        />
      </div>
    </div>
  )
}

export default function TaxPlanningInput({ form, setField, expenses, setExpenses }) {
  function addExpense() {
    setExpenses(prev => [...prev, { category: 'materials', amount: '', period: 'monthly' }])
  }

  function removeExpense(index) {
    setExpenses(prev => prev.filter((_, i) => i !== index))
  }

  function setExpenseItem(index, field, value) {
    setExpenses(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Informasi Bisnis ── */}
      <div className="space-y-3">
        <SectionHeader title="Informasi Bisnis" subtitle="Profil bisnis untuk perencanaan pajak" />

        <div>
          <FieldLabel label="Nama Bisnis" />
          <input
            type="text"
            value={form.businessName}
            onChange={(e) => setField('businessName', e.target.value)}
            placeholder="Nama bisnis Anda"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div>
          <FieldLabel label="Regime Pajak" />
          <select
            value={form.taxRegime}
            onChange={(e) => setField('taxRegime', e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            {Object.entries(TAX_REGIMES).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          {TAX_REGIMES[form.taxRegime] && (
            <p className="mt-1 text-[10px] text-text-muted">{TAX_REGIMES[form.taxRegime].description}</p>
          )}
        </div>

        {form.taxRegime === 'custom' && (
          <div>
            <FieldLabel label="Tarif Pajak Custom" hint="(contoh: 0.15 = 15%)" />
            <MoneyInput
              value={form.customRate}
              onChange={onNumericChange('customRate', (field, val) => setField(field, val))}
              onBlur={onNumericBlur('customRate', (field, val) => setField(field, val))}
              placeholder="0.15"
              className="mt-1 w-32"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={form.hasNPWP}
              onChange={(e) => setField('hasNPWP', e.target.checked)}
              className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-400/50"
            />
            Memiliki NPWP
          </label>
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Pendapatan ── */}
      <div className="space-y-3">
        <SectionHeader title="Pendapatan" subtitle="Total pendapatan bisnis Anda" />

        <div>
          <FieldLabel label="Mode Input" />
          <select
            value={form.revenueMode}
            onChange={(e) => setField('revenueMode', e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            <option value="annual">Tahunan</option>
            <option value="monthly">Bulanan (x12)</option>
          </select>
        </div>

        <div>
          <FieldLabel
            label={form.revenueMode === 'monthly' ? 'Pendapatan per Bulan' : 'Pendapatan per Tahun'}
            hint="(Rp)"
          />
          <MoneyInput
            value={form.revenue}
            onChange={onNumericChange('revenue', (field, val) => setField(field, val))}
            onBlur={onNumericBlur('revenue', (field, val) => setField(field, val))}
            className="mt-1"
          />
        </div>

        {/* Monthly revenue breakdown */}
        {form.revenueMode === 'annual' && (
          <div>
            <FieldLabel label="Rincian per Bulan (opsional)" hint="isi untuk melihat breakdown bulanan" />
            <button
              type="button"
              onClick={() => setField('showMonthlyBreakdown', !form.showMonthlyBreakdown)}
              className="mt-1 text-[10px] font-semibold text-warm-500 hover:underline"
            >
              {form.showMonthlyBreakdown ? 'Sembunyikan' : 'Tampilkan Rincian Bulanan'}
            </button>
          </div>
        )}
      </div>

      <hr className="border-border" />

      {/* ── Biaya / Pengeluaran ── */}
      <div className="space-y-3">
        <SectionHeader title="Biaya yang Dapat Dikurangkan" subtitle="Pengeluaran bisnis yang mengurangi dasar pengenaan pajak" />

        {expenses.map((item, i) => (
          <ExpenseRow
            key={i}
            item={item}
            index={i}
            setItem={setExpenseItem}
            removeItem={removeExpense}
          />
        ))}

        <button
          type="button"
          onClick={addExpense}
          className="w-full rounded-xl border-2 border-dashed border-warm-300 bg-warm-50/50 px-4 py-3 text-sm font-semibold text-warm-500 transition-colors hover:bg-warm-50"
        >
          + Tambah Biaya
        </button>
      </div>

      <hr className="border-border" />

      {/* ── Pajak Lainnya ── */}
      <div className="space-y-3">
        <SectionHeader title="Pajak Lainnya" subtitle="Pajak yang sudah dibayarkan atau kredit pajak" />

        <div>
          <FieldLabel label="Pajak Sudah Dibayar" hint="(Rp)" />
          <MoneyInput
            value={form.taxAlreadyPaid}
            onChange={onNumericChange('taxAlreadyPaid', (field, val) => setField(field, val))}
            onBlur={onNumericBlur('taxAlreadyPaid', (field, val) => setField(field, val))}
            className="mt-1"
          />
        </div>

        <div>
          <FieldLabel label="Kredit Pajak" hint="(Rp, opsional)" />
          <MoneyInput
            value={form.taxCredits}
            onChange={onNumericChange('taxCredits', (field, val) => setField(field, val))}
            onBlur={onNumericBlur('taxCredits', (field, val) => setField(field, val))}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  )
}
