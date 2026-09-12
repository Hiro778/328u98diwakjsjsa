const footerLinks = [
  {
    title: 'Produk',
    links: [
      { label: 'Dashboard', href: '#dashboard' },
      { label: 'Fitur', href: '#features' },
      { label: 'Ekspor', href: '#export' },
      { label: 'Harga', href: '#pricing' },
      { label: 'Tools', href: '#tools' },
    ],
  },
  {
    title: 'Perusahaan',
    links: [
      { label: 'Tentang Kami', href: '#tentang' },
      { label: 'Blog', href: '#blog' },
      { label: 'Karir', href: '#karir' },
      { label: 'Kontak', href: '#kontak' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Syarat & Ketentuan', href: '#terms' },
      { label: 'Kebijakan Privasi', href: '#privacy' },
      { label: 'Kebijakan Refund', href: '#refund' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-border bg-cream px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <a href="/" className="inline-flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-600">
                <span className="text-xs font-extrabold text-white">BS</span>
              </div>
              <span className="text-base font-bold tracking-tight text-navy-700">
                BisnisSehat
              </span>
            </a>
            <p className="mt-3 max-w-[220px] text-xs leading-relaxed text-text-muted">
              Platform bisnis UMKM Indonesia — kelola keuangan, stok, penjualan, legalitas, sampai ekspor dalam satu tempat.
            </p>
          </div>

          {/* Link columns */}
          {footerLinks.map((col) => (
            <div key={col.title}>
              <h4 className="mb-3 text-xs font-semibold text-navy-600 uppercase tracking-wider">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-text-muted transition-colors hover:text-navy-600"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-text-muted">
            © 2026 BisnisSehat. All rights reserved.
          </p>
          <p className="text-xs text-text-muted">
            Made with care for Indonesian UMKM.
          </p>
        </div>
      </div>
    </footer>
  )
}
