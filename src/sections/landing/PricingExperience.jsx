import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';
import { PLAN_CONFIG, PLANS } from '../../data/categories';

// Strictly 2 plans from BisnisSehat source of truth
const BASIC_PRICE_NUM = PLAN_CONFIG[PLANS.BASIC]?.price || 35000;
const BASIC_PRICE_LABEL = 'Rp 35.000';
const PRO_PRICE_NUM = PLAN_CONFIG[PLANS.PRO].price; // 130000
const PRO_PRICE_LABEL = 'Rp 130.000';

const PLANS_DATA = [
  {
    id: 'basic',
    name: 'BisnisSehat Basic',
    badge: 'Kalkulator Mandiri',
    price: BASIC_PRICE_LABEL,
    period: '/ bulan',
    desc: 'Seluruh kalkulator operasional & keuangan standalone.',
    isPro: false,
    bg: 'bg-[#151D2C]',
    border: 'border-[#222C3E]',
    ctaText: 'Pilih Basic',
    ctaLink: '/pricing?plan=basic',
    ctaVariant: 'secondary',
    features: [
      { text: 'HPP & Margin Calculator', highlight: true },
      { text: 'Break-even Point (BEP) Calculator', highlight: true },
      { text: 'Simulasi Pinjaman & Angsuran', highlight: true },
      { text: 'Kalkulator Gaji Karyawan', highlight: true },
      { text: 'Generator Iklan & Copywriting' },
      { text: 'Kurs & Bea Cukai Calculator' },
      { text: 'Analisis Valuta & Ekspor Standalone' },
    ],
  },
  {
    id: 'pro',
    name: 'BisnisSehat Pro',
    badge: 'Akses Lengkap & AI',
    price: PRO_PRICE_LABEL,
    period: '/ bulan',
    desc: 'Semua tools Basic plus database bisnis, POS kasir, CRM, dan AI Studio.',
    isPro: true,
    accent: '#818CF8',
    bg: 'bg-[#1E293B]',
    border: 'border-indigo-500/70',
    ctaText: 'Aktivasi Pro Sekarang',
    ctaLink: '/pricing?plan=pro',
    ctaVariant: 'primary',
    features: [
      { text: 'Termasuk Seluruh Tools Basic', highlight: true },
      { text: 'Point of Sales (POS) Kasir & QR Menu', highlight: true },
      { text: 'Database Bisnis & Inventori Otomatis' },
      { text: 'Customer CRM & WhatsApp Integration', highlight: true },
      { text: 'Laporan Laba Rugi, Neraca & Arus Kas' },
      { text: 'AI Creative Studio & 200 Kredit AI / Bulan', highlight: true },
      { text: 'Verifikasi Legalitas Usaha Resmi' },
    ],
  },
];

