import { formatCurrency } from '../../lib/orderNumber'
import { sanitizeForInput } from '../../lib/numberInput'


const EMPTY_MATERIAL = { name: '', quantity: '', unit: 'kg', pricePerUnit: '' }
const EMPTY_LABOR = { name: '', cost: '' }
const EMPTY_ROW = { name: '', cost: '' }
const EMPTY_ITEM = { name: '', quantity: '', unit: 'pcs', pricePerUnit: '' }

const UNITS = ['kg', 'g', 'liter', 'ml', 'pcs', 'ikat', 'lembar', 'pak', 'dus', 'botol', 'cup', 'box']

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-navy-700">{title}</h3>
      {subtitle && <p className="text-[11px] text-text-muted">{subtitle}</p>}
    </div>
  )
}

function AddRowButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex items-center gap-1 text-xs font-medium text-warm-500 transition-colors hover:text-warm-600"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {label}
    </button>
  )
}

function RemoveRowButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

const inputCls = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50'
const numCls = `${inputCls} text-right overflow-x-auto`
const selectCls = 'rounded-lg border border-border bg-surface px-2 py-2 text-sm text-navy-700 focus:border-warm-400 focus:outline-none'

// ─── Numeric input handlers ────────────────────────────────────
// For top-level form fields (setField directly)
function makeTopLevelOnChange(setField) {
  return (e) => setField(e.target.name, sanitizeForInput(e.target.value))
}
function makeTopLevelOnBlur(setField) {
  return (e) => {
    const val = e.target.value
    if (val === '' || val === '.') { setField(e.target.name, val === '.' ? '' : val); return }
    const num = Number(val)
    if (!Number.isFinite(num)) { setField(e.target.name, ''); return }
    // Don't clamp — let validation catch extreme values
  }
}

// Specifically for quantity produced input — tighter max
function makeQuantityOnBlur(setField) {
  return (e) => {
    const val = e.target.value
    if (val === '' || val === '.') { setField('quantityProduced', val === '.' ? '' : val); return }
    const num = Number(val)
    if (!Number.isFinite(num)) { setField('quantityProduced', ''); return }
    // Don't clamp — let validation catch invalid values
  }
}

// For nested array items (updateItem(index, key, value))
function makeNestedOnChange(updateItem, index) {
  return (e) => updateItem(index, e.target.name, sanitizeForInput(e.target.value))
}
function makeNestedOnBlur(updateItem, index) {
  return (e) => {
    const val = e.target.value
    if (val === '' || val === '.') { updateItem(index, e.target.name, val === '.' ? '' : val); return }
    const num = Number(val)
    if (!Number.isFinite(num)) { updateItem(index, e.target.name, ''); return }
    // Don't clamp — let validation catch extreme values
  }
}

// ─── Product Selector ────────────────────────────────────────

