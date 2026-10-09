import { motion } from 'framer-motion'

export default function LandingState({ onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <p className="mb-3 text-sm font-semibold tracking-wide text-warm-400 uppercase">
        Global Trade Intelligence
      </p>
      <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-cream sm:text-4xl">
        Siap bawa produk lo ke
        <br />
        <span className="text-warm-400">pasar global?</span>
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-cream/60">
        Hitung biaya, harga jual, margin, dan potensi perdagangan sebelum kirim barang.
      </p>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onStart}
        className="mt-8 rounded-xl bg-warm-400 px-7 py-3.5 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
      >
        Mulai Analisis Perdagangan
      </motion.button>
    </motion.div>
  )
}
