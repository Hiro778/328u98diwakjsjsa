import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAdsEconomics,
  UNAVAILABLE_LABEL,
  formatCurrencyIdr,
  formatPercent,
  formatRatio,
} from '../lib/adsCalculatorEngine.js';

describe('Ads Calculator Engine - gg.md Specification Tests', () => {
  // =========================================================================
  // TEST 1: Price 100k, HPP 40k, Fee 10k
  // Expected: Contribution = 50k, Break-even CPA = 50k, Break-even ROAS = 2x
  // =========================================================================
  it('TEST 1: Price 100k, HPP 40k, Fee 10k -> Contribution 50k, BEP CPA 50k, BEP ROAS 2x', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.stage1.contribution, 50000);
    assert.equal(res.stage1.breakEvenCpa, 50000);
    assert.equal(res.stage1.breakEvenRoas, 2.0);
  });

  // =========================================================================
  // TEST 2: Target margin 20%
  // Expected: Target profit = 20k, Target CPA = 30k, Target ROAS ≈ 3.33x
  // =========================================================================
  it('TEST 2: Target margin 20% -> Target profit 20k, Target CPA 30k, Target ROAS ≈ 3.33x', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      targetMargin: 20, // 20%
    });

    assert.equal(res.isValid, true);
    assert.equal(res.stage1.targetProfit, 20000);
    assert.equal(res.stage1.targetCpa, 30000);
    assert.ok(Math.abs(res.stage1.targetRoas - (100000 / 30000)) < 0.0001);
    assert.equal(formatRatio(res.stage1.targetRoas), '3,33x');
  });

  // =========================================================================
  // TEST 3: Spend 600k, Clicks 714, Conversions 20, Revenue 1.5m
  // Expected: CPC ≈ 840.34, CVR ≈ 2.80%, CPA = 30k, ROAS = 2.5x
  // =========================================================================
  it('TEST 3: Actual spend 600k, Clicks 714, Conversions 20, Revenue 1.5jt', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      actualAdSpend: 600000,
      clicks: 714,
      conversions: 20,
      revenue: 1500000,
    });

    assert.equal(res.isValid, true);
    assert.ok(Math.abs(res.stage2.actualCpc - (600000 / 714)) < 0.0001);
    assert.equal(res.stage2.actualCpc.toFixed(2), '840.34');
    assert.ok(Math.abs(res.stage2.actualCvr - (20 / 714)) < 0.0001);
    assert.equal(formatPercent(res.stage2.actualCvr), '2,80%');
    assert.equal(res.stage2.actualCpa, 30000);
    assert.equal(res.stage2.actualRoas, 2.5);
    assert.equal(formatRatio(res.stage2.actualRoas), '2,50x');
    assert.equal(res.stage2.estimatedProfitAfterAds, 400000); // (50k * 20) - 600k
  });

  // =========================================================================
  // TEST 4: Budget 1jt but Actual Spend 600k
  // Ensure Actual CPA and Actual ROAS use 600k, NOT 1jt
  // =========================================================================
  it('TEST 4: Budget 1jt vs Actual Spend 600k -> Uses actual spend strictly', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      budget: 1000000,
      actualAdSpend: 600000,
      clicks: 714,
      conversions: 20,
      revenue: 1500000,
    });

    // CPA = 600k / 20 = 30k (NOT 1jt / 20 = 50k)
    assert.equal(res.stage2.actualCpa, 30000);
    // ROAS = 1.5jt / 600k = 2.5x (NOT 1.5jt / 1jt = 1.5x)
    assert.equal(res.stage2.actualRoas, 2.5);
  });

  // =========================================================================
  // TEST 5: Clicks = 0
  // Maximum CPC/CPC must be unavailable, not 0 and not crash
  // =========================================================================
  it('TEST 5: Clicks = 0 -> Maximum CPC and CPC unavailable, no division by zero', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      actualAdSpend: 600000,
      clicks: 0,
      conversions: 0,
    });

    assert.equal(res.stage2.actualCpc, null);
    assert.equal(res.stage2.actualCvr, null);
    assert.equal(res.stage2.maxCpcBreakEven, null);
    assert.equal(formatCurrencyIdr(res.stage2.maxCpcBreakEven), UNAVAILABLE_LABEL);
  });

  // =========================================================================
  // TEST 6: Actual CPA > Break-even CPA
  // Expected: status = "Di atas Break-even"
  // =========================================================================
  it('TEST 6: Actual CPA > Break-even CPA -> status = "Di atas Break-even"', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000, // Break-even CPA = 50k
      actualAdSpend: 120000,
      conversions: 2, // Actual CPA = 60k (> 50k)
    });

    assert.equal(res.status.cpaStatus, 'Di atas Break-even');
  });

  // =========================================================================
  // TEST 7: Target CPA < Actual CPA <= Break-even CPA
  // Expected: status = "Di atas Target, masih di bawah Break-even"
  // =========================================================================
  it('TEST 7: Target CPA < Actual CPA <= Break-even CPA -> status = "Di atas Target, masih di bawah Break-even"', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      targetMargin: 20, // Contribution 50k, Target CPA = 30k, BEP = 50k
      actualAdSpend: 80000,
      conversions: 2, // Actual CPA = 40k (30k < 40k <= 50k)
    });

    assert.equal(res.status.cpaStatus, 'Di atas Target, masih di bawah Break-even');
  });

  // =========================================================================
  // TEST 8: Actual ROAS < Break-even ROAS
  // Expected: status = "Di bawah Break-even ROAS"
  // =========================================================================
  it('TEST 8: Actual ROAS < Break-even ROAS -> status = "Di bawah Break-even ROAS"', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000, // BEP ROAS = 2.0x
      actualAdSpend: 500000,
      revenue: 800000, // Actual ROAS = 1.6x (< 2.0x)
    });

    assert.equal(res.status.roasStatus, 'Di bawah Break-even ROAS');
  });

  // =========================================================================
  // TEST 9: Target margin makes Target CPA <= 0
  // Expected: invalid target CPA + warning
  // =========================================================================
  it('TEST 9: Target margin makes Target CPA <= 0 -> target CPA invalid + warning', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 70000,
      variableFee: 20000, // Contribution = 10k
      targetMargin: 20, // Target profit = 20k -> Target CPA = -10k <= 0
    });

    assert.equal(res.stage1.targetCpaValid, false);
    assert.equal(res.stage1.targetCpa, null);
    assert.equal(res.stage1.targetCpaWarning, 'Target margin terlalu tinggi untuk struktur biaya ini');
  });

  // =========================================================================
  // TEST 10: Conversions = 0
  // Actual CPA must be unavailable. No division by zero.
  // =========================================================================
  it('TEST 10: Conversions = 0 -> Actual CPA unavailable, no division by zero', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      actualAdSpend: 500000,
      conversions: 0,
    });

    assert.equal(res.stage2.actualCpa, null);
    assert.equal(formatCurrencyIdr(res.stage2.actualCpa), UNAVAILABLE_LABEL);
  });

  // =========================================================================
  // TEST 11: Actual Ad Spend = 0
  // Actual ROAS/CPC must be unavailable. No division by zero.
  // =========================================================================
  it('TEST 11: Actual Ad Spend = 0 -> Actual ROAS & CPC unavailable, no division by zero', () => {
    const res = calculateAdsEconomics({
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      actualAdSpend: 0,
      clicks: 100,
      revenue: 1500000,
    });

    assert.equal(res.stage2.actualRoas, null);
    assert.equal(res.stage2.actualCpc, null);
    assert.equal(formatRatio(res.stage2.actualRoas), UNAVAILABLE_LABEL);
  });

  // =========================================================================
  // TEST 12: Beginner conclusion
  // Same input must always produce exact same deterministic conclusion
  // =========================================================================
  it('TEST 12: Beginner conclusion produces identical deterministic output', () => {
    const input = {
      sellingPrice: 100000,
      cogs: 40000,
      variableFee: 10000,
      targetMargin: 20,
      actualAdSpend: 600000,
      clicks: 714,
      conversions: 20,
      revenue: 1500000,
    };

    const res1 = calculateAdsEconomics(input);
    const res2 = calculateAdsEconomics(input);

    assert.equal(res1.conclusion, res2.conclusion);
    assert.ok(res1.conclusion.includes('biaya iklan'));
    assert.ok(!res1.conclusion.includes('Winner'));
    assert.ok(!res1.conclusion.includes('Pasti sukses'));
  });

  // =========================================================================
  // SECTION 14: ADDITIONAL EDGE CASE TESTS
  // =========================================================================
  describe('Section 14: Edge Cases & Validation Safety', () => {
    it('handles missing optional target margin cleanly', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
      });
      assert.equal(res.stage1.targetMargin, null);
      assert.equal(res.stage1.targetProfit, null);
      assert.equal(res.stage1.targetCpa, null);
    });

    it('handles missing campaign data cleanly (stage 2 is empty/null)', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
      });
      assert.equal(res.stage2.actualAdSpend, null);
      assert.equal(res.stage2.actualCpa, null);
      assert.equal(res.stage2.actualRoas, null);
      assert.equal(res.conclusion, 'Data belum cukup untuk menarik kesimpulan. Masukkan Actual Ad Spend dan Konversi untuk melihat analisis performa.');
    });

    it('rejects conversions > clicks', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
        clicks: 10,
        conversions: 25,
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some(e => e.includes('tidak boleh melebihi jumlah klik')));
    });

    it('rejects negative money values', () => {
      const res = calculateAdsEconomics({
        sellingPrice: -100000,
        cogs: 40000,
        variableFee: 10000,
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some(e => e.includes('tidak boleh negatif')));
    });

    it('rejects target margin >= 100%', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
        targetMargin: 120, // 120%
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some(e => e.includes('Target margin harus kurang dari 100%')));
    });

    it('calc.md Case 1: sellingPrice 100k, conversions 10, actualRevenue 1jt -> NO inconsistency warning', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
        conversions: 10,
        actualRevenue: 1000000,
      });

      assert.equal(res.isValid, true);
      assert.deepEqual(res.warnings, []);
    });

    it('calc.md Case 2: sellingPrice 100k, conversions 10, actualRevenue 10jt -> triggers inconsistency warning', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
        conversions: 10,
        actualRevenue: 10000000,
      });

      assert.equal(res.isValid, true);
      assert.equal(res.warnings.length, 1);
      assert.equal(
        res.warnings[0],
        'Revenue Aktual berbeda cukup jauh dari estimasi Harga Jual × Conversion. Periksa kembali input Anda.'
      );
      // Warning is non-blocking and does NOT alter calculations (calc.md Requirement 4)
      assert.equal(res.stage1.contribution, 50000);
      assert.equal(res.stage2.conversions, 10);
      assert.equal(res.stage2.revenue, 10000000);
    });

    it('calc.md Case 3: ACOS 100k spend / 1jt attributed revenue = 10% (labeled ACOS, NOT TACOS)', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
        actualAdSpend: 100000,
        revenue: 1000000,
      });

      assert.equal(res.isValid, true);
      assert.equal(res.stage2.acos, 0.10);
      assert.equal(formatPercent(res.stage2.acos), '10,00%');
      // Without Total Store Revenue, TACOS must be null (calc.md Requirement 2 & 6)
      assert.equal(res.stage2.tacos, null);
    });

    it('calculates TACOS only when Total Store Revenue is provided as denominator', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 40000,
        variableFee: 10000,
        actualAdSpend: 100000,
        revenue: 1000000, // Attributed campaign revenue
        totalStoreRevenue: 5000000, // Total store revenue
      });

      assert.equal(res.isValid, true);
      assert.equal(res.stage2.acos, 0.10); // 100k / 1jt = 10%
      assert.equal(res.stage2.tacos, 0.02); // 100k / 5jt = 2%
      assert.equal(formatPercent(res.stage2.tacos), '2,00%');
    });

    it('keeps raw precision without premature rounding', () => {
      const res = calculateAdsEconomics({
        sellingPrice: 100000,
        cogs: 33333.333,
        variableFee: 10000,
      });
      // Raw contribution preserves exact decimal
      assert.equal(res.stage1.contribution, 56666.667);
      // Formatter rounds cleanly for presentation
      assert.equal(formatCurrencyIdr(res.stage1.contribution), 'Rp56.667');
    });
  });

  // =========================================================================
  // SECTION 1 & 16: ROUTE, CATALOG & RECOMMENDATIONS INTEGRITY TESTS
  // =========================================================================
  describe('Section 1 & 16: Route, Catalog & Recommendations Integrity', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    it('App.jsx defines marketing/ads and redirects legacy google-business routes', () => {
      const appJsx = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
      assert.ok(appJsx.includes("path: 'marketing/ads'"), 'marketing/ads route must exist in App.jsx');
      assert.ok(appJsx.includes('<AdsPage />'), 'AdsPage element must be mapped to marketing/ads');
      assert.ok(appJsx.includes("path: 'marketing/google-business'"), 'legacy google-business route must be defined for redirect');
      assert.ok(appJsx.includes('<Navigate to="/dashboard/marketing/ads" replace />'), 'legacy routes must redirect to /dashboard/marketing/ads');
    });

    it('categories.js lists Ads and replaces Google Business Profile', async () => {
      const categoriesModule = await import('../data/categories.js');
      const marketingTools = categoriesModule.CATEGORIES.marketing.tools;
      const adsTool = marketingTools.find(t => t.name === 'Ads');
      assert.ok(adsTool, 'Ads tool must be present in marketing categories');
      assert.equal(adsTool.path, '/dashboard/marketing/ads');
      const gbpTool = marketingTools.find(t => t.name === 'Google Business Profile');
      assert.equal(gbpTool, undefined, 'Google Business Profile should not remain active in tool catalog');
    });

    it('ADS_RECOMMENDATIONS conforms to source-first architecture with official links', async () => {
      const { ADS_RECOMMENDATIONS } = await import('../data/adsRecommendations.js');
      assert.ok(ADS_RECOMMENDATIONS.length >= 6, 'Must have recommendations across platforms');
      ADS_RECOMMENDATIONS.forEach(rec => {
        assert.ok(['Google Ads', 'Meta Ads', 'TikTok Ads'].includes(rec.platform), 'Platform must be valid');
        assert.ok(rec.title && rec.title.length > 5, 'Title must be descriptive');
        assert.ok(rec.sourceUrl && rec.sourceUrl.startsWith('https://'), 'Must have official HTTPS source URL');
        assert.ok(rec.sourceName && rec.sourceName.length > 3, 'Must have official source name');
        assert.ok(Array.isArray(rec.howToTry) && rec.howToTry.length > 0, 'Must have how to try steps');
      });
    });
  });
});