export default function PricingExperience() {
  const containerRef = useRef(null);
  const shouldReduce = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Compact 140vh scroll track: Every manual scroll step triggers active visual change
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    mass: 0.2,
    skipInitialAnimation: true,
  });

  // -------------------------------------------------------------------------
  // CONTINUOUS 2-CARD SPATIAL TRANSFORMS
  // -------------------------------------------------------------------------

  // Phase 1: Header entrance from Ecosystem convergence (0.00 -> 0.25)
  const headerY = useTransform(smoothProgress, [0.0, 0.22], shouldReduce ? [0, 0] : [24, 0]);
  const headerOpacity = useTransform(smoothProgress, [0.0, 0.18], [0.5, 1]);

  // Phase 1 -> 2: 2-Card Spatial Assembly (Free shifts from left, Pro from right into balance)
  const freeCardX = useTransform(smoothProgress, [0.0, 0.28], shouldReduce ? ['0px', '0px'] : ['-28px', '0px']);
  const proCardX = useTransform(smoothProgress, [0.0, 0.28], shouldReduce ? ['0px', '0px'] : ['28px', '0px']);

  // Pro Card visual elevation & anchor scale
  const proCardScale = useTransform(smoothProgress, [0.0, 0.32, 0.70, 1.0], shouldReduce ? [1, 1, 1, 1] : [0.97, 1.02, 1.02, 0.98]);
  const freeCardScale = useTransform(smoothProgress, [0.0, 0.32, 0.70, 1.0], shouldReduce ? [1, 1, 1, 1] : [0.95, 0.98, 0.98, 0.96]);

  // Phase 2: Feature rows and pricing detail illumination (0.18 -> 0.50)
  const featuresOpacity = useTransform(smoothProgress, [0.15, 0.40], [0.6, 1]);

  // Phase 3: Seamless handoff to CTA (0.70 -> 1.00)
  const ctaHandoffOpacity = useTransform(smoothProgress, [0.65, 0.92], [0.4, 1]);
  const ctaHandoffY = useTransform(smoothProgress, [0.70, 0.96], shouldReduce ? [0, 0] : [12, 0]);

  return (
    <div 
      id="pricing-experience" 
      ref={containerRef} 
      className="relative md:h-[140vh] bg-[#0B0F19] text-[#F8FAFC]"
    >
      {/* Sticky Fullscreen Canvas on Desktop / Natural Scrolling on Mobile */}
      <div className="relative md:sticky md:top-0 min-h-screen md:h-screen w-full flex flex-col justify-between py-12 md:py-0 md:pt-16 sm:md:pt-20 md:pb-6 sm:md:pb-8 px-4 sm:px-6 lg:px-12 overflow-visible md:overflow-hidden">
        
        {/* Subtle Ambient Mesh */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-indigo-600/10 rounded-full blur-[120px]" />
        </div>

        {/* SECTION HEADER: Reversible Scroll Fade */}
        <motion.div 
          style={{ y: isMobile ? 0 : headerY, opacity: isMobile ? 1 : headerOpacity }}
          className="relative z-20 max-w-3xl mx-auto text-center space-y-2 shrink-0 mb-6 md:mb-0"
        >
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-md bg-[#151D2C] border border-[#222C3E] text-[11px] font-mono font-medium text-[#818CF8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8]" />
            <span>PILIHAN AKSES &bull; TRANSPARAN TANPA BIAYA TERSEMBUNYI</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
            Pilih Akses Sesuai <span className="text-[#818CF8]">Tahap Bisnis Anda</span>
          </h2>

          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto font-normal">
            Pilih paket Basic untuk kalkulator standalone atau tingkatkan ke Pro untuk seluruh kapabilitas operasional, database bisnis, dan AI.
          </p>
        </motion.div>

        {/* 2 SPATIAL PRICING CARDS: FREE (Secondary) vs PRO (Primary Anchor) */}
        <div className="relative z-20 max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6 items-center my-auto py-2">
          
          {/* 1. FREE PLAN (md:col-span-5) */}
          <motion.div
            style={{ x: isMobile ? 0 : freeCardX, scale: isMobile ? 1 : freeCardScale }}
            className="md:col-span-5 relative flex flex-col justify-between p-6 rounded-xl border border-[#222C3E] bg-[#151D2C] shadow-lg hover:border-slate-600 transition-colors"
          >
            <div>
              {/* Card Badge & Title */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
                  {PLANS_DATA[0].name}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#0B0F19] border border-[#222C3E] text-[10px] font-mono text-slate-400">
                  {PLANS_DATA[0].badge}
                </span>
              </div>

              {/* Price */}
              <div className="my-2.5 pb-2.5 border-b border-[#222C3E]">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-200">
                    {PLANS_DATA[0].price}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{PLANS_DATA[0].period}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  {PLANS_DATA[0].desc}
                </p>
              </div>

              {/* Features List */}
              <motion.ul style={{ opacity: featuresOpacity }} className="space-y-2 my-3">
                {PLANS_DATA[0].features.map((feat, idx) => (
                  <li 
                    key={idx} 
                    className="flex items-start gap-2 text-xs text-slate-300"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className={`leading-tight ${feat.highlight ? 'text-white font-semibold' : 'text-slate-200'}`}>
                      {feat.text}
                    </span>
                  </li>
                ))}
              </motion.ul>
            </div>

            {/* CTA Button */}
            <div className="pt-3 border-t border-[#222C3E] mt-2">
              <Link
                to={PLANS_DATA[0].ctaLink}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-98 text-center bg-[#0B0F19] hover:bg-[#1E293B] text-slate-200 border border-[#222C3E] hover:border-slate-600"
              >
                <span>{PLANS_DATA[0].ctaText}</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <p className="text-[10px] text-center text-slate-400 mt-1.5 font-mono">
                Tanpa kartu kredit &bull; Akses langsung
              </p>
            </div>
          </motion.div>

          {/* 2. PRO PLAN (md:col-span-7) — Primary Visual Anchor */}
          <motion.div
            style={{ x: isMobile ? 0 : proCardX, scale: isMobile ? 1 : proCardScale }}
            className="md:col-span-7 relative flex flex-col justify-between p-6 sm:p-7 rounded-xl border border-[#818CF8]/60 bg-[#1E293B] shadow-xl"
          >
            {/* Pro Anchor Badge */}
            <div className="absolute -top-3 left-6 sm:left-8 px-2.5 py-0.5 rounded-md bg-[#818CF8] text-[#0B0F19] text-[10px] font-mono font-bold">
              {PLANS_DATA[1].badge}
            </div>

            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 mb-2 mt-1">
                <span className="text-sm font-mono font-bold tracking-wider text-white uppercase">
                  {PLANS_DATA[1].name}
                </span>
                <span className="text-[11px] font-mono text-[#818CF8] font-semibold">
                  Semua Fitur Terbuka
                </span>
              </div>

              {/* Price */}
              <div className="my-2.5 pb-2.5 border-b border-[#222C3E]">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white">
                    {PLANS_DATA[1].price}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{PLANS_DATA[1].period}</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                  {PLANS_DATA[1].desc}
                </p>
              </div>

              {/* Features List */}
              <motion.ul style={{ opacity: featuresOpacity }} className="space-y-2 my-3">
                {PLANS_DATA[1].features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs">
                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#818CF8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className={`leading-tight ${feat.highlight ? 'text-white font-semibold' : 'text-slate-200'}`}>
                      {feat.text}
                    </span>
                  </li>
                ))}
              </motion.ul>
            </div>

            {/* CTA Button */}
            <div className="pt-3 border-t border-[#222C3E] mt-2">
              <Link
                to={PLANS_DATA[1].ctaLink}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-98 text-center bg-[#818CF8] hover:bg-[#A5B4FC] text-[#0B0F19] border border-transparent"
              >
                <span>{PLANS_DATA[1].ctaText}</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <p className="text-[10px] text-center text-slate-400 mt-1.5 font-mono">
                Bayar bulanan &bull; Non-recurring &bull; QRIS / Transfer Bank / GoPay
              </p>
            </div>
          </motion.div>

        </div>

        {/* CONTINUOUS HANDOFF BRIDGE TO FINAL CTA */}
        <motion.div 
          style={{ opacity: ctaHandoffOpacity, y: ctaHandoffY }}
          className="relative z-20 flex flex-col sm:flex-row items-center justify-between border-t border-[#222C3E] pt-2.5 max-w-4xl mx-auto w-full text-[11px] font-mono text-slate-400 shrink-0 gap-2"
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Aman Terenkripsi &bull; Data Bisnis Anda 100% Milik Anda</span>
          </div>

          <div className="flex items-center gap-3">
            <span>Siap memulai?</span>
            <a 
              href="#final-cta" 
              className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-4"
            >
              Lanjut ke Pendaftaran &rarr;
            </a>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
