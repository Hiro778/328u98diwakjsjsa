import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLAN_CONFIG, PLANS } from '../data/categories.js';

describe('Landing Page & Pricing Experience Integrity Tests', () => {
  const landingPath = path.resolve('src/pages/LandingPage.jsx');
  const pricingExpPath = path.resolve('src/sections/landing/PricingExperience.jsx');
  const productEcoPath = path.resolve('src/sections/landing/ProductEcosystem.jsx');
  const editorialCtaPath = path.resolve('src/sections/landing/EditorialCTA.jsx');
  const editorialHeroPath = path.resolve('src/sections/landing/EditorialHero.jsx');

  test('Section 1: LandingPage.jsx imports and mounts the continuous flow', () => {
    const content = fs.readFileSync(landingPath, 'utf8');

    // Verify exact sequence
    assert.ok(content.includes("import EditorialNavbar from '../sections/landing/EditorialNavbar'"));
    assert.ok(content.includes("import EditorialHero from '../sections/landing/EditorialHero'"));
    assert.ok(content.includes("import ProductEcosystem from '../sections/landing/ProductEcosystem'"));
    assert.ok(content.includes("import PricingExperience from '../sections/landing/PricingExperience'"));
    assert.ok(content.includes("import EditorialCTA from '../sections/landing/EditorialCTA'"));
    assert.ok(content.includes("import Footer from '../components/Footer'"));

    // Verify problematic pinned / dead zone components are REMOVED from LandingPage
    assert.ok(!content.includes('PinnedProductExperience'), 'PinnedProductExperience must be removed from LandingPage');
    assert.ok(!content.includes('SystemConvergence'), 'SystemConvergence must be removed from LandingPage');

    // Verify component order in JSX
    const heroIndex = content.indexOf('<EditorialHero');
    const ecoIndex = content.indexOf('<ProductEcosystem');
    const priceIndex = content.indexOf('<PricingExperience');
    const ctaIndex = content.indexOf('<EditorialCTA');
    const footerIndex = content.indexOf('<Footer');

    assert.ok(heroIndex < ecoIndex, 'Hero precedes Ecosystem');
    assert.ok(ecoIndex < priceIndex, 'Ecosystem precedes PricingExperience');
    assert.ok(priceIndex < ctaIndex, 'PricingExperience precedes CTA');
    assert.ok(ctaIndex < footerIndex, 'CTA precedes Footer');
  });

  test('Section 2: PricingExperience strictly enforces 2 plans and BisnisSehat source of truth', () => {
    const content = fs.readFileSync(pricingExpPath, 'utf8');

    // Must import from categories source of truth
    assert.ok(content.includes('PLAN_CONFIG') && content.includes('PLANS'));
    assert.equal(PLAN_CONFIG[PLANS.PRO].price, 130000, 'Pro price must be 130000');

    // Strictly 2 plans: Basic (Rp 35.000) and Pro (Rp 130.000)
    assert.equal(PLAN_CONFIG[PLANS.BASIC].price, 35000, 'Basic price must be 35000');
    assert.ok(content.includes("name: 'BisnisSehat Basic'"), 'Must include BisnisSehat Basic plan');
    assert.ok(content.includes("name: 'BisnisSehat Pro'"), 'Must include BisnisSehat Pro plan');
    assert.ok(content.includes('Rp 35.000'), 'Must display Rp 35.000 price label');
    assert.ok(content.includes('Rp 130.000'), 'Must display Rp 130.000 price label');

    // Free plan must NOT be offered as a new pricing tier
    assert.ok(!content.includes("name: 'BisnisSehat Gratis'"), 'Free must not be offered as a pricing tier');
    assert.ok(!content.includes("price: 'Rp 0'"), 'Free Rp 0 must not be offered as a pricing tier');

    // Strictly NO 3rd plan (Multi-Outlet, Enterprise, Consultation)
    assert.ok(!content.includes('Multi-Outlet'), 'Must not contain Multi-Outlet plan');
    assert.ok(!content.includes('Enterprise'), 'Must not contain Enterprise plan');
    assert.ok(!content.includes('Konsultasi Cabang'), 'Must not contain Consultation plan');
    assert.ok(!content.includes('SLA 99.9%'), 'Must not contain fabricated SLA claim');
    assert.ok(!content.includes('Starter'), 'Must not use generic Starter demo label');
    assert.ok(!content.includes('Professional'), 'Must not use generic Professional demo label');

    // Monthly billing strictly followed (No fake annual toggle, no fake discount, no confetti)
    assert.ok(content.includes('/ bulan'));
    assert.ok(!content.includes('confetti'), 'No confetti allowed');

    // Compact section height (h-[140vh])
    assert.ok(content.includes('h-[140vh]'), 'Section height must be compact h-[140vh]');
  });

  test('Section 3: No fabricated business claims across landing components (deisgn.md Section 8, 9 & 14)', () => {
    const landingFiles = [pricingExpPath, productEcoPath, editorialCtaPath, editorialHeroPath];
    const forbiddenClaims = [
      '58 Hari',
      '58 days',
      '88/100',
      '88 / 100',
      '52.4%',
      'Rp 84.5Jt',
      'Rp84.5Jt',
      'ROAS 3.8x',
      'ROAS 3.80x',
      'runway kas 60 hari',
      'Paling Dipilih',
      'Rekomendasi Utama',
    ];

    for (const file of landingFiles) {
      const text = fs.readFileSync(file, 'utf8');
      for (const claim of forbiddenClaims) {
        assert.ok(
          !text.includes(claim),
          `File ${path.basename(file)} must not contain forbidden claim: "${claim}"`
        );
      }
    }
  });

  test('Section 4: Spatial 2-card composition, continuous motion and accessibility', () => {
    const content = fs.readFileSync(pricingExpPath, 'utf8');

    // Motion hooks
    assert.ok(content.includes('useScroll'));
    assert.ok(content.includes('useTransform'));
    assert.ok(content.includes('useSpring'));
    assert.ok(content.includes('useReducedMotion'));

    // Dark theme tokens
    assert.ok(content.includes('#0B0F19'), 'Dark background token present');
    assert.ok(content.includes('#151D2C'), 'Surface token present');
    assert.ok(content.includes('#1E293B'), 'Elevated surface token present');
    assert.ok(content.includes('#222C3E'), 'Border token present');
    assert.ok(content.includes('#818CF8'), 'Primary accent token present');

    // No timers, no auto-scrolling
    assert.ok(!content.includes('setInterval'));
    assert.ok(!content.includes('setTimeout'));
    assert.ok(!content.includes('window.scrollTo'));
  });

  test('Section 5: Handoff bridges exist and connect sections seamlessly', () => {
    const ecoContent = fs.readFileSync(productEcoPath, 'utf8');
    const priceContent = fs.readFileSync(pricingExpPath, 'utf8');

    // Ecosystem bridges to pricing
    assert.ok(ecoContent.includes('Pilihan Akses dan Investasi Usaha'));

    // Pricing bridges to CTA
    assert.ok(priceContent.includes('href="#final-cta"'));
  });

  test('Section 6: Entitlement accuracy and tier capability integrity per gas.md', () => {
    const content = fs.readFileSync(pricingExpPath, 'utf8');

    // 1. Tepat 2 plan: basic & pro
    assert.ok(content.includes("id: 'basic'"));
    assert.ok(content.includes("id: 'pro'"));

    // 2. Basic = Rp 35.000
    assert.ok(content.includes('Rp 35.000'));
    assert.equal(PLAN_CONFIG[PLANS.BASIC].price, 35000);

    // 3. Pro = Rp 130.000
    assert.ok(content.includes('Rp 130.000'));
    assert.equal(PLAN_CONFIG[PLANS.PRO].price, 130000);

    // 4. Standalone calculators ada di Basic
    assert.ok(content.includes('HPP & Margin Calculator') || content.includes('HPP Calculator'));
    assert.ok(content.includes('Break-even Point (BEP) Calculator') || content.includes('Break-even Point Calculator'));

    // 5. POS, CRM, Laporan Keuangan, AI Creative Studio = Pro
    assert.ok(content.includes('Point of Sales (POS)'));
    assert.ok(content.includes('Customer CRM & WhatsApp Integration'));
    assert.ok(content.includes('AI Creative Studio'));

    // 6. Tidak ada fabricated feature list / tidak ada coret fitur (line-through)
    assert.ok(!content.includes('line-through'), 'Cards must not show crossed out / strikethrough features');

    // 7. Tidak ada hardcoded tool-count claim
    const forbiddenToolCounts = ['39+', '40+', '45+', '48 tools', '39 tools', '40 tools', '45 tools'];
    for (const count of forbiddenToolCounts) {
      assert.ok(!content.includes(count), `PricingExperience must not contain hardcoded count: "${count}"`);
    }

    // 8. Tidak ada plan ketiga
    assert.ok(!content.includes('Enterprise'));
    assert.ok(!content.includes('Multi-Outlet'));
    assert.ok(!content.includes('Konsultasi Cabang'));

    // 9. Pricing handoff tetap berjalan
    assert.ok(content.includes('href="#final-cta"'));
  });
});
