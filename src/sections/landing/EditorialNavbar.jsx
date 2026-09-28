import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { motion, useScroll, useTransform } from 'motion/react';
import { useAuth } from '../../context/AuthContext';

export default function EditorialNavbar() {
  const { isAuthenticated, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  const navBackground = useTransform(
    scrollY,
    [0, 60],
    ['rgba(11, 15, 25, 0)', 'rgba(11, 15, 25, 0.88)']
  );

  const navBorder = useTransform(
    scrollY,
    [0, 60],
    ['rgba(34, 44, 62, 0)', 'rgba(34, 44, 62, 0.85)']
  );

  const navBackdrop = useTransform(
    scrollY,
    [0, 60],
    ['blur(0px)', 'blur(16px)']
  );

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Ekosistem', href: '#ecosystem-section' },
    { label: 'Paket & Investasi', href: '#pricing-experience' },
    { label: 'Halaman Harga', href: '/pricing' },
  ];

  return (
    <motion.header
      style={{
        backgroundColor: navBackground,
        borderBottomColor: navBorder,
        backdropFilter: navBackdrop,
        WebkitBackdropFilter: navBackdrop,
      }}
      className="fixed top-0 inset-x-0 z-50 border-b transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 h-20 flex items-center justify-between">
        {/* Brand */}
        <a href="/" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-lg bg-[#1E293B] border border-[#222C3E] flex items-center justify-center text-[#818CF8] font-bold text-xs group-hover:border-[#818CF8]/50 transition-colors">
            BS
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white tracking-tight text-lg leading-none">
              BisnisSehat
            </span>
            <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 mt-1">
              Live Product Engine
            </span>
          </div>
        </a>

        {/* Center Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          {navLinks.map((link) => (
            link.href.startsWith('/') ? (
              <Link
                key={link.label}
                to={link.href}
                className="hover:text-white transition-colors py-1 relative group"
              >
                {link.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-400 transition-all duration-300 group-hover:w-full" />
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="hover:text-white transition-colors py-1 relative group"
              >
                {link.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-400 transition-all duration-300 group-hover:w-full" />
              </a>
            )
          ))}
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                className="px-4 py-2 text-sm font-medium text-slate-200 hover:text-white transition-colors"
              >
                Buka Dashboard
              </Link>
              <button
                onClick={signOut}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors"
              >
                Keluar
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Masuk
              </Link>
              <Link
                to="/auth"
                className="px-4 py-2 rounded-lg bg-[#818CF8] hover:bg-[#A5B4FC] text-[#0B0F19] text-xs font-semibold tracking-wide transition-colors duration-150 active:scale-95"
              >
                Mulai Gratis
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#222C3E] bg-[#151D2C]/98 backdrop-blur-xl px-6 py-6 space-y-4">
          <nav className="flex flex-col space-y-3 text-base font-medium text-slate-200">
            {navLinks.map((link) => (
              link.href.startsWith('/') ? (
                <Link
                  key={link.label}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-indigo-400 transition-colors"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-indigo-400 transition-colors"
                >
                  {link.label}
                </a>
              )
            ))}
          </nav>
          <div className="pt-4 border-t border-[#222C3E] flex flex-col gap-2">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="w-full text-center py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold"
              >
                Buka Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="w-full text-center py-2.5 rounded-lg border border-[#222C3E] text-slate-200 text-sm font-medium"
                >
                  Masuk
                </Link>
                <Link
                  to="/auth"
                  className="w-full text-center py-2.5 rounded-lg bg-[#818CF8] text-[#0B0F19] text-sm font-semibold"
                >
                  Mulai Gratis
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </motion.header>
  );
}
