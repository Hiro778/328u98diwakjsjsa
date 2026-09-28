import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';

export default function EditorialCTA() {
  const sectionRef = useRef(null);
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Parallax orb & content lift
  const orbScale = useTransform(scrollYProgress, [0, 0.5, 1], shouldReduce ? [1, 1, 1] : [0.85, 1.1, 0.95]);
  const contentY = useTransform(scrollYProgress, [0, 1], shouldReduce ? [0, 0] : [25, -20]);

  return (
    <section
      id="final-cta"
      ref={sectionRef}
      className="relative py-32 px-6 lg:px-12 bg-[#0B0F19] text-[#F8FAFC] overflow-hidden border-b border-[#222C3E]"
    >
      {/* Background ambient glow */}
      <motion.div
        style={{ scale: orbScale }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[450px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none"
      />
      <div className="absolute top-0 right-1/4 w-[400px] h-[300px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <motion.div
        style={{ y: contentY }}
        className="max-w-4xl mx-auto text-center space-y-8 relative z-10"
      >
        {/* Eyebrow */}
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#818CF8] block font-semibold">
          Ambil Kendali Bisnis Anda
        </span>

        {/* Headline */}
        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
          Hentikan tebak-tebakan. <br />
          <span className="text-[#818CF8]">
            Jalankan bisnis dengan angka pasti.
          </span>
        </h2>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
          Mulai dalam hitungan menit. Dapatkan kalkulasi HPP otomatis, pemantauan runway kas likuid, dan kasir POS yang terhubung langsung ke dashboard Anda.
        </p>

        {/* Action Group */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link
            to="/auth"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg bg-[#818CF8] hover:bg-[#A5B4FC] text-[#0B0F19] font-semibold text-sm transition-colors duration-150 active:scale-95 group"
          >
            Mulai Sekarang &mdash; Gratis
            <svg 
              className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-1" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>

          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg bg-[#151D2C] hover:bg-[#1E293B] text-slate-200 font-medium text-sm border border-[#222C3E] hover:border-slate-600 transition-colors duration-150 active:scale-95"
          >
            Akses Dashboard Demo
          </Link>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-slate-400 pt-6">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Tanpa Kartu Kredit
          </span>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Setup Instan &lt; 3 Menit
          </span>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Data Terenkripsi Aman
          </span>
        </div>
      </motion.div>
    </section>
  );
}
