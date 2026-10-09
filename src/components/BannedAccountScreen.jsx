export default function BannedAccountScreen({ banReason, onSignOut }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F19] px-4 sm:px-6">
      <div
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#111827] p-6 sm:p-8 text-center shadow-2xl shadow-red-950/40 transition-all duration-300"
      >
        {/* Shield / Lock Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/40 bg-red-500/10 text-red-500 shadow-inner shadow-red-500/20">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.002A11.959 11.959 0 0112 2.714zm0 13.036h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Status Badge */}
        <div className="mt-5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            Akun Dinonaktifkan (Banned)
          </span>
        </div>

        {/* Title & Message */}
        <h1 className="mt-4 text-xl sm:text-2xl font-extrabold text-white tracking-tight">
          Akses Aplikasi Ditolak
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-gray-400 leading-relaxed">
          Akun Anda telah dinonaktifkan oleh Administrator BisnisSehat. Anda tidak memiliki akses ke dashboard, fitur operasional, POS, kasir, maupun data aplikasi.
        </p>

        {/* Reason Box */}
        <div className="mt-5 rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-400">
            Alasan Pemblokiran:
          </p>
          <p className="mt-1 text-xs sm:text-sm text-gray-300 font-medium break-words">
            {banReason || 'Pelanggaran ketentuan penggunaan atau kebijakan keamanan sistem BisnisSehat.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-3">
          <a
            href="https://wa.me/6281234567890?text=Halo%20Admin%20BisnisSehat,%20akun%20saya%20terkena%20pemblokiran%20dan%20saya%20ingin%20mengajukan%20peninjauan."
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.053-1.077-.083-.437-.134-1.042-.345-1.782-1.002-1.111-.986-1.802-2.42-1.905-2.569-.104-.15-.472-.628-.472-1.199 0-.572.3-.854.407-.971.107-.116.233-.146.311-.146.079 0 .157.001.226.004.072.003.169-.028.264.202.099.239.338.825.367.886.03.06.05.132.01.21-.04.08-.06.13-.12.2-.06.07-.127.155-.181.21-.06.06-.123.125-.053.245.07.12.31.512.665.828.457.406.843.532.963.592.12.06.19.05.26-.03.07-.08.3-.35.38-.47.08-.12.16-.1.27-.06.11.04.7.33.82.39.12.06.2.09.23.14.03.05.03.42-.11.83z" />
            </svg>
            Hubungi Customer Support
          </a>

          <button
            type="button"
            onClick={onSignOut}
            className="rounded-xl border border-gray-700 bg-gray-800/80 px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Keluar dari Akun (Sign Out)
          </button>
        </div>
      </div>
    </div>
  )
}
