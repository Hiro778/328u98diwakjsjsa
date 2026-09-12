export default function InventoryField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  error,
  helpText,
  inputMode,
  min,
  max,
  step,
}) {
  const baseCls =
    'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 disabled:opacity-50 disabled:cursor-not-allowed'
  const errorCls = error ? 'border-red-300 focus:border-red-400 focus:ring-red-200/50' : ''

  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-navy-700">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        className={`${baseCls} ${errorCls}`}
      />
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
      {helpText && !error && (
        <p className="mt-1 text-[11px] text-text-muted">{helpText}</p>
      )}
    </div>
  )
}
