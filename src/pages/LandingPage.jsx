import EditorialNavbar from '../sections/landing/EditorialNavbar';
import EditorialHero from '../sections/landing/EditorialHero';
import ProductEcosystem from '../sections/landing/ProductEcosystem';
import PricingExperience from '../sections/landing/PricingExperience';
import EditorialCTA from '../sections/landing/EditorialCTA';
import Footer from '../components/Footer';

export default function LandingPage() {
  return (
    <div data-theme="dark" className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] selection:bg-indigo-500/30 selection:text-white">
      {/* 1. Dynamic Top Navigation Bar (Dark Dashboard Shell) */}
      <EditorialNavbar />

      <main>
        {/* 1. Motion-First Hero (Live telemetry command center) */}
        <EditorialHero />

        {/* 2. Product Ecosystem (4 interconnected pillars with semantic category accents) */}
        <ProductEcosystem />

        {/* 3. Centerpiece: The Continuous Pricing Experience (Spatial 3-Card Value Architecture) */}
        <PricingExperience />

        {/* 4. Final High-Converting Product CTA */}
        <EditorialCTA />
      </main>

      {/* 8. Dashboard-Consistent Footer */}
      <Footer />
    </div>
  );
}
