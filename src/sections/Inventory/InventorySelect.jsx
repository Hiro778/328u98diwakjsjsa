export default function InventorySelect({ label, value, onChange, options, disabled, error }) {
  const baseCls =
    'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 disabled:opacity-50 disabled:cursor-not-allowed'
  const errorCls = error ? 'border-red-300' : ''

  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-navy-700">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${baseCls} ${errorCls}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
