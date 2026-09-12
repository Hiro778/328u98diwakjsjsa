import { formatCurrency } from '../../lib/orderNumber'

const MODE_LABELS = {
  price: 'Berdasarkan Harga Jual',
  target_margin: 'Target Margin',
  target_markup: 'Target Markup',
}

function DetailRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-sm font-semibold ${accent ? 'text-warm-500' : 'text-navy-700'}`}>
        {value}
      </span>
    </div>
  )
}

export default function MarginAnalysisDetail({ item, onBack, onReuse, onDelete }) {
  if (!item) return null

  const formattedDate = new Date(item.created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-lg">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-text-secondary transition-colors hover:text-navy-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Kembali ke Riwayat
      </button>

      <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
        {/* Product */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Produk</p>
          <p className="mt-1 text-lg font-extrabold text-navy-700">{item.product_name}</p>
        </div>

        {/* HPP Source */}
        <div className="rounded-xl bg-cream p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Sumber HPP</p>
          <p className="mt-1 text-xs font-semibold text-navy-700">
            {item.product_id ? 'HPP Calculator' : 'Manual'}
            {' · '}
            {formattedDate}
          </p>
        </div>

        <hr className="border-border" />

        {/* Cost */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-2">Cost</p>
          <div className="space-y-0.5">
            <DetailRow label="HPP" value={formatCurrency(item.hpp_snapshot || item.cost_per_unit)} />
            <DetailRow label="Biaya Penjualan" value={formatCurrency(item.selling_cost_per_unit)} />
            <DetailRow label="Total Cost" value={formatCurrency(item.total_cost_per_unit)} />
          </div>
        </div>

        <hr className="border-border" />

        {/* Selling */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-2">Selling</p>
          <div className="space-y-0.5">
            <DetailRow label="Harga Jual" value={formatCurrency(item.effective_selling_price)} />
            <DetailRow label="Profit / Unit" value={formatCurrency(item.profit_per_unit)} accent />
            <DetailRow label="Margin" value={`${Number(item.margin_percent).toFixed(2)}%`} />
            <DetailRow label="Markup" value={`${Number(item.markup_percent).toFixed(2)}%`} />
          </div>
        </div>

        <hr className="border-border" />

        {/* Mode */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Mode</span>
          <span className="rounded-full bg-navy-100 px-2.5 py-0.5 text-[10px] font-semibold text-navy-700">
            {MODE_LABELS[item.analysis_mode] || item.analysis_mode}
          </span>
        </div>

        {/* Notes */}
        {item.notes && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Catatan</p>
            <p className="mt-1 text-xs text-text-secondary">{item.notes}</p>
          </div>
        )}

        {/* Quantity */}
        {item.quantity > 1 && (
          <>
            <hr className="border-border" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-2">Quantity</p>
              <p className="text-xs text-text-secondary">
                {item.quantity} unit · Revenue: {formatCurrency(item.revenue)} · Total Profit: {formatCurrency(item.total_profit)}
              </p>
            </div>
          </>
        )}

        <hr className="border-border" />

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onReuse(item)}
            className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
          >
            Gunakan Kembali
          </button>
          <button
            onClick={() => {
              if (confirm('Hapus analisis ini?')) {
                onDelete(item.id)
              }
            }}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>
  )
}
