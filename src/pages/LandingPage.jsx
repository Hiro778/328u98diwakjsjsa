import Navbar from '../components/Navbar'
import Hero from '../sections/Hero'
import BusinessControl from '../sections/BusinessControl'
import FinancialIntelligence from '../sections/FinancialIntelligence'
import CurrencyIntelligence from '../sections/CurrencyIntelligence'
import BusinessTools from '../sections/BusinessTools'
import Pricing from '../sections/Pricing'
import FinalCTA from '../sections/FinalCTA'
import Footer from '../components/Footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main>
        <Hero />
        <BusinessControl />
        <FinancialIntelligence />
        <CurrencyIntelligence />
        <BusinessTools />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
