import { useRef, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';
import { textRevealVariants } from '../../lib/motionTokens';

export default function EditorialHero() {
  const containerRef = useRef(null);
  const shouldReduce = useReducedMotion();
  const [activeTab, setActiveTab] = useState('keuangan');

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  // Controlled camera and parallax depth
  const textY = useTransform(scrollYProgress, [0, 0.8], [0, -40]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.35]);
  const productScale = useTransform(scrollYProgress, [0, 0.8], [1, 1.03]);
  const productY = useTransform(scrollYProgress, [0, 0.8], [0, -25]);

  // Floating satellite badges subtle parallax
  const sat1Y = useTransform(scrollYProgress, [0, 0.8], [0, -15]);
  const sat2Y = useTransform(scrollYProgress, [0, 0.8], [0, -30]);

  const handleExploreClick = (e) => {
    e.preventDefault();
    const showcase = document.getElementById('pinned-showcase');
    if (showcase) {
      const rect = showcase.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      window.scrollTo({
        top: rect.top + scrollTop,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section 
      ref={containerRef}
      className="relative min-h-[94vh] pt-28 sm:pt-36 pb-20 px-6 lg:px-12 flex flex-col justify-center overflow-hidden bg-[#0B0F19] text-[#F8FAFC] border-b border-[#222C3E]"
    >
      {/* Blueprint grid overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
        
        {/* Left Column: Restrained, High-Conversion SaaS Headline */}
        <motion.div 
          style={{
            y: shouldReduce ? 0 : textY,
            opacity: shouldReduce ? 1 : textOpacity,
          }}
          className="lg:col-span-7 flex flex-col items-start pr-0 lg:pr-6"
        >
          {/* Eyebrow Badge */}
          <motion.div
            custom={0}
            variants={textRevealVariants}
            initial={shouldReduce ? false : "hidden"}
            animate="visible"
            className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#151D2C] border border-[#222C3E] text-[#818CF8] text-xs font-mono tracking-wider uppercase mb-6 font-medium"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8]" />
            BisnisSehat &bull; Live Product System
          </motion.div>

          {/* Product Headline — Restrained, dashboard-aligned typography */}
          <motion.h1
            custom={1}
            variants={textRevealVariants}
            initial={shouldReduce ? false : "hidden"}
            animate="visible"
            className="text-2xl sm:text-4xl lg:text-6xl font-black tracking-tight leading-[1.15] text-white mb-6"
          >
            Dashboard <br />
            operasional nyata. <br />
            <span className="text-[#818CF8]">
              Keputusan finansial
            </span> <br />
            yang terukur.
          </motion.h1>

          {/* Supporting Text */}
          <motion.p
            custom={2}
            variants={textRevealVariants}
            initial={shouldReduce ? false : "hidden"}
            animate="visible"
            className="text-sm sm:text-lg text-slate-300 max-w-xl leading-relaxed mb-8 font-normal"
          >
            Satu kanvas kerja terpadu: dari kalkulasi HPP bahan baku, proyeksi arus kas likuid, pengujian performa kampanye, hingga transaksi kasir POS otomatis.
          </motion.p>

          {/* CTA Group */}
          <motion.div
            custom={3}
            variants={textRevealVariants}
            initial={shouldReduce ? false : "hidden"}
            animate="visible"
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto mb-10"
          >
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-[#818CF8] hover:bg-[#A5B4FC] text-[#0B0F19] font-semibold text-sm transition-colors duration-150 active:scale-95 group text-center"
            >
              Buka Dashboard
              <svg 
                className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-1" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>

            {/* Dynamic Explore Controller CTA */}
            <button
              onClick={handleExploreClick}
              className="inline-flex items-center justify-center gap-2 text-xs font-mono font-medium tracking-wider text-slate-200 hover:text-white transition-colors px-5 py-3 rounded-lg bg-[#151D2C] hover:bg-[#1E293B] border border-[#222C3E] cursor-pointer active:scale-95 text-center"
              title="Mulai penjelajahan ekosistem"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8]" />
              <span>JELAJAHI PRODUK</span>
              <svg 
                className="w-3.5 h-3.5 text-[#818CF8] transition-transform duration-300 group-hover:translate-y-0.5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </motion.div>

          {/* Telemetry quick metrics strip */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 border-t border-[#222C3E] pt-6 w-full max-w-xl">
            <div>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 block uppercase tracking-wider truncate">HPP Akurat</span>
              <p className="text-xs sm:text-lg font-bold text-white font-mono mt-0.5 truncate">Margin Terkunci</p>
            </div>
            <div>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 block uppercase tracking-wider truncate">Runway Kas</span>
              <p className="text-xs sm:text-lg font-bold text-emerald-400 font-mono mt-0.5 truncate">Likuiditas Terjaga</p>
            </div>
            <div>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 block uppercase tracking-wider truncate">POS Real-time</span>
              <p className="text-xs sm:text-lg font-bold text-indigo-400 font-mono mt-0.5 truncate">Auto-Deduct</p>
            </div>
          </div>
        </motion.div>

        {/* Right Column: Live Product Command Center (Dashboard Source of Truth) */}
        <motion.div 
          style={{
            scale: shouldReduce ? 1 : productScale,
            y: shouldReduce ? 0 : productY,
          }}
          className="lg:col-span-5 relative w-full flex items-center justify-center mt-8 lg:mt-0"
        >
          {/* Central Command Window */}
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="relative w-full rounded-xl bg-[#151D2C] border border-[#222C3E] shadow-xl overflow-hidden z-10"
          >
            {/* Window Bar with Live Status */}
            <div className="px-5 py-3 bg-[#0B0F19] text-white flex items-center justify-between border-b border-[#222C3E]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                <span className="text-[11px] font-mono text-slate-300 ml-2 font-semibold">
                  BisnisSehat &bull; Telemetry Engine
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-mono text-emerald-300 font-semibold uppercase">
                  Live & Sync
                </span>
              </div>
            </div>

            {/* Interactive Module Tabs */}
            <div className="flex border-b border-[#222C3E] bg-[#101625] px-4 pt-2 gap-1 text-[11px] font-mono">
              <button
                onClick={() => setActiveTab('keuangan')}
                className={`px-3 py-1.5 rounded-t-md font-semibold transition-colors cursor-pointer ${
                  activeTab === 'keuangan'
                    ? 'bg-[#151D2C] text-amber-400 border-t-2 border-amber-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Keuangan & HPP
              </button>
              <button
                onClick={() => setActiveTab('arus-kas')}
                className={`px-3 py-1.5 rounded-t-md font-semibold transition-colors cursor-pointer ${
                  activeTab === 'arus-kas'
                    ? 'bg-[#151D2C] text-emerald-400 border-t-2 border-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Arus Kas
              </button>
              <button
                onClick={() => setActiveTab('marketing')}
                className={`px-3 py-1.5 rounded-t-md font-semibold transition-colors cursor-pointer ${
                  activeTab === 'marketing'
                    ? 'bg-[#151D2C] text-indigo-400 border-t-2 border-indigo-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Marketing
              </button>
            </div>

            {/* Core Metrics Content */}
            <div className="p-6 space-y-5">
              
              {/* Health Score Overview */}
              <div className="flex items-start justify-between pb-4 border-b border-[#222C3E]">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">
                    Kesehatan Finansial
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className="text-xl font-bold text-white font-mono">Terpantau Prima</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold font-mono">
                    Sangat Sehat
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                    Data terkonsolidasi
                  </span>
                </div>
              </div>

              {/* Dynamic Tab Body */}
              <AnimatePresence mode="wait">
                {activeTab === 'keuangan' && (
                  <motion.div
                    key="keuangan"
                    initial={shouldReduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-4"
                  >
                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                        <span>Margin Kotor Terkunci (HPP Rp12.000 vs Jual Rp25.000)</span>
                        <span className="font-mono text-amber-400 font-bold">Terproteksi</span>
                      </div>
                      <div className="w-full h-2 rounded bg-[#0B0F19] overflow-hidden border border-[#222C3E]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '74%' }}
                          transition={{ duration: 0.9, ease: 'easeOut' }}
                          className="h-full bg-amber-400 rounded"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                        <span>Target BEP Bulan Ini (500 Porsi Tercapai)</span>
                        <span className="font-mono text-emerald-400 font-bold">118% (Surplus)</span>
                      </div>
                      <div className="w-full h-2 rounded bg-[#0B0F19] overflow-hidden border border-[#222C3E]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '85%' }}
                          transition={{ duration: 0.9, delay: 0.1, ease: 'easeOut' }}
                          className="h-full bg-indigo-500 rounded"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'arus-kas' && (
                  <motion.div
                    key="arus-kas"
                    initial={shouldReduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-3"
                  >
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-400">Buffer Likuiditas:</span>
                      <span className="text-emerald-400 font-bold text-sm">Status Aman</span>
                    </div>
                    {/* Mini Sparkline Chart */}
                    <div className="p-3 rounded-lg bg-[#0B0F19] border border-[#222C3E]">
                      <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                        <span>Proyeksi Kas 60 Hari</span>
                        <span className="text-emerald-400">Surplus Terproyeksi</span>
                      </div>
                      <svg className="w-full h-10 text-emerald-400" viewBox="0 0 200 40">
                        <path
                          d="M 0 30 Q 50 25, 100 18 T 200 8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <circle cx="200" cy="8" r="3" fill="#34D399" />
                      </svg>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'marketing' && (
                  <motion.div
                    key="marketing"
                    initial={shouldReduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2.5 rounded-lg bg-[#0B0F19] border border-[#222C3E]">
                        <span className="text-[10px] text-slate-400 block">ROAS Iklan</span>
                        <span className="text-indigo-300 font-bold text-sm">2.9x (Bundling)</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#0B0F19] border border-[#222C3E]">
                        <span className="text-[10px] text-slate-400 block">Biaya Akuisisi</span>
                        <span className="text-slate-200 font-bold text-sm">Rp 11.200 / User</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs font-mono">
                      <span className="text-[10px] text-indigo-300 block">A/B Test Aktif</span>
                      <span className="text-indigo-200 font-bold">Diskon 15% vs Bundle Kopi</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom Live Status Row */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-[#0B0F19] border border-[#222C3E]">
                  <span className="text-[10px] text-slate-400 font-mono block">BUFFER KAS</span>
                  <span className="text-xs font-bold font-mono text-white">Likuiditas Terjaga</span>
                </div>
                <div className="p-3 rounded-lg bg-[#0B0F19] border border-[#222C3E]">
                  <span className="text-[10px] text-slate-400 font-mono block">STATUS KASIR POS</span>
                  <span className="text-xs font-bold font-mono text-emerald-400">Online & Sync</span>
                </div>
              </div>

            </div>
          </motion.div>

          {/* SATELLITE LAYER 3: Badges */}
          <motion.div
            style={{ y: shouldReduce ? 0 : sat1Y }}
            initial={shouldReduce ? false : { opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="absolute -bottom-6 -left-6 z-20 rounded-lg bg-[#1E293B] text-white p-3.5 shadow-lg border border-[#222C3E] max-w-[190px] hidden sm:block"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[10px] font-mono text-amber-300 font-bold uppercase">HPP Terkunci</span>
            </div>
            <p className="text-[11px] text-slate-300 font-medium">Margin laba per porsi aman</p>
          </motion.div>

          <motion.div
            style={{ y: shouldReduce ? 0 : sat2Y }}
            initial={shouldReduce ? false : { opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="absolute -top-6 -right-5 z-20 rounded-lg bg-[#1E293B] text-white p-3.5 shadow-lg border border-[#222C3E] max-w-[200px] hidden sm:block"
          >
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 mb-1">
              <span className="text-indigo-400 font-bold">Kasir POS Meja 03</span>
              <span className="text-emerald-400 font-bold">Lunas QRIS</span>
            </div>
            <p className="text-xs font-bold text-white">Stok Gudang Terpotong Otomatis</p>
          </motion.div>

        </motion.div>

      </div>
    </section>
  );
}