function ProductSection({ form, setField, products, loadingProducts }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Produk" subtitle="Pilih produk existing atau isi manual" />

      <div>
        <label className="text-xs font-medium text-text-muted">Pilih Produk</label>
        <select
          value={form.productId || ''}
          onChange={(e) => {
            const pid = e.target.value
            if (!pid) {
              setField('productId', '')
              setField('productName', '')
              setField('productionUnit', 'pcs')
              return
            }
            const p = products.find(pr => pr.id === pid)
            if (p) {
              setField('productId', p.id)
              setField('productName', p.name)
              setField('productionUnit', p.unit || 'pcs')
              setField('existingCostPrice', p.cost_price || 0)
              setField('existingUnitPrice', p.unit_price || 0)
            }
          }}
          className={`mt-1 w-full ${selectCls}`}
        >
          <option value="">{loadingProducts ? 'Memuat produk...' : 'Ketik nama atau pilih'}</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.unit || 'pcs'})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-text-muted">Nama Produk *</label>
          <input
            type="text"
            value={form.productName}
            onChange={(e) => setField('productName', e.target.value)}
            placeholder="Nasi Goreng Spesial"
            className={`mt-1 ${inputCls}`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted">Jumlah Produksi *</label>
          <input
            type="text"
            inputMode="decimal"
            name="quantityProduced"
            value={form.quantityProduced}
            onChange={makeTopLevelOnChange(setField)}
            onBlur={makeQuantityOnBlur(setField)}
            placeholder="100"
            className={`mt-1 ${numCls}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-text-muted">Satuan Produksi</label>
          <select
            value={form.productionUnit}
            onChange={(e) => setField('productionUnit', e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {form.existingCostPrice > 0 && (
          <div className="flex items-end">
            <div className="rounded-lg bg-cream px-3 py-2 text-xs text-text-muted">
              HPP existing: <span className="font-semibold text-navy-700">{formatCurrency(form.existingCostPrice)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Materials ───────────────────────────────────────────────

function MaterialsSection({ form, setField }) {
  const materials = form.materials || []

  function addMaterial() {
    setField('materials', [...materials, { ...EMPTY_MATERIAL }])
  }

  function updateMaterial(index, key, value) {
    const updated = materials.map((m, i) => i === index ? { ...m, [key]: value } : m)
    setField('materials', updated)
  }

  function removeMaterial(index) {
    setField('materials', materials.filter((_, i) => i !== index))
  }

  const subtotal = materials.reduce((sum, m) => {
    const qty = Number(m.quantity) || 0
    const price = Number(m.pricePerUnit) || 0
    return sum + qty * price
  }, 0)

  return (
    <div className="space-y-2">
      <SectionHeader title="Bahan Baku" subtitle="Biaya bahan yang digunakan dalam produksi" />

      {materials.map((m, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-[1fr_60px_70px_90px] gap-1.5">
            <input
              type="text"
              value={m.name}
              onChange={(e) => updateMaterial(i, 'name', e.target.value)}
              placeholder="Nama bahan"
              className={inputCls}
            />
            <input
              type="text"
              inputMode="decimal"
              name="quantity"
              value={m.quantity}
              onChange={makeNestedOnChange(updateMaterial, i)}
              onBlur={makeNestedOnBlur(updateMaterial, i)}
              placeholder="Qty"
              className={numCls}
            />
            <select
              value={m.unit}
              onChange={(e) => updateMaterial(i, 'unit', e.target.value)}
              className={selectCls}
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <input
              type="text"
              inputMode="decimal"
              name="pricePerUnit"
              value={m.pricePerUnit}
              onChange={makeNestedOnChange(updateMaterial, i)}
              onBlur={makeNestedOnBlur(updateMaterial, i)}
              placeholder="Harga/satuan"
              className={numCls}
            />
          </div>
          <RemoveRowButton onClick={() => removeMaterial(i)} />
        </div>
      ))}

      <AddRowButton onClick={addMaterial} label="Tambah Bahan" />

      {materials.length > 0 && (
        <div className="flex justify-end text-xs text-text-muted">
          Subtotal: <span className="ml-2 font-semibold text-navy-700">{formatCurrency(subtotal)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Packaging ───────────────────────────────────────────────

function PackagingSection({ form, setField }) {
  const packaging = form.packaging || []

  function add() {
    setField('packaging', [...packaging, { ...EMPTY_ITEM }])
  }

  function update(index, key, value) {
    const updated = packaging.map((p, i) => i === index ? { ...p, [key]: value } : p)
    setField('packaging', updated)
  }

  function remove(index) {
    setField('packaging', packaging.filter((_, i) => i !== index))
  }

  const subtotal = packaging.reduce((sum, p) => {
    const qty = Number(p.quantity) || 0
    const price = Number(p.pricePerUnit) || 0
    return sum + qty * price
  }, 0)

  return (
    <div className="space-y-2">
      <SectionHeader title="Kemasan" subtitle="Biaya botol, cup, plastik, label, box, dll" />

      {packaging.map((p, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-[1fr_60px_70px_90px] gap-1.5">
            <input type="text" value={p.name} onChange={(e) => update(i, 'name', e.target.value)} placeholder="Nama kemasan" className={inputCls} />
            <input type="text" inputMode="decimal" name="quantity" value={p.quantity} onChange={makeNestedOnChange(update, i)} onBlur={makeNestedOnBlur(update, i)} placeholder="Qty" className={numCls} />
            <select value={p.unit} onChange={(e) => update(i, 'unit', e.target.value)} className={selectCls}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <input type="text" inputMode="decimal" name="pricePerUnit" value={p.pricePerUnit} onChange={makeNestedOnChange(update, i)} onBlur={makeNestedOnBlur(update, i)} placeholder="Harga/satuan" className={numCls} />
          </div>
          <RemoveRowButton onClick={() => remove(i)} />
        </div>
      ))}

      <AddRowButton onClick={add} label="Tambah Kemasan" />

      {packaging.length > 0 && (
        <div className="flex justify-end text-xs text-text-muted">
          Subtotal: <span className="ml-2 font-semibold text-navy-700">{formatCurrency(subtotal)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Labor ───────────────────────────────────────────────────

function LaborSection({ form, setField }) {
  const labor = form.labor || []

  function add() { setField('labor', [...labor, { ...EMPTY_LABOR }]) }
  function update(i, key, val) { setField('labor', labor.map((l, idx) => idx === i ? { ...l, [key]: val } : l)) }
  function remove(i) { setField('labor', labor.filter((_, idx) => idx !== i)) }

  const subtotal = labor.reduce((s, l) => s + (Number(l.cost) || 0), 0)

  return (
    <div className="space-y-2">
      <SectionHeader title="Tenaga Kerja Langsung" subtitle="Biaya upah produksi" />

      {labor.map((l, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-[1fr_120px] gap-1.5">
            <input type="text" value={l.name} onChange={(e) => update(i, 'name', e.target.value)} placeholder="Jenis pekerjaan" className={inputCls} />
            <input type="text" inputMode="decimal" name="cost" value={l.cost} onChange={makeNestedOnChange(update, i)} onBlur={makeNestedOnBlur(update, i)} placeholder="Biaya" className={numCls} />
          </div>
          <RemoveRowButton onClick={() => remove(i)} />
        </div>
      ))}

      <AddRowButton onClick={add} label="Tambah Tenaga Kerja" />

      {labor.length > 0 && (
        <div className="flex justify-end text-xs text-text-muted">
          Subtotal: <span className="ml-2 font-semibold text-navy-700">{formatCurrency(subtotal)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Overhead ────────────────────────────────────────────────

function OverheadSection({ form, setField }) {
  const overhead = form.overhead || []

  function add() { setField('overhead', [...overhead, { ...EMPTY_ROW }]) }
  function update(i, key, val) { setField('overhead', overhead.map((o, idx) => idx === i ? { ...o, [key]: val } : o)) }
  function remove(i) { setField('overhead', overhead.filter((_, idx) => idx !== i)) }

  const subtotal = overhead.reduce((s, o) => s + (Number(o.cost) || 0), 0)

  return (
    <div className="space-y-2">
      <SectionHeader title="Overhead / Biaya Tidak Langsung" subtitle="Listrik, gas, air, sewa, penyusutan, dll" />

      {overhead.map((o, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-[1fr_120px] gap-1.5">
            <input type="text" value={o.name} onChange={(e) => update(i, 'name', e.target.value)} placeholder="Jenis biaya" className={inputCls} />
            <input type="text" inputMode="decimal" name="cost" value={o.cost} onChange={makeNestedOnChange(update, i)} onBlur={makeNestedOnBlur(update, i)} placeholder="Biaya" className={numCls} />
          </div>
          <RemoveRowButton onClick={() => remove(i)} />
        </div>
      ))}

      <AddRowButton onClick={add} label="Tambah Overhead" />

      {overhead.length > 0 && (
        <div className="flex justify-end text-xs text-text-muted">
          Subtotal: <span className="ml-2 font-semibold text-navy-700">{formatCurrency(subtotal)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Other Costs ─────────────────────────────────────────────

function OtherCostsSection({ form, setField }) {
  const otherCosts = form.otherCosts || []

  function add() { setField('otherCosts', [...otherCosts, { ...EMPTY_ROW }]) }
  function update(i, key, val) { setField('otherCosts', otherCosts.map((o, idx) => idx === i ? { ...o, [key]: val } : o)) }
  function remove(i) { setField('otherCosts', otherCosts.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-2">
      <SectionHeader title="Biaya Lain" subtitle="Transport produksi, biaya kecil lainnya (opsional)" />

      {otherCosts.map((o, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-[1fr_120px] gap-1.5">
            <input type="text" value={o.name} onChange={(e) => update(i, 'name', e.target.value)} placeholder="Jenis biaya" className={inputCls} />
            <input type="text" inputMode="decimal" name="cost" value={o.cost} onChange={makeNestedOnChange(update, i)} onBlur={makeNestedOnBlur(update, i)} placeholder="Biaya" className={numCls} />
          </div>
          <RemoveRowButton onClick={() => remove(i)} />
        </div>
      ))}

      <AddRowButton onClick={add} label="Tambah Biaya Lain" />
    </div>
  )
}

// ─── Waste ───────────────────────────────────────────────────

function WasteSection({ form, setField }) {
  return (
    <div className="space-y-1">
      <SectionHeader
        title="Waste / Susut Produksi"
        subtitle="Persentase susut bahan selama produksi (dihitung sekali dari total bahan baku)"
      />
      <div className="flex items-center gap-3">
        <div className="w-32">
          <input
            type="text"
            inputMode="decimal"
            name="wastePercent"
            value={form.wastePercent}
            onChange={makeTopLevelOnChange(setField)}
            onBlur={makeTopLevelOnBlur(setField)}
            placeholder="0"
            className={numCls}
          />
        </div>
        <span className="text-sm text-text-muted">%</span>
        <p className="text-[11px] text-text-muted italic">
          Contoh: beli 10 kg, waste 10% → biaya bahan dihitung untuk 11 kg
        </p>
      </div>
    </div>
  )
}

// ─── Main Export ─────────────────────────────────────────────

export default function HPPInputForm({
  form,
  setField,
  products,
  loadingProducts,
}) {
  return (
    <div className="space-y-6">
      <ProductSection form={form} setField={setField} products={products} loadingProducts={loadingProducts} />

      <hr className="border-border" />

      <MaterialsSection form={form} setField={setField} />

      <hr className="border-border" />

      <PackagingSection form={form} setField={setField} />

      <hr className="border-border" />

      <LaborSection form={form} setField={setField} />

      <hr className="border-border" />

      <OverheadSection form={form} setField={setField} />

      <hr className="border-border" />

      <OtherCostsSection form={form} setField={setField} />

      <hr className="border-border" />

      <WasteSection form={form} setField={setField} />
    </div>
  )
}
