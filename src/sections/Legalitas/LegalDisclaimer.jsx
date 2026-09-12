import { DISCLAIMER } from '../../lib/legalUtils'

export default function LegalDisclaimer({ children, type = 'general' }) {
  const text = children || DISCLAIMER[type] || DISCLAIMER.general

  return (
    <div className="flex items-start gap-2 rounded-xl border border-warm-200 bg-warm-50 p-3">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-warm-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="text-[12px] leading-relaxed text-warm-600">{text}</p>
    </div>
  )
}
