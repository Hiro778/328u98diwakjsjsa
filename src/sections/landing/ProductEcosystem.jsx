import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { textRevealVariants } from '../../lib/motionTokens';

const categories = [
  {
    num: '01',
    id: 'money',
    name: 'MONEY',
    title: 'Keuangan & Profitabilitas',
    accent: '#F5A623',
    accentText: 'text-amber-400',
    accentBorder: 'border-amber-500/40',
    accentBg: 'bg-amber-500/10',
    desc: 'Membedah batas modal, margin kotor, titik impas, dan likuiditas kas operasional usaha.',
    tools: [
      { name: 'Kalkulator HPP', desc: 'Perhitungan bahan baku & tenaga kerja per unit' },
      { name: 'Arus Kas (Cash Flow)', desc: 'Peramalan saldo kas & proyeksi likuiditas terukur' },
      { name: 'Break-even Point (BEP)', desc: 'Target volume penjualan untuk balik modal' },
      { name: 'Financial Health Score', desc: 'Audit rasio kesehatan finansial usaha' },
    ],
  },
  {
    num: '02',
    id: 'growth',
    name: 'GROWTH',
    title: 'Pemasaran & Akuisisi Pelanggan',
    accent: '#818CF8',
    accentText: 'text-indigo-400',
    accentBorder: 'border-indigo-500/40',
    accentBg: 'bg-indigo-500/10',
    desc: 'Memastikan setiap rupiah promosi menghasilkan margin kontribusi positif yang riil.',
    tools: [
      { name: 'Pelacak ROAS Iklan', desc: 'Atribusi konversi iklan Meta & Google ke penjualan' },
      { name: 'A/B Testing Penawaran', desc: 'Uji varian diskon vs bundling dengan CTR & CVR' },
      { name: 'SEO Optimizer Lokal', desc: 'Kuasai pencarian Google Maps & niat beli lokal' },
      { name: 'Creative Studio', desc: 'Generator materi konten promosi produk' },
    ],
  },
  {
    num: '03',
    id: 'operations',
    name: 'OPERATIONS',
    title: 'Kasir POS & Manajemen Gudang',
    accent: '#3B82F6',
    accentText: 'text-blue-400',
    accentBorder: 'border-blue-500/40',
    accentBg: 'bg-blue-500/10',
    desc: 'Mempercepat transaksi meja, mengunci stok gudang otomatis, dan mengirim struk via WhatsApp.',
    tools: [
      { name: 'Kasir POS Cepat', desc: 'Antarmuka kasir responsif untuk meja & dine-in' },
      { name: 'QR Menu Meja', desc: 'Pesan mandiri tanpa perlu panggil pelayan' },
      { name: 'Inventaris & Stok', desc: 'Pemotongan bahan baku otomatis real-time' },
      { name: 'WhatsApp Operasional', desc: 'Struk otomatis & notifikasi pesanan ke pelanggan' },
    ],
  },
  {
    num: '04',
    id: 'intelligence',
    name: 'INTELLIGENCE',
    title: 'Diagnosis & Arahan Eksekutif',
    accent: '#10B981',
    accentText: 'text-emerald-400',
    accentBorder: 'border-emerald-500/40',
    accentBg: 'bg-emerald-500/10',
    desc: 'Menghubungkan ketiga pilar data menjadi satu arahan tindakan konkret setiap hari.',
    tools: [
      { name: 'Analytics Terpusat', desc: 'Dashboard ringkasan metrik lintas departemen' },
      { name: 'Laporan Keuangan', desc: 'Laba rugi, neraca sederhana, dan arus kas' },
      { name: 'Business Overview', desc: 'Diagnosis kesehatan bisnis dengan rekomendasi aksi' },
    ],
  },
];

