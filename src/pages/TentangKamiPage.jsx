import { Link } from 'react-router'
import EditorialNavbar from '../sections/landing/EditorialNavbar'
import Footer from '../components/Footer'

export default function TentangKamiPage() {
  return (
    <div data-theme="dark" className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] selection:bg-indigo-500/30 selection:text-white">
      {/* Top Navbar */}
      <EditorialNavbar />

      <main className="max-w-6xl mx-auto px-5 py-16 sm:px-8 sm:py-24">
        {/* Header Section */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-6">
            Tentang Kami
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Memberdayakan UMKM Indonesia untuk Tumbuh Sehat dan Mandiri.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-slate-300 leading-relaxed">
            BisnisSehat adalah platform digital untuk membantu UMKM mengelola bisnis,
            keuangan, penjualan, operasional, dan pertumbuhan dalam satu tempat.
          </p>
        </div>

        {/* Misi & Tujuan Platform */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 rounded-2xl bg-[#111827] border border-[#1F2937] hover:border-indigo-500/30 transition-all">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Tujuan Platform</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Membantu pelaku usaha mikro, kecil, dan menengah di Indonesia beralih dari
              pencatatan konvensional ke ekosistem terpadu yang efisien, transparan, dan terukur.
              Mulai dari pencatatan transaksi harian hingga perencanaan ekspansi bisnis.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-[#111827] border border-[#1F2937] hover:border-emerald-500/30 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Ekosistem Terintegrasi</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Dirancang dengan standar keamanan data tingkat tinggi, akses multi-cabang,
              dan otomasi alur kerja agar pemilik usaha dapat lebih fokus pada inovasi
              produk dan kepuasan pelanggan.
            </p>
          </div>
        </div>

        {/* Pilar Fitur BisnisSehat */}
        <div className="mt-16">
          <h3 className="text-lg font-semibold text-white mb-6">Layanan Utama BisnisSehat</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B]">
              <h4 className="text-base font-semibold text-slate-200 mb-2">Keuangan & Kalkulator HPP</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Hitung titik impas (BEP), arus kas, proyeksi laba rugi, dan margin keuntungan secara otomatis dan akurat.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B]">
              <h4 className="text-base font-semibold text-slate-200 mb-2">POS & Menu Digital QR</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sistem kasir modern, pemesanan via QR Menu mandiri pelanggan, integrasi QRIS, dan pencetakan struk transaksi.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B]">
              <h4 className="text-base font-semibold text-slate-200 mb-2">Manajemen Stok & Inventaris</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pantau pergerakan bahan baku dan stok produk jadi secara real-time dengan notifikasi batas minimum inventaris.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B]">
              <h4 className="text-base font-semibold text-slate-200 mb-2">Legalitas Usaha & Merek</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Panduan legalitas izin usaha, NIB, pengecekan keaslian logo merek, dan kepatuhan regulasi resmi Indonesia.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B]">
              <h4 className="text-base font-semibold text-slate-200 mb-2">Pusat Ekspor & Kesiapan Pasar</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Analisis kesiapan ekspor UMKM, standar kemasan internasional, dan direktori sertifikasi komoditas dagang.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B]">
              <h4 className="text-base font-semibold text-slate-200 mb-2">Bantuan & Komunitas Bisnis</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pusat FAQ komprehensif, layanan dukungan pelanggan, dan panduan praktis akselerasi bisnis lokal.
              </p>
            </div>
          </div>
        </div>

        {/* CTA section */}
        <div className="mt-20 p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900 border border-indigo-500/20 text-center">
          <h3 className="text-2xl sm:text-3xl font-bold text-white">
            Siap Mengembangkan Usaha Anda?
          </h3>
          <p className="mt-3 max-w-xl mx-auto text-sm text-slate-300">
            Bergabunglah bersama ribuan UMKM Indonesia yang telah mengelola bisnis secara lebih sehat, terstruktur, dan terukur.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/pricing"
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-600/20"
            >
              Lihat Paket Berlangganan
            </Link>
            <Link
              to="/dashboard"
              className="px-6 py-3 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-slate-200 font-medium text-sm border border-[#334155] transition-colors"
            >
              Buka Dashboard
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
