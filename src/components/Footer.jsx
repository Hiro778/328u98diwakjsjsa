import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { getEnabledFooterSocialLinks } from '../services/footerSocialLinksService.js'
import SocialLinkIcon from './SocialLinkIcon.jsx'

// ─── Static validated footer link columns ─────────────────────────────────────
// Routes audited per @42.md §8 — only confirmed valid routes used
const FOOTER_COLUMNS = [
  {
    title: 'Produk',
    links: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Fitur', href: '/#features' },
      { label: 'Ekspor', href: '/dashboard/ekspor' },
      { label: 'Harga', href: '/pricing' },
      { label: 'Tools', href: '/dashboard/semua-tools' },
    ],
  },
  {
    title: 'Perusahaan',
    links: [
      { label: 'Tentang Kami', href: '/tentang-kami' },
      { label: 'FAQ', href: '/dashboard/bantuan' },
    ],
  },
]

export default function Footer() {
  const [socialLinks, setSocialLinks] = useState([])

  useEffect(() => {
    let cancelled = false
    getEnabledFooterSocialLinks()
      .then((data) => {
        if (!cancelled) setSocialLinks(data)
      })
      .catch(() => {
        // silently fail — footer social links are non-critical
        if (!cancelled) setSocialLinks([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const hasSocialLinks = socialLinks.length > 0

  return (
    <footer className="border-t border-[#222C3E] bg-[#0B0F19] text-slate-300 px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">

          {/* Brand + description */}
          <div className="col-span-2 sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E293B] border border-[#222C3E]">
                <span className="text-xs font-bold text-[#818CF8]">BS</span>
              </div>
              <span className="text-base font-bold tracking-tight text-white">
                BisnisSehat
              </span>
            </Link>
            <p className="mt-3 max-w-[240px] text-xs leading-relaxed text-slate-400">
              Platform bisnis UMKM Indonesia &mdash; kelola keuangan, stok, penjualan,
              legalitas, sampai ekspor dalam satu tempat.
            </p>
          </div>

          {/* Produk & Perusahaan columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="mb-3 text-xs font-semibold text-slate-200 uppercase tracking-wider">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* IKUTI KAMI — dynamic social links */}
          {hasSocialLinks && (
            <div>
              <h4 className="mb-3 text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Ikuti Kami
              </h4>
              <div className="flex flex-wrap gap-3">
                {socialLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target={link.platform !== 'phone' && link.platform !== 'email' ? '_blank' : undefined}
                    rel={link.platform !== 'phone' && link.platform !== 'email' ? 'noopener noreferrer' : undefined}
                    title={link.label}
                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#1E293B] border border-[#222C3E] text-slate-400 hover:text-[#818CF8] hover:border-[#818CF8]/40 transition-colors"
                    aria-label={link.label}
                  >
                    <SocialLinkIcon platform={link.platform} className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[#222C3E] pt-6 sm:flex-row">
          <p className="text-xs text-slate-500">
            &copy; 2026 BisnisSehat. All rights reserved.
          </p>
          <p className="text-xs text-slate-500">
            Made with care for Indonesian UMKM.
          </p>
        </div>
      </div>
    </footer>
  )
}