export default function ProductEcosystem() {
  const [activeCategory, setActiveCategory] = useState('money');
  const sectionRef = useRef(null);
  const shouldReduce = useReducedMotion();

  // Scroll tracking to trigger the seamless inward collapse into the pinned canvas
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Smooth inward collapse during the handoff phase (0.60 -> 0.95)
  const cardsScale = useTransform(
    scrollYProgress,
    [0.4, 0.85, 1.0],
    shouldReduce ? [1, 1, 1] : [1, 0.98, 0.95]
  );

  const card1X = useTransform(scrollYProgress, [0.5, 0.9], shouldReduce ? ['0px', '0px'] : ['0px', '16px']);
  const card2X = useTransform(scrollYProgress, [0.5, 0.9], shouldReduce ? ['0px', '0px'] : ['0px', '6px']);
  const card3X = useTransform(scrollYProgress, [0.5, 0.9], shouldReduce ? ['0px', '0px'] : ['0px', '-6px']);
  const card4X = useTransform(scrollYProgress, [0.5, 0.9], shouldReduce ? ['0px', '0px'] : ['0px', '-16px']);

  const handoffOpacity = useTransform(scrollYProgress, [0.6, 0.85], [0.3, 1]);

  return (
    <section 
      id="ecosystem-section" 
      ref={sectionRef}
      className="relative pt-20 sm:pt-24 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-12 bg-[#0B0F19] text-[#F8FAFC] border-b border-[#222C3E] overflow-hidden"
    >
      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Header */}
        <div className="mb-12 sm:mb-14">
          <span className="text-xs font-mono uppercase tracking-[0.25em] text-indigo-400 font-bold block mb-3">
            Cakupan Lengkap &bull; Product Ecosystem
          </span>
          <motion.h2
            variants={textRevealVariants}
            initial={shouldReduce ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight"
          >
            Satu ekosistem utuh. <br />
            <span className="text-slate-400 font-light">Bukan alat terpisah yang membingungkan.</span>
          </motion.h2>
        </div>

        {/* 4 Interactive Category Pillars with Convergence Physics */}
        <motion.div 
          style={{ scale: cardsScale }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {categories.map((cat, idx) => {
            const isActive = activeCategory === cat.id;
            const xShift = idx === 0 ? card1X : idx === 1 ? card2X : idx === 2 ? card3X : card4X;

            return (
              <motion.div
                key={cat.id}
                onMouseEnter={() => setActiveCategory(cat.id)}
                onClick={() => setActiveCategory(cat.id)}
                className={`p-6 rounded-xl cursor-pointer transition-all duration-200 flex flex-col justify-between border ${
                  isActive
                    ? 'bg-[#1E293B] text-white shadow-lg'
                    : 'bg-[#151D2C] text-slate-200 border-[#222C3E] hover:border-slate-600'
                }`}
                style={{
                  x: xShift,
                  borderColor: isActive ? cat.accent : undefined,
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono font-bold tracking-widest text-slate-400">
                      {cat.num} / {cat.name}
                    </span>
                    <span 
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.accent }}
                    />
                  </div>

                  <h3 className="text-lg font-bold mb-2 text-white">
                    {cat.title}
                  </h3>

                  <p className="text-xs text-slate-300 leading-relaxed mb-6 font-normal">
                    {cat.desc}
                  </p>
                </div>

                <div className="space-y-2 border-t border-[#222C3E] pt-4">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-2 font-semibold">
                    Fitur & Tools:
                  </span>
                  {cat.tools.map((t) => (
                    <div key={t.name} className="flex flex-col text-xs font-mono">
                      <span className="text-white font-medium">{t.name}</span>
                      <span className="text-[11px] text-slate-400 font-sans">{t.desc}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Seamless Handoff Bridge to Pricing Experience (Zero Dead Zone) */}
        <motion.div 
          style={{ opacity: handoffOpacity }}
          className="mt-8 sm:mt-10 flex items-center justify-center gap-2 text-xs font-mono text-indigo-400 font-semibold"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#818CF8]" />
          <span>Menghubungkan Nilai Ekosistem ke Pilihan Akses dan Investasi Usaha &darr;</span>
        </motion.div>

      </div>
    </section>
  );
}
