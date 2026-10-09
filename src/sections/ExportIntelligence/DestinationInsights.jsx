import { motion } from 'framer-motion'

const destinations = [
  { code: 'SG', name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}', margin: '+18.2%' },
  { code: 'MY', name: 'Malaysia', flag: '\u{1F1F2}\u{1F1FE}', margin: '+14.8%' },
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', margin: '+22.5%' },
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}', margin: '+31.0%' },
  { code: 'US', name: 'USA', flag: '\u{1F1FA}\u{1F1F8}', margin: '+27.2%' },
]

export default function DestinationInsights({ selectedDest, onSelect, interactive = false }) {
  return (
    <div className="space-y-4">
      {destinations.map((d, i) => (
        <motion.button
          key={d.code}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 + i * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => interactive && onSelect?.(d.code)}
          className={`w-full flex items-center gap-4 rounded-xl px-5 py-4 text-left transition-all ${
            selectedDest === d.code
              ? 'bg-warm-400/15 border border-warm-400/30'
              : 'bg-white/5 border border-transparent hover:bg-white/8'
          }`}
          style={{ cursor: interactive ? 'pointer' : 'default' }}
        >
          <span className="text-2xl">{d.flag}</span>
          <div className="flex-1">
            <p className="font-semibold text-cream">{d.name}</p>
            <p className="text-xs text-cream/50">Potential global margin {d.margin}</p>
          </div>
          <svg
            className={`h-4 w-4 transition-colors ${
              selectedDest === d.code ? 'text-warm-400' : 'text-cream/30'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      ))}
    </div>
  )
}

export { destinations }
