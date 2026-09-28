import { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';

export default function SystemConvergence() {
  const containerRef = useRef(null);
  const shouldReduce = useReducedMotion();

  // Normalized scroll progress for the convergence stage (300vh)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Spring smoothed progress
  const progress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 22,
    mass: 0.25,
    skipInitialAnimation: true,
  });

  // -------------------------------------------------------------------------
  // CAMERA CHOREOGRAPHY (Section 7)
  // Phase 1 (0.00-0.30): pull back to reveal all 4 ecosystem pillars
  // Phase 2 (0.30-0.65): subtle lateral/orbital movement as modules connect
  // Phase 3 (0.65-0.85): camera moves closer to central system
  // Phase 4 (0.85-1.00): settles into compact product object as CTA enters
  // -------------------------------------------------------------------------
  const cameraScale = useTransform(
    progress,
    [0.0, 0.25, 0.55, 0.75, 0.90, 1.0],
    shouldReduce ? [1, 1, 1, 1, 1, 1] : [0.96, 1.02, 1.04, 1.02, 0.94, 0.90]
  );

  const cameraRotateX = useTransform(
    progress,
    [0.0, 0.35, 0.65, 0.85, 1.0],
    shouldReduce ? [0, 0, 0, 0, 0] : [1.5, -2.0, 1.8, -0.5, 0]
  );

  const cameraRotateY = useTransform(
    progress,
    [0.0, 0.35, 0.65, 0.85, 1.0],
    shouldReduce ? [0, 0, 0, 0, 0] : [-1.5, 2.0, -1.2, 0.5, 0]
  );

  // -------------------------------------------------------------------------
  // 4 PILLARS CONVERGENCE (Section 4 & 5)
  // Pillars start spaced outward and move inward toward central system
  // -------------------------------------------------------------------------
  // Money (top-left)
  const p1X = useTransform(progress, [0.05, 0.45], shouldReduce ? ['0px', '0px'] : ['-40px', '0px']);
  const p1Y = useTransform(progress, [0.05, 0.45], shouldReduce ? ['0px', '0px'] : ['-30px', '0px']);
  const p1Opacity = useTransform(progress, [0.0, 0.15, 0.55, 0.70], [0.3, 1, 0.8, 0.15]);

  // Growth (top-right)
  const p2X = useTransform(progress, [0.05, 0.45], shouldReduce ? ['0px', '0px'] : ['40px', '0px']);
  const p2Y = useTransform(progress, [0.05, 0.45], shouldReduce ? ['0px', '0px'] : ['-30px', '0px']);
  const p2Opacity = useTransform(progress, [0.0, 0.15, 0.55, 0.70], [0.3, 1, 0.8, 0.15]);

  // Operations (bottom-left)
  const p3X = useTransform(progress, [0.10, 0.50], shouldReduce ? ['0px', '0px'] : ['-40px', '0px']);
  const p3Y = useTransform(progress, [0.10, 0.50], shouldReduce ? ['0px', '0px'] : ['30px', '0px']);
  const p3Opacity = useTransform(progress, [0.05, 0.20, 0.60, 0.75], [0.2, 1, 0.8, 0.15]);

  // Intelligence (bottom-right)
  const p4X = useTransform(progress, [0.10, 0.50], shouldReduce ? ['0px', '0px'] : ['40px', '0px']);
  const p4Y = useTransform(progress, [0.10, 0.50], shouldReduce ? ['0px', '0px'] : ['30px', '0px']);
  const p4Opacity = useTransform(progress, [0.05, 0.20, 0.60, 0.75], [0.2, 1, 0.8, 0.15]);

  // Connector lines drawing
  const connectorPathLength = useTransform(progress, [0.12, 0.48], [0, 1]);

  // Data packets travel progress along paths
  const dataPacketProgress = useTransform(progress, [0.25, 0.60], [0, 1]);

  // -------------------------------------------------------------------------
  // CENTRAL SYNTHESIS DASHBOARD (Section 6 & 8)
  // Morphs from connecting state to coherent executive overview
  // -------------------------------------------------------------------------
  const centralScale = useTransform(progress, [0.20, 0.55, 0.80, 0.95], [0.92, 1, 1, 0.92]);
  const centralGlow = useTransform(
    progress,
    [0.20, 0.55, 0.75, 1.0],
    [
      'rgba(129, 140, 248, 0.05)',
      'rgba(16, 185, 129, 0.16)',
      'rgba(129, 140, 248, 0.18)',
      'rgba(99, 102, 241, 0.12)',
    ]
  );

  // Executive synthesis metrics reveal
  const metricsOpacity = useTransform(progress, [0.45, 0.65], [0, 1]);
  const healthBarWidth = useTransform(progress, [0.55, 0.75], ['10%', '92%']);

  // -------------------------------------------------------------------------
  // CONVERGENCE -> CTA TRANSITION (Section 9 & 10)
  // As user reaches the end of convergence, CTA smoothly enters
  // -------------------------------------------------------------------------
  const ctaOpacity = useTransform(progress, [0.75, 0.90], [0, 1]);
  const ctaY = useTransform(progress, [0.75, 0.92], shouldReduce ? [0, 0] : [40, 0]);

  return (
    <div id="system-convergence" className="relative bg-[#0B0F19] text-[#F8FAFC] overflow-hidden selection:bg-indigo-500/30">
      
      {/* 300vh PINNED CONVERGENCE STAGE */}
      <section 
        ref={containerRef}
        className="relative h-[300vh]"
      >
        <div className="sticky top-0 h-screen w-full flex flex-col justify-between px-6 sm:px-8 xl:px-14 py-6 sm:py-8 overflow-hidden z-20">
          
          {/* Ambient Lighting Orb */}
          <motion.div 
            style={{ backgroundColor: centralGlow }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[600px] rounded-full blur-[150px] pointer-events-none transition-colors duration-500" 
          />

          {/* Blueprint Grid */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.035]"
            style={{
              backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />

          {/* TOP CONCEPT BANNER */}
          <div className="relative z-30 flex items-center justify-between border-b border-[#222C3E] pb-3 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-xs font-mono tracking-[0.2em] text-slate-300 font-bold uppercase">
                Sintesis Sistem Terpadu &bull; System Convergence
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 hidden sm:block">
              Semua Departemen Bermuara ke Satu Pusat Kendali
            </div>
          </div>

          {/* CENTER: CONVERGENCE STAGE & CENTRAL SYSTEM NODE */}
          <div className="relative w-full max-w-7xl mx-auto my-auto h-[74vh] flex items-center justify-center">
            
            <motion.div
              style={{
                perspective: 1200,
                scale: cameraScale,
                rotateX: cameraRotateX,
                rotateY: cameraRotateY,
              }}
              className="relative w-full h-full flex items-center justify-center"
            >

              {/* SVG CONNECTOR LINES (Drawing inward) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" preserveAspectRatio="none">
                {/* Line: Money (top-left) -> Center */}
                <motion.line 
                  x1="20%" y1="20%" x2="50%" y2="50%" 
                  stroke="#F5A623" strokeWidth="1.5" strokeDasharray="4 4"
                  style={{ pathLength: connectorPathLength, opacity: 0.6 }}
                />
                {/* Line: Growth (top-right) -> Center */}
                <motion.line 
                  x1="80%" y1="20%" x2="50%" y2="50%" 
                  stroke="#818CF8" strokeWidth="1.5" strokeDasharray="4 4"
                  style={{ pathLength: connectorPathLength, opacity: 0.6 }}
                />
                {/* Line: Operations (bottom-left) -> Center */}
                <motion.line 
                  x1="20%" y1="80%" x2="50%" y2="50%" 
                  stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4 4"
                  style={{ pathLength: connectorPathLength, opacity: 0.6 }}
                />
                {/* Line: Intelligence (bottom-right) -> Center */}
                <motion.line 
                  x1="80%" y1="80%" x2="50%" y2="50%" 
                  stroke="#10B981" strokeWidth="1.5" strokeDasharray="4 4"
                  style={{ pathLength: connectorPathLength, opacity: 0.6 }}
                />
              </svg>

              {/* PILLAR 1: MONEY NODE (Top-Left) */}
              <motion.div
                style={{ x: p1X, y: p1Y, opacity: p1Opacity }}
                className="absolute top-4 sm:top-10 left-2 sm:left-12 p-3 sm:p-4 rounded-2xl bg-[#151D2C] border border-amber-500/40 shadow-xl max-w-[200px] z-10 hidden md:block"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-amber-300 font-bold mb-1">
                  <span>01 / KEUANGAN</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </div>
                <p className="text-xs font-bold text-white font-mono">HPP Rp 12.000</p>
                <span className="text-[11px] text-slate-300">Margin laba per porsi aman</span>
              </motion.div>

              {/* PILLAR 2: GROWTH NODE (Top-Right) */}
              <motion.div
                style={{ x: p2X, y: p2Y, opacity: p2Opacity }}
                className="absolute top-4 sm:top-10 right-2 sm:right-12 p-3 sm:p-4 rounded-2xl bg-[#151D2C] border border-indigo-500/40 shadow-xl max-w-[200px] z-10 hidden md:block"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-indigo-300 font-bold mb-1">
                  <span>02 / GROWTH</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                </div>
                <p className="text-xs font-bold text-white font-mono">Atribusi Iklan Riil</p>
                <span className="text-[11px] text-slate-300">Biaya akuisisi terukur</span>
              </motion.div>

              {/* PILLAR 3: OPERATIONS NODE (Bottom-Left) */}
              <motion.div
                style={{ x: p3X, y: p3Y, opacity: p3Opacity }}
                className="absolute bottom-4 sm:bottom-10 left-2 sm:left-12 p-3 sm:p-4 rounded-2xl bg-[#151D2C] border border-blue-500/40 shadow-xl max-w-[200px] z-10 hidden md:block"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-blue-300 font-bold mb-1">
                  <span>03 / OPERATIONS</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                </div>
                <p className="text-xs font-bold text-white font-mono">Kasir POS Online</p>
                <span className="text-[11px] text-slate-300">Stok auto-deduct live</span>
              </motion.div>

              {/* PILLAR 4: INTELLIGENCE NODE (Bottom-Right) */}
              <motion.div
                style={{ x: p4X, y: p4Y, opacity: p4Opacity }}
                className="absolute bottom-4 sm:bottom-10 right-2 sm:right-12 p-3 sm:p-4 rounded-2xl bg-[#151D2C] border border-emerald-500/40 shadow-xl max-w-[200px] z-10 hidden md:block"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-300 font-bold mb-1">
                  <span>04 / INTELLIGENCE</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <p className="text-xs font-bold text-white font-mono">Buffer Likuiditas</p>
                <span className="text-[11px] text-slate-300">Runway kas terpantau</span>
              </motion.div>

              {/* CENTRAL PRODUCT SYSTEM (The Coherent Hub) */}
              <motion.div
                style={{ scale: centralScale }}
                className="w-full max-w-2xl rounded-3xl bg-[#151D2C] border border-[#222C3E] p-6 sm:p-8 shadow-2xl z-20 space-y-5"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#222C3E] pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full bg-indigo-500 animate-pulse" />
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                        BisnisSehat &bull; Executive Command Hub
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400">
                        Sintesis Lintas Modul: Keuangan + Marketing + POS + Kas
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold">
                    Sinkron 100%
                  </span>
                </div>

                {/* Synthesis Module Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-[#0B0F19] border border-[#222C3E]">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Arus Pendapatan</span>
                    <p className="text-sm sm:text-base font-bold text-white font-mono mt-0.5">Terkonsolidasi</p>
                    <span className="text-[10px] font-mono text-emerald-400">POS & Kasir Terhubung</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#0B0F19] border border-[#222C3E]">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Margin Riil</span>
                    <p className="text-sm sm:text-base font-bold text-amber-400 font-mono mt-0.5">HPP Terkunci</p>
                    <span className="text-[10px] font-mono text-slate-400">Biaya Riil vs Jual</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#0B0F19] border border-[#222C3E]">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Buffer Kas</span>
                    <p className="text-sm sm:text-base font-bold text-emerald-400 font-mono mt-0.5">Proyeksi Likuid</p>
                    <span className="text-[10px] font-mono text-emerald-300">Runway Terpantau</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#0B0F19] border border-[#222C3E]">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Efisiensi Iklan</span>
                    <p className="text-sm sm:text-base font-bold text-indigo-400 font-mono mt-0.5">Atribusi Jelas</p>
                    <span className="text-[10px] font-mono text-indigo-300">Biaya vs Laba Riil</span>
                  </div>
                </div>

                {/* Integrated Health Gauge Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300">Skor Kesehatan Finansial & Operasional</span>
                    <span className="text-emerald-400 font-bold">Terpantau Prima</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-[#0B0F19] overflow-hidden border border-[#222C3E]">
                    <motion.div 
                      style={{ width: healthBarWidth }}
                      className="h-full bg-gradient-to-r from-indigo-500 via-emerald-500 to-teal-400 rounded-full" 
                    />
                  </div>
                </div>

                {/* ACTIONABLE CONCLUSION & SMOOTH CTA BRIDGE (Section 9 & 10) */}
                <motion.div 
                  style={{ opacity: ctaOpacity, y: ctaY }}
                  className="pt-4 border-t border-[#222C3E] flex flex-col sm:flex-row items-center justify-between gap-4"
                >
                  <div className="text-center sm:text-left">
                    <h4 className="text-sm font-bold text-white">
                      Semua data terhubung. Keputusan menjadi otomatis.
                    </h4>
                    <p className="text-xs text-slate-400">
                      Satu ekosistem terpadu untuk efisiensi dan pertumbuhan laba riil usaha Anda.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <a
                      href="#final-cta"
                      className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/30 text-center border border-indigo-400/30 active:scale-95"
                    >
                      <span>Aktivasi Akun</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </a>
                    <Link
                      to="/dashboard"
                      className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#1E293B] hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-[#222C3E] text-center active:scale-95"
                    >
                      Dashboard Demo
                    </Link>
                  </div>
                </motion.div>

              </motion.div>

            </motion.div>

          </div>

          {/* BOTTOM PERSISTENT TELEMETRY STRIP */}
          <div className="relative z-30 flex items-center justify-between border-t border-[#222C3E] pt-3 max-w-7xl mx-auto w-full text-[11px] font-mono text-slate-400">
            <span>Konvergensi: 4 Departemen Mengalir ke 1 Pusat Insight</span>
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sistem Aktif & Siap Digunakan
            </span>
          </div>

        </div>
      </section>

    </div>
  );
}
