import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { textRevealVariants } from '../../lib/motionTokens';

export default function ProblemStatement() {
  const sectionRef = useRef(null);
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Controlled continuous lift
  const contentY = useTransform(scrollYProgress, [0, 1], shouldReduce ? [0, 0] : [30, -30]);

  const painPoints = [
    {
      num: '01',
      title: 'HPP Ilusi',
      desc: 'Harga jual ditentukan dari tebakan atau meniru kompetitor. Terlihat laku keras, namun setelah dihitung ulang justru merugi karena biaya bahan & tenaga kerja mikro tidak tercatat.',
      accent: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
      icon: (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
    },
    {
      num: '02',
      title: 'Kas Rekening Menipu',
      desc: 'Ada saldo di rekening bank, tetapi itu adalah uang titipan supplier, pajak, atau modal restock. Ketika jatuh tempo 30 hari ke depan, pemilik bisnis panik mencari talangan.',
      accent: 'border-rose-500/40 text-rose-400 bg-rose-500/10',
      icon: (
        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
        </svg>
      ),
    },
    {
      num: '03',
      title: 'Pemasaran Tanpa Atribusi',
      desc: 'Budget promosi dibelanjakan setiap pekan, tetapi tidak ada kalkulasi apakah ROAS menutup ongkos produksi dan menghasilkan margin kontribusi positif yang riil.',
      accent: 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10',
      icon: (
        <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
        </svg>
      ),
    },
  ];

  return (
    <section
      id="problem-section"
      ref={sectionRef}
      className="relative py-24 px-6 lg:px-12 bg-[#0B0F19] text-[#F8FAFC] overflow-hidden border-b border-[#222C3E]"
    >
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          style={{ y: contentY }}
          className="space-y-16"
        >
          {/* Header */}
          <div className="max-w-3xl">
            <span className="text-xs font-mono uppercase tracking-[0.25em] text-indigo-400 font-bold block mb-3">
              Akar Masalah Kegagalan UMKM
            </span>
            <motion.h2
              variants={textRevealVariants}
              initial={shouldReduce ? false : "hidden"}
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight"
            >
              Bisnis tidak gulung tikar karena sepi pembeli. <br />
              <span className="text-slate-400 font-light">
                Mereka runtuh karena kebutaan data internal.
              </span>
            </motion.h2>
          </div>

          {/* 3 Asymmetric Diagnostic Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {painPoints.map((item, idx) => (
              <motion.div
                key={item.num}
                initial={shouldReduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="group relative p-8 rounded-3xl bg-[#151D2C] border border-[#222C3E] hover:border-indigo-500/40 transition-all duration-300 flex flex-col justify-between shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-mono text-slate-400 tracking-wider">
                      RISIKO {item.num}
                    </span>
                    <div className={`p-2.5 rounded-xl border ${item.accent}`}>
                      {item.icon}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-[#222C3E] flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Dampak: Margin Bocor</span>
                  <span className="text-indigo-400 group-hover:translate-x-1 transition-transform">
                    Solusi Otomatis &rarr;
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
