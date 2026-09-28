import { usePlatformSettings } from '../hooks/usePlatformSettings'

export default function MaintenanceScreen() {
  const { platformName, supportEmail } = usePlatformSettings()

  return (
    <div
      data-testid="maintenance-screen"
      className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 select-none"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-lg">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1
            data-testid="maintenance-title"
            className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white"
          >
            Pemeliharaan Sistem
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            {platformName} sedang dalam mode pemeliharaan terjadwal untuk peningkatan infrastruktur dan keandalan sistem. Mohon kembali beberapa saat lagi.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 text-xs text-slate-400 text-left space-y-1.5">
          <div className="font-semibold text-slate-300">Bantuan &amp; Dukungan:</div>
          <div>Email: <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">{supportEmail}</a></div>
          <div className="text-[11px] text-slate-500 pt-1">Seluruh data bisnis dan transaksi Anda tetap aman dan terjaga.</div>
        </div>
      </div>
    </div>
  )
}
