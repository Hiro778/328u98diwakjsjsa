import { calculateRecommendedRestock, getEffectiveStock, getEffectiveMaxStock } from '../../lib/inventoryUtils'

export default function RestockInfo({ product }) {
  if (!product) return null

  const stock = getEffectiveStock(product)
  const maxStock = getEffectiveMaxStock(product)
  const recommended = calculateRecommendedRestock(stock, maxStock)

  if (recommended === null) {
    return (
      <div className="rounded-xl border border-border bg-cream/50 p-4">
        <h4 className="text-xs font-bold text-navy-700">Info Restock</h4>
        <p className="mt-1 text-[12px] text-text-muted">
          Atur stok maksimal untuk melihat rekomendasi restock.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-cream/50 p-4">
      <h4 className="text-xs font-bold text-navy-700">Info Restock</h4>
      <div className="mt-2 space-y-1.5">
        <div className="flex justify-between text-[12px]">
          <span className="text-text-muted">Stok saat ini</span>
          <span className="font-semibold text-navy-700">{stock}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-text-muted">Target stok</span>
          <span className="font-semibold text-navy-700">{maxStock}</span>
        </div>
        <div className="border-t border-border pt-1.5">
          <div className="flex justify-between text-[12px]">
            <span className="font-semibold text-navy-700">Rekomendasi restock</span>
            <span className="font-bold text-profit-600">
              {recommended > 0 ? `+${recommended}` : '0'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
