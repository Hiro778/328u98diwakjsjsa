import { motion } from 'framer-motion'
import LegalDisclaimer from './LegalDisclaimer'

// Dormant service functions preserved for future activation per ui.md:
// import { checkLogoSimilarity, uploadLogoImage } from '../../lib/legalitasService'
// import LogoCheckUpload from './LogoCheckUpload'
// import LogoCheckResults from './LogoCheckResults'

export default function LogoCheckTab() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl border border-border bg-surface p-8 sm:p-12 text-center"
      >
        {/* [Logo icon] */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-cream text-text-muted">
          <svg
            className="h-7 w-7 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
        </div>

        {/* Title & Description */}
        <h2 className="text-xl font-bold text-navy-700">Cek Logo & Kemiripan</h2>
        <p className="mt-2 text-sm text-text-secondary max-w-md mx-auto">
          Analisis kemiripan logo dengan gambar yang tersedia di web.
        </p>

        {/* Status Treatment: [ Segera Hadir ] */}
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-cream px-3.5 py-1 text-xs font-semibold text-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          Segera Hadir
        </div>

        {/* Informational subtext */}
        <p className="mt-3 text-xs text-text-muted">
          Fitur ini sedang dalam tahap pengembangan.
        </p>
      </motion.div>

      <LegalDisclaimer type="logoCheck" />
    </div>
  )
}
