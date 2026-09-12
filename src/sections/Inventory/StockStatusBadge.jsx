import { getStockStatusLabel, getStockStatusColors } from '../../lib/inventoryUtils'

export default function StockStatusBadge({ stock, minimumStock }) {
  const label = getStockStatusLabel(stock, minimumStock)
  const colors = getStockStatusColors(stock, minimumStock)

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${colors.bg} ${colors.text} ${colors.border}`}>
      {label}
    </span>
  )
}
