/**
 * DateInput — Native date input dengan UX yang diperbaiki.
 *
 * Seluruh area input dapat diklik untuk membuka native date picker browser,
 * tidak hanya ikon kalender kecil di sisi kanan.
 *
 * Menggunakan showPicker() dengan try/catch untuk kompatibilitas browser lama.
 * Tidak menggunakan library eksternal atau custom calendar UI.
 */
export default function DateInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  name,
  id,
  'aria-label': ariaLabel,
  className = '',
  ...rest
}) {
  function handleClick(e) {
    if (disabled) return
    try {
      e.currentTarget.showPicker()
    } catch (_) {
      // Browser lama (Safari < 16) tidak support showPicker() — tidak crash,
      // native click behavior tetap berjalan.
    }
  }

  return (
    <input
      type="date"
      value={value}
      onChange={onChange}
      onClick={handleClick}
      min={min}
      max={max}
      required={required}
      disabled={disabled}
      name={name}
      id={id}
      aria-label={ariaLabel}
      className={`cursor-pointer ${className}`}
      {...rest}
    />
  )
}
