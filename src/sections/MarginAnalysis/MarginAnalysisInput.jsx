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

export default function MarginAnalysisInput({
  form,
  setField,
  products,
  loadingProducts,
  latestHPP,
  onUseHPP,
}) {
  const mode = form.analysisMode || 'price'

  return (
    <div className="space-y-6">
      {/* ── Product ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-navy-700">Produk</h3>

        <div>
          <FieldLabel label="Pilih Produk" />
          <select
            value={form.productId || ''}
            onChange={(e) => {
              const pid = e.target.value
              if (!pid) {
                setField('productId', '')
                setField('productName', '')
                setField('costPerUnit', '')
                setField('existingCostPrice', 0)
                setField('existingUnitPrice', 0)
                return
              }
              const p = products.find(pr => pr.id === pid)
              if (p) {
                setField('productId', p.id)
                setField('productName', p.name)
                setField('costPerUnit', p.cost_price || '')
                setField('existingCostPrice', p.cost_price || 0)
                setField('existingUnitPrice', p.unit_price || 0)
              }
            }}
            className={`mt-1 ${selectCls}`}
          >
            <option value="">{loadingProducts ? 'Memuat produk...' : 'Pilih produk atau analisis manual'}</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {form.productId && (
          <div className="flex items-center gap-2">
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
          </div>
        )}

        {form.productId && latestHPP && (
          <div className="rounded-lg border border-profit-200 bg-profit-50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-profit-600 text-sm">✓</span>
              <div>
                <p className="text-xs font-semibold text-profit-700">
                  {formatCurrency(latestHPP.hpp_per_unit)}
                </p>
                <p className="text-[10px] text-profit-600">
                  Dari HPP Calculator · {new Date(latestHPP.created_at).toLocaleDateString('id-ID')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onUseHPP}
              className="rounded-lg border border-profit-200 bg-white px-3 py-1.5 text-xs font-semibold text-profit-600 transition-colors hover:bg-profit-50"
            >
              Gunakan HPP ini
            </button>
          </div>
        )}

        {form.productId && !latestHPP && (
          <div className="rounded-lg border border-warm-200 bg-warm-50 p-3">
            <p className="text-xs text-warm-600">Produk ini belum memiliki HPP.</p>
            <a
              href="/dashboard/keuangan/hpp-calculator"
              className="mt-1 inline-block text-xs font-semibold text-warm-700 underline hover:text-warm-800"
            >
              Hitung HPP
            </a>
          </div>
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

      {/* ── Analysis Mode ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-navy-700">Mode Analisis</h3>
        <div className="flex gap-2">
          {[
            { key: 'price', label: 'Berdasarkan Harga Jual' },
            { key: 'target_margin', label: 'Target Margin' },
            { key: 'target_markup', label: 'Target Markup' },
          ].map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setField('analysisMode', m.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                mode === m.key
                  ? 'bg-warm-400 text-white'
                  : 'border border-border bg-surface text-text-secondary hover:bg-cream'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Cost / HPP ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-navy-700">Biaya</h3>

        <div>
          <FieldLabel label="HPP / Cost per Unit" hint="(Rp)" />
          <MoneyInput field="costPerUnit" value={form.costPerUnit} setField={setField} className="mt-1" />
        </div>

        <div>
          <FieldLabel label="Biaya Penjualan / Unit" hint="(marketplace fee, komisi, dll — opsional)" />
          <MoneyInput field="sellingCostPerUnit" value={form.sellingCostPerUnit} setField={setField} className="mt-1" />
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Selling Price / Target ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-navy-700">
          {mode === 'price' ? 'Harga Jual' : mode === 'target_margin' ? 'Target Margin' : 'Target Markup'}
        </h3>

        {mode === 'price' && (
          <>
            <div>
              <FieldLabel label="Harga Jual" hint="(Rp)" />
              <MoneyInput field="sellingPrice" value={form.sellingPrice} setField={setField} className="mt-1" />
            </div>

            <div>
              <FieldLabel label="Diskon" hint="(%, opsional)" />
              <div className="mt-1 flex items-center gap-2">
                <MoneyInput field="discountPercent" value={form.discountPercent} setField={setField} className="w-24" />
                <span className="text-sm text-text-muted">%</span>
              </div>
            </div>
          </>
        )}

        {mode === 'target_margin' && (
          <div>
            <FieldLabel label="Target Margin" hint="(% dari harga jual)" />
            <div className="mt-1 flex items-center gap-2">
              <MoneyInput field="targetMargin" value={form.targetMargin} setField={setField} className="w-24" />
              <span className="text-sm text-text-muted">%</span>
            </div>
            <p className="mt-1 text-[11px] text-text-muted italic">
              Persentase laba dibanding harga jual. Harga jual = HPP / (1 - margin%)
            </p>
          </div>
        )}

        {mode === 'target_markup' && (
          <div>
            <FieldLabel label="Target Markup" hint="(% di atas HPP)" />
            <div className="mt-1 flex items-center gap-2">
              <MoneyInput field="targetMarkup" value={form.targetMarkup} setField={setField} className="w-24" />
              <span className="text-sm text-text-muted">%</span>
            </div>
            <p className="mt-1 text-[11px] text-text-muted italic">
              Persentase kenaikan harga dibanding biaya/HPP. Harga jual = HPP × (1 + markup%)
            </p>
          </div>
        )}
      </div>

      <hr className="border-border" />

      {/* ── Quantity ── */}
      <div>
        <FieldLabel label="Jumlah Unit" />
        <MoneyInput field="quantity" value={form.quantity} setField={setField} className="mt-1 w-32" />
      </div>

      {/* ── Notes ── */}
      <div>
        <FieldLabel label="Catatan" hint="(opsional)" />
        <textarea
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Catatan analisis..."
          rows={2}
          className={`mt-1 ${inputCls}`}
        />
      </div>
    </div>
  )
}
