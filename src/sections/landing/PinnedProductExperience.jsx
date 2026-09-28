import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'motion/react';

// Semantic phase definitions mapped to actual dashboard modules
const PHASES = [
  {
    id: 1,
    key: 'finance',
    name: '01 / KEUANGAN',
    title: 'HPP & Margin Kontribusi',
    shortDesc: 'Kalkulasi HPP mendalam hingga per unit untuk mengunci margin kotor usaha.',
    accent: '#F5A623',
    accentText: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/40',
    dotBg: 'bg-amber-400',
  },
  {
    id: 2,
    key: 'cashflow',
    name: '02 / ARUS KAS',
    title: 'Radar Likuiditas & Proyeksi Kas',
    shortDesc: 'Mentransformasi margin menjadi proyeksi ketahanan kas operasional nyata.',
    accent: '#F59E0B',
    accentText: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/40',
    dotBg: 'bg-amber-400',
  },
  {
    id: 3,
    key: 'marketing',
    name: '03 / MARKETING',
    title: 'Atribusi Iklan & ROAS Riil',
    shortDesc: 'Aliran kas promosi dilacak langsung ke metrik efisiensi dan laba bersih.',
    accent: '#818CF8',
    accentText: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    accentBorder: 'border-indigo-500/40',
    dotBg: 'bg-indigo-400',
  },
  {
    id: 4,
    key: 'abtesting',
    name: '04 / A/B TESTING',
    title: 'Uji Penawaran Head-to-Head',
    shortDesc: 'Memisahkan metrik kampanye menjadi varian terukur untuk memvalidasi pemenang.',
    accent: '#6366F1',
    accentText: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    accentBorder: 'border-indigo-500/40',
    dotBg: 'bg-indigo-400',
  },
  {
    id: 5,
    key: 'operations',
    name: '05 / KASIR POS',
    title: 'Kasir Meja & Auto Deduct Stok',
    shortDesc: 'Hasil varian produk masuk ke transaksi POS kasir, pembayaran QRIS, dan pemotongan bahan baku.',
    accent: '#3B82F6',
    accentText: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/40',
    dotBg: 'bg-blue-400',
  },
  {
    id: 6,
    key: 'analytics',
    name: '06 / ANALYTICS',
    title: 'Sintesis Kesehatan Bisnis',
    shortDesc: 'Semua aliran data dari keuangan hingga kasir bermuara ke satu indeks kesehatan bisnis terpadu.',
    accent: '#10B981',
    accentText: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/40',
    dotBg: 'bg-emerald-400',
  },
];

// Target progress centers for deterministic click navigation
const PHASE_PROGRESS = [0.08, 0.25, 0.42, 0.58, 0.74, 0.91];

