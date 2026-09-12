import { formatCurrency } from '../../lib/orderNumber'
import { onNumericChange, onNumericBlur } from '../../lib/numberInput'

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

/** Shared numeric input with sanitization */
function MoneyInput({ field, value, setField, placeholder = '0', className = '' }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={onNumericChange(field, setField)}
      onBlur={onNumericBlur(field, setField)}
      placeholder={placeholder}
      className={`${numCls} ${className}`}
    />
  )
}

export default function BEPInputForm({
  form,
  setField,
  products,
  loadingProducts,
  latestHPP,
  onUseHPP,
}) {
  return (
    <div className="space-y-6">
      {/* ── Product ── */}
      <div className="space-y-3">
        <SectionHeader title="Produk" subtitle="Pilih produk atau isi manual" />

        <div>
          <FieldLabel label="Pilih Produk" />
          <select
            value={form.productId || ''}
            onChange={(e) => {
              const pid = e.target.value
              if (!pid) {
                setField('productId', '')
                setField('productName', '')
                setField('sellingPricePerUnit', '')
                setField('materialCostPerUnit', '')
                setField('existingCostPrice', 0)
                setField('existingUnitPrice', 0)
                return
              }
              const p = products.find(pr => pr.id === pid)
              if (p) {
                setField('productId', p.id)
                setField('productName', p.name)
                setField('sellingPricePerUnit', p.unit_price || '')
                setField('materialCostPerUnit', p.cost_price || '')
                setField('existingCostPrice', p.cost_price || 0)
                setField('existingUnitPrice', p.unit_price || 0)
              }
            }}
            className={`mt-1 ${selectCls}`}
          >
            <option value="">{loadingProducts ? 'Memuat produk...' : 'Pilih produk atau isi manual'}</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {form.productId && (
          <div className="flex items-center gap-2 flex-wrap">
            {form.productName && (
              <span className="rounded-lg bg-cream px-3 py-1.5 text-xs font-medium text-navy-700">
                {form.productName}
              </span>
            )}
            {form.existingUnitPrice > 0 && (
              <span className="rounded-lg bg-cream px-3 py-1.5 text-xs text-text-muted">
                Harga: {formatCurrency(form.existingUnitPrice)}
              </span>
            )}
            {form.existingCostPrice > 0 && (
              <span className="rounded-lg bg-cream px-3 py-1.5 text-xs text-text-muted">
                HPP: {formatCurrency(form.existingCostPrice)}
              </span>
            )}
          </div>
        )}

        {form.productId && latestHPP && (
          <button
            type="button"
            onClick={onUseHPP}
            className="rounded-lg border border-profit-200 bg-profit-50 px-3 py-2 text-xs font-semibold text-profit-600 transition-colors hover:bg-profit-100"
          >
            Gunakan HPP dari Kalkulator HPP ({formatCurrency(latestHPP.hpp_per_unit || latestHPP)})
          </button>
        )}

        {!form.productId && (
          <div>
            <FieldLabel label="Nama Produk (Manual)" />
            <input
              type="text"
              value={form.productName}
              onChange={(e) => setField('productName', e.target.value)}
              placeholder="Nama produk"
              className={`mt-1 ${inputCls}`}
            />
          </div>
        )}
      </div>

      <hr className="border-border" />

      {/* ── Harga Jual ── */}
      <div>
        <SectionHeader title="Harga Jual" subtitle="Harga jual per unit" />
        <FieldLabel label="Harga Jual per Unit" hint="(Rp)" />
        <MoneyInput field="sellingPricePerUnit" value={form.sellingPricePerUnit} setField={setField} className="mt-1" />
      </div>

      <hr className="border-border" />

      {/* ── Biaya Variabel ── */}
      <div className="space-y-3">
        <SectionHeader title="Biaya Variabel" subtitle="Biaya yang berubah sesuai jumlah produksi/penjualan" />

        <div>
          <FieldLabel label="Bahan Baku / Unit" hint="(Rp)" />
          <MoneyInput field="materialCostPerUnit" value={form.materialCostPerUnit} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Kemasan / Unit" hint="(Rp)" />
          <MoneyInput field="packagingCostPerUnit" value={form.packagingCostPerUnit} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Fee Penjualan / Unit" hint="(komisi, marketplace fee, dll — Rp)" />
          <MoneyInput field="salesFeePerUnit" value={form.salesFeePerUnit} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Biaya Variabel Lain / Unit" hint="(Rp, opsional)" />
          <MoneyInput field="otherVariableCostPerUnit" value={form.otherVariableCostPerUnit} setField={setField} className="mt-1" />
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Biaya Tetap ── */}
      <div className="space-y-3">
        <SectionHeader title="Biaya Tetap" subtitle="Biaya yang tetap meskipun volume penjualan berubah (per bulan)" />

        <div>
          <FieldLabel label="Sewa" hint="(Rp/bulan)" />
          <MoneyInput field="rent" value={form.rent} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Gaji Tetap" hint="(Rp/bulan)" />
          <MoneyInput field="fixedLabor" value={form.fixedLabor} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Utilitas" hint="(listrik, air, internet — Rp/bulan)" />
          <MoneyInput field="utilities" value={form.utilities} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Software / Subscription" hint="(Rp/bulan)" />
          <MoneyInput field="software" value={form.software} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Biaya Tetap Lainnya" hint="(Rp/bulan, opsional)" />
          <MoneyInput field="otherFixedCosts" value={form.otherFixedCosts} setField={setField} className="mt-1" />
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Target ── */}
      <div className="space-y-3">
        <SectionHeader title="Target" subtitle="Penjualan aktual dan target profit (opsional)" />

        <div>
          <FieldLabel label="Penjualan Aktual" hint="(unit/bulan)" />
          <MoneyInput field="actualUnits" value={form.actualUnits} setField={setField} className="mt-1 w-32" />
        </div>

        <div>
          <FieldLabel label="Target Profit" hint="(Rp/bulan, opsional)" />
          <MoneyInput field="targetProfit" value={form.targetProfit} setField={setField} className="mt-1" />
        </div>
      </div>
    </div>
  )
}
