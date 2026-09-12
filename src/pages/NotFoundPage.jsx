import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5">
      <div className="text-center">
        <p className="text-6xl font-extrabold text-navy-200">404</p>
        <h1 className="mt-4 text-xl font-bold text-navy-700">Halaman tidak ditemukan</h1>
        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-warm-400 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  )
}