export default function PinnedProductExperience() {
  const containerRef = useRef(null);
  const shouldReduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  // Single normalized progress source of truth (0 -> 1)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Spring-smoothed progress for silky physical inertia
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 22,
    mass: 0.25,
    skipInitialAnimation: true,
  });

  // Update active step indicator derived directly from raw progress
  useEffect(() => {
    return scrollYProgress.on('change', (val) => {
      let step = 0;
      if (val >= 0.83) step = 5;
      else if (val >= 0.66) step = 4;
      else if (val >= 0.50) step = 3;
      else if (val >= 0.33) step = 2;
      else if (val >= 0.16) step = 1;
      else step = 0;
      setActiveStep(step);
    });
  }, [scrollYProgress]);

  // Ambient lighting color interpolation across phases
  const ambientGlowColor = useTransform(
    smoothProgress,
    [0.0, 0.18, 0.34, 0.50, 0.68, 0.84, 1.0],
    [
      'rgba(245, 166, 35, 0.12)',
      'rgba(245, 158, 11, 0.12)',
      'rgba(129, 140, 248, 0.14)',
      'rgba(99, 102, 241, 0.14)',
      'rgba(59, 130, 246, 0.12)',
      'rgba(16, 185, 129, 0.15)',
      'rgba(16, 185, 129, 0.16)',
    ]
  );

  // -------------------------------------------------------------------------
  // CAMERA SYSTEM (Perspective, subtle rotation, depth) - Section 14
  // -------------------------------------------------------------------------
  const cameraScale = useTransform(
    smoothProgress,
    [0.0, 0.12, 0.25, 0.42, 0.58, 0.74, 0.90, 1.0],
    shouldReduce ? [1, 1, 1, 1, 1, 1, 1, 1] : [1, 1.03, 1.01, 1.02, 1.01, 1.02, 0.98, 0.97]
  );

  const cameraRotateX = useTransform(
    smoothProgress,
    [0.0, 0.18, 0.35, 0.52, 0.70, 0.88, 1.0],
    shouldReduce ? [0, 0, 0, 0, 0, 0, 0] : [0, 2.5, -1.8, 2.0, -1.5, 1.2, 0]
  );

  const cameraRotateY = useTransform(
    smoothProgress,
    [0.0, 0.22, 0.44, 0.66, 0.88, 1.0],
    shouldReduce ? [0, 0, 0, 0, 0, 0] : [0, -1.8, 1.5, -1.2, 1.0, 0]
  );

  // -------------------------------------------------------------------------
  // CONTINUOUS INTERNAL PRODUCT MORPHING (Sections 5, 7, 8, 9, 10, 11, 12)
  // -------------------------------------------------------------------------

  // Phase 1 (0.00-0.22): Keuangan & HPP calculation
  const p1MarginWidth = useTransform(smoothProgress, [0.0, 0.12], ['12%', '52%']);
  const p1Row1Opacity = useTransform(smoothProgress, [0.0, 0.04], [1, 1]);
  const p1Row2Opacity = useTransform(smoothProgress, [0.0, 0.08], [0.8, 1]);
  const p1Row3Opacity = useTransform(smoothProgress, [0.0, 0.12], [0.6, 1]);

  // Transition Keuangan -> Arus Kas (0.16-0.34):
  // Rows compress vertically and travel toward chart
  const financeRowsHeight = useTransform(smoothProgress, [0.15, 0.24], ['160px', '0px']);
  const financeRowsOpacity = useTransform(smoothProgress, [0.16, 0.23], [1, 0]);
  const cashflowPanelHeight = useTransform(smoothProgress, [0.18, 0.28], ['0px', '180px']);
  const cashflowPanelOpacity = useTransform(smoothProgress, [0.18, 0.26], [0, 1]);
  const cashChartPath = useTransform(smoothProgress, [0.20, 0.32], [0, 1]);

  // Transition Arus Kas -> Marketing (0.32-0.50):
  // Cashflow chart morphs into marketing ROAS attribution cards
  const cashflowSectionOpacity = useTransform(smoothProgress, [0.32, 0.38], [1, 0]);
  const marketingSectionOpacity = useTransform(smoothProgress, [0.34, 0.42], [0, 1]);
  const roasBarProgress = useTransform(smoothProgress, [0.36, 0.46], ['10%', '76%']);

  // Transition Marketing -> A/B Testing (0.48-0.66):
  // Campaign metrics split into Variant A vs Variant B side-by-side
  const abTestingSplit = useTransform(smoothProgress, [0.48, 0.56], ['0px', '12px']);
  const abTestingOpacity = useTransform(smoothProgress, [0.48, 0.55], [0, 1]);
  const variantBBarWidth = useTransform(smoothProgress, [0.52, 0.62], ['0%', '68%']);

  // Transition A/B Testing -> Kasir POS (0.64-0.82):
  // Variant cards transform into product catalog tiles & cart total calculates
  const abSectionOpacity = useTransform(smoothProgress, [0.64, 0.70], [1, 0]);
  const posSectionOpacity = useTransform(smoothProgress, [0.66, 0.73], [0, 1]);
  const qrisBadgeScale = useTransform(smoothProgress, [0.72, 0.78], [0.8, 1]);
  const posStockDecrement = useTransform(smoothProgress, [0.72, 0.80], ['100%', '62%']);

  // Transition Kasir POS -> Analytics (0.80-1.00):
  // POS transactions compress into data points converging into unified health dashboard
  const posMainOpacity = useTransform(smoothProgress, [0.80, 0.86], [1, 0]);
  const analyticsOpacity = useTransform(smoothProgress, [0.82, 0.89], [0, 1]);
  const healthScoreWidth = useTransform(smoothProgress, [0.84, 0.96], ['0%', '92%']);

  // -------------------------------------------------------------------------
  // DETERMINISTIC PHASE NAVIGATION (Section 16)
  // Calculates scroll offset accurately, avoiding naive scrollIntoView
  // -------------------------------------------------------------------------
  const jumpToPhase = (phaseIndex) => {
    if (!containerRef.current) return;
    const containerTop = containerRef.current.offsetTop;
    const containerHeight = containerRef.current.offsetHeight;
    const windowHeight = window.innerHeight;
    const targetProgress = PHASE_PROGRESS[phaseIndex];
    const targetScrollY = containerTop + targetProgress * (containerHeight - windowHeight);

    window.scrollTo({
      top: targetScrollY,
      behavior: 'smooth',
    });
  };

  return (
    <div id="pinned-showcase" className="relative bg-[#0B0F19] text-[#F8FAFC] overflow-hidden selection:bg-indigo-500/30">
      
      {/* 600vh PINNED CONTINUOUS STAGE */}
      <section 
        ref={containerRef} 
        className="relative h-[600vh]"
      >
        <div className="sticky top-0 h-screen w-full flex flex-col justify-between px-6 sm:px-8 xl:px-14 py-6 sm:py-8 overflow-hidden z-20">
          
          {/* AMBIENT BACKGROUND GLOW */}
          <motion.div 
            style={{ 
              backgroundColor: shouldReduce ? 'rgba(129, 140, 248, 0.1)' : ambientGlowColor,
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[650px] rounded-full blur-[150px] pointer-events-none transition-colors duration-500" 
          />

          {/* SUBTLE FINE GRID */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.035]"
            style={{
              backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 0)',
              backgroundSize: '36px 36px',
            }}
          />

          {/* TOP CONTROLLER / PHASE STEPPER BAR */}
          <div className="relative z-30 flex flex-wrap items-center justify-between border-b border-[#222C3E] pb-3.5 max-w-7xl mx-auto w-full gap-3">
            <div className="flex items-center gap-3">
              <span 
                className="w-2.5 h-2.5 rounded-full animate-pulse transition-colors duration-300"
                style={{ backgroundColor: PHASES[activeStep].accent }}
              />
              <span className="text-xs font-mono tracking-[0.2em] text-slate-300 font-bold uppercase">
                Kanvas Produk Kontinu &bull; BisnisSehat Engine
              </span>
            </div>

            {/* Stepper Pills */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {PHASES.map((phase, idx) => (
                <button
                  key={phase.id}
                  onClick={() => jumpToPhase(idx)}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-mono transition-all duration-300 cursor-pointer ${
                    activeStep === idx
                      ? 'bg-[#1E293B] text-white border border-[#222C3E] shadow-md font-bold scale-105'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                  style={{
                    color: activeStep === idx ? phase.accent : undefined,
                    borderColor: activeStep === idx ? `${phase.accent}66` : 'transparent',
                  }}
                  title={`Lompat ke ${phase.title}`}
                >
                  {phase.name.split(' / ')[1]}
                </button>
              ))}
            </div>

            <span className="hidden xl:inline text-[11px] font-mono text-slate-400">
              Gulir ke bawah untuk melihat transformasi kontinu &darr;
            </span>
          </div>

          {/* CENTER: PERSISTENT SINGLE PRODUCT CANVAS */}
          <div className="relative w-full max-w-7xl mx-auto my-auto h-[74vh] flex items-center justify-center">
            
            {/* Cinematic Perspective Camera Wrapper */}
            <motion.div
              style={{
                perspective: 1200,
                scale: cameraScale,
                rotateX: cameraRotateX,
                rotateY: cameraRotateY,
              }}
              className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center"
            >

              {/* LEFT COLUMN: NARRATIVE HEADLINE (Evolves with scroll phase) */}
              <div className="lg:col-span-5 space-y-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${PHASES[activeStep].accentBorder} ${PHASES[activeStep].accentBg} ${PHASES[activeStep].accentText} text-xs font-mono tracking-widest font-bold`}>
                  <span className={`w-2 h-2 rounded-full ${PHASES[activeStep].dotBg} animate-pulse`} />
                  {PHASES[activeStep].name}
                </div>

                <h2 className="text-3xl sm:text-4xl xl:text-5xl font-black text-white tracking-tight leading-[1.1]">
                  {activeStep === 0 && (
                    <>Kunci Margin.<br /><span className="text-amber-400">HPP Riil per Unit.</span></>
                  )}
                  {activeStep === 1 && (
                    <>Ketahanan Kas.<br /><span className="text-amber-400">Proyeksi Kas Terkendali.</span></>
                  )}
                  {activeStep === 2 && (
                    <>Akuisisi Terukur.<br /><span className="text-indigo-400">Atribusi ROAS Terukur.</span></>
                  )}
                  {activeStep === 3 && (
                    <>A/B Testing Nyata.<br /><span className="text-indigo-400">Validasi Penawaran.</span></>
                  )}
                  {activeStep === 4 && (
                    <>Kasir POS Terpadu.<br /><span className="text-blue-400">Auto Potong Stok.</span></>
                  )}
                  {activeStep === 5 && (
                    <>Diagnosis Eksekutif.<br /><span className="text-emerald-400">Rasio Kesehatan Terpadu.</span></>
                  )}
                </h2>

                <p className="text-sm xl:text-base text-slate-300 leading-relaxed max-w-lg font-normal">
                  {PHASES[activeStep].shortDesc}
                </p>

                {/* Micro Diagnostic Status Box */}
                <div className="p-4 rounded-2xl bg-[#151D2C] border border-[#222C3E] text-xs font-mono flex items-center justify-between text-slate-200 shadow-lg">
                  <span>Status Engine: Terkoneksi Real-time</span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Active Canvas
                  </span>
                </div>
              </div>

              {/* RIGHT COLUMN: SINGLE MORPHING PRODUCT INTERFACE */}
              <div className="lg:col-span-7 relative w-full">
                
                {/* Main Unified Dashboard Card Shell */}
                <div className="rounded-3xl bg-[#151D2C] border border-[#222C3E] p-6 xl:p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
                  
                  {/* Dashboard Card Top Header */}
                  <div className="flex items-center justify-between border-b border-[#222C3E] pb-3.5 mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                      <span className="text-xs font-mono text-slate-300 font-semibold ml-1">
                        BisnisSehat Workspace &bull; {PHASES[activeStep].title}
                      </span>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full border ${PHASES[activeStep].accentBorder} ${PHASES[activeStep].accentBg} ${PHASES[activeStep].accentText} text-[10px] font-mono font-bold uppercase`}>
                      Sinkron
                    </span>
                  </div>

                  {/* ======================================================= */}
                  {/* CANVAS STAGE 1 & 2: KEUANGAN -> ARUS KAS PHYSICAL MORPH */}
                  {/* ======================================================= */}
                  <div className="space-y-4">
                    
                    {/* HPP Rows that compress vertically into Cash Flow */}
                    <motion.div 
                      style={{
                        height: financeRowsHeight,
                        opacity: financeRowsOpacity,
                        overflow: 'hidden',
                      }}
                      className="space-y-2 text-xs font-mono"
                    >
                      <motion.div 
                        style={{ opacity: p1Row1Opacity }}
                        className="flex justify-between items-center p-2.5 rounded-xl bg-[#0B0F19] border border-[#222C3E]"
                      >
                        <span className="text-slate-300">Bahan Baku (Espresso 18g + Susu 120ml + Aren 25ml)</span>
                        <span className="text-white font-bold">Rp 7.500</span>
                      </motion.div>
                      <motion.div 
                        style={{ opacity: p1Row2Opacity }}
                        className="flex justify-between items-center p-2.5 rounded-xl bg-[#0B0F19] border border-[#222C3E]"
                      >
                        <span className="text-slate-300">Kemasan (Cup 12oz, Lid, Sedotan Paper, Seal)</span>
                        <span className="text-white font-bold">Rp 2.000</span>
                      </motion.div>
                      <motion.div 
                        style={{ opacity: p1Row3Opacity }}
                        className="flex justify-between items-center p-2.5 rounded-xl bg-[#0B0F19] border border-[#222C3E]"
                      >
                        <span className="text-slate-300">Overhead & Tenaga Kerja per Porsi</span>
                        <span className="text-white font-bold">Rp 2.500</span>
                      </motion.div>
                    </motion.div>

                    {/* Financial Summary Grid (Morphs values into Cashflow & Marketing) */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-[#222C3E]">
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {activeStep < 2 ? 'TOTAL HPP UNIT' : activeStep < 4 ? 'SPEND IKLAN' : 'OMSET POS'}
                        </span>
                        <p className="text-lg sm:text-xl font-bold font-mono text-slate-100 mt-1">
                          {activeStep < 2 ? 'Rp 12.000' : activeStep < 4 ? 'Rp 3.500.000' : 'Rp 64.000'}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-[#222C3E]">
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {activeStep < 2 ? 'HARGA JUAL' : activeStep < 4 ? 'REVENUE IKLAN' : 'TRANSAKSI'}
                        </span>
                        <p className="text-lg sm:text-xl font-bold font-mono text-white mt-1">
                          {activeStep < 2 ? 'Rp 25.000' : activeStep < 4 ? 'Rp 13.300.000' : 'Order #1042'}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-[#1E293B] border border-amber-500/40">
                        <span className="text-[10px] text-amber-300 font-mono block">
                          {activeStep < 2 ? 'ESTIMASI LABA KOTOR' : activeStep < 4 ? 'ROAS ATTRIBUTION' : 'STATUS BAYAR'}
                        </span>
                        <p className="text-lg sm:text-xl font-bold font-mono text-amber-400 mt-1">
                          {activeStep < 2 ? 'Rp 13.000' : activeStep < 4 ? 'Positif Terukur' : 'Lunas QRIS'}
                        </p>
                      </div>
                    </div>

                    {/* Morphing Margin Indicator Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] font-mono text-slate-400">
                        <span>
                          {activeStep < 2 ? 'Rasio Margin Kontribusi' : activeStep < 4 ? 'Efisiensi Iklan vs Target' : 'Sinkronisasi Kasir & Stok'}
                        </span>
                        <span className="text-amber-400 font-bold">
                          {activeStep < 2 ? 'Margin Terlindungi' : activeStep < 4 ? 'Surplus Efisien' : '100% Terverifikasi'}
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[#0B0F19] overflow-hidden border border-[#222C3E]">
                        <motion.div 
                          style={{ width: activeStep < 2 ? p1MarginWidth : activeStep < 4 ? roasBarProgress : posStockDecrement }}
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" 
                        />
                      </div>
                    </div>

                    {/* Cash Flow Emerging Chart Area */}
                    <motion.div 
                      style={{
                        height: cashflowPanelHeight,
                        opacity: cashflowPanelOpacity,
                        overflow: 'hidden',
                      }}
                      className="p-4 rounded-2xl bg-[#0B0F19] border border-[#222C3E] space-y-2"
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                        <span>Radar Saldo Kas vs Ambang Batas Aman</span>
                        <span className="text-emerald-400 font-bold">Buffer Kas: Status Likuiditas Sehat</span>
                      </div>
                      
                      {/* SVG Cash Curve with dynamic pathLength drawing */}
                      <svg className="w-full h-24 text-emerald-400 overflow-visible" viewBox="0 0 400 80">
                        <line x1="0" y1="65" x2="400" y2="65" stroke="#334155" strokeDasharray="4 4" strokeWidth="1" />
                        <text x="330" y="60" fill="#64748b" fontSize="8" fontFamily="monospace">Batas Kritis</text>
                        <motion.path 
                          d="M 0 55 Q 100 48, 200 32 T 400 12" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2.5" 
                          style={{ pathLength: cashChartPath }}
                        />
                        <circle cx="400" cy="12" r="3" fill="#34D399" />
                      </svg>
                    </motion.div>

                    {/* ======================================================= */}
                    {/* CANVAS STAGE 3 & 4: MARKETING & A/B TESTING SPLIT */}
                    {/* ======================================================= */}
                    {activeStep >= 2 && activeStep <= 4 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="pt-2 border-t border-[#222C3E] space-y-3"
                      >
                        <div className="flex justify-between items-center text-xs font-mono text-indigo-300">
                          <span>Eksperimen Penawaran (A/B Test Head-to-Head)</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Hari 14 / 14
                          </span>
                        </div>

                        {/* Side-by-side Variant Comparison */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Variant A */}
                          <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-[#222C3E]">
                            <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                              <span>Varian A: Diskon 15%</span>
                              <span className="text-white font-bold">4.2% CVR</span>
                            </div>
                            <p className="text-xs text-slate-300 font-mono">AOV: Rp 28.000 &bull; ROAS 2.1x</p>
                            <div className="w-full h-1.5 rounded-full bg-[#151D2C] mt-2 overflow-hidden">
                              <div className="w-[42%] h-full bg-slate-500 rounded-full" />
                            </div>
                          </div>

                          {/* Variant B (Winner) */}
                          <div className="p-3.5 rounded-2xl bg-[#1E293B] border border-indigo-500/50 shadow-lg">
                            <div className="flex justify-between text-[11px] font-mono text-indigo-300 mb-1">
                              <span className="font-bold">Varian B: Bundle Pastry</span>
                              <span className="text-indigo-400 font-bold">6.8% CVR</span>
                            </div>
                            <p className="text-xs text-indigo-200 font-mono">AOV: Rp 46.000 &bull; Atribusi Positif</p>
                            <div className="w-full h-1.5 rounded-full bg-[#0B0F19] mt-2 overflow-hidden">
                              <motion.div 
                                style={{ width: variantBBarWidth }}
                                className="h-full bg-indigo-400 rounded-full" 
                              />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* ======================================================= */}
                    {/* CANVAS STAGE 5: KASIR POS & AUTO DEDUCT STOK */}
                    {/* ======================================================= */}
                    {activeStep === 4 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="pt-2 border-t border-[#222C3E] space-y-3"
                      >
                        <div className="flex justify-between items-center text-xs font-mono text-blue-300">
                          <span>Kasir POS &bull; Meja 04 (Dine-in)</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Struk Digital Terkirim
                          </span>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-[#222C3E] flex items-center justify-between">
                          <div className="space-y-0.5 text-xs font-mono">
                            <p className="text-white font-bold">2x Kopi Susu Aren + 1x Croissant Butter</p>
                            <p className="text-slate-400 text-[11px]">Bahan terpotong: Espresso 36g, Susu 240ml, Aren 50ml</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-emerald-400">Total: Rp 64.000</span>
                            <span className="block text-[10px] font-mono text-slate-400">QRIS BCA Berhasil</span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* ======================================================= */}
                    {/* CANVAS STAGE 6: ANALYTICS HEALTH SCORE FINAL SYNTHESIS */}
                    {/* ======================================================= */}
                    {activeStep === 5 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="pt-3 border-t border-[#222C3E] space-y-4"
                      >
                        <div className="p-4 rounded-2xl bg-[#0B0F19] border border-emerald-500/40 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block font-bold">
                              Indeks Sintesis Bisnis Terpadu
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-2xl font-bold text-white font-mono">Kondisi Sehat</span>
                              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 ml-2">
                                Status: Terpantau Prima
                              </span>
                            </div>
                          </div>
                          <div className="text-right text-xs font-mono text-slate-300">
                            <p>Margin: <strong className="text-emerald-400">Terkunci Positif</strong></p>
                            <p>Likuiditas: <strong className="text-amber-400">Proyeksi Aman</strong></p>
                            <p>ROAS: <strong className="text-indigo-400">Di Atas Target</strong></p>
                          </div>
                        </div>

                        {/* Health Score Bar */}
                        <div className="w-full h-2 rounded-full bg-[#0B0F19] overflow-hidden border border-[#222C3E]">
                          <motion.div 
                            style={{ width: healthScoreWidth }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 rounded-full" 
                          />
                        </div>
                      </motion.div>
                    )}

                  </div>

                </div>

                {/* Satellite Floating Badge (Layer 3) */}
                <motion.div 
                  className="absolute -top-4 -right-4 p-3 rounded-xl bg-[#1E293B] border border-[#222C3E] shadow-xl text-xs font-mono text-slate-200 hidden sm:flex items-center gap-2"
                >
                  <span className={`w-2 h-2 rounded-full ${PHASES[activeStep].dotBg} animate-ping`} />
                  <span>{PHASES[activeStep].key === 'finance' ? 'BEP: Target Terhitung' : PHASES[activeStep].key === 'cashflow' ? 'Buffer: Likuiditas Terukur' : PHASES[activeStep].key === 'marketing' ? 'ROAS: Atribusi Terukur' : PHASES[activeStep].key === 'abtesting' ? 'Variant B Signifikan' : PHASES[activeStep].key === 'operations' ? 'Sinkron Gudang Otomatis' : 'Eksekutif: Status Sehat'}</span>
                </motion.div>

              </div>

            </motion.div>

          </div>

          {/* BOTTOM TELEMETRY STATUS BAR */}
          <div className="relative z-30 flex items-center justify-between border-t border-[#222C3E] pt-3 max-w-7xl mx-auto w-full text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <span>Modul Terkoneksi: 6/6 Aktif</span>
              <span className="hidden sm:inline">&bull;</span>
              <span className="hidden sm:inline">Framework: React 19 + Motion v13</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-slate-300 font-medium">Dashboard Real-time Telemetry</span>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
}
