// src/__tests__/competitorIntegrityAudit.test.js
// Dedicated Data Integrity & Anti-Fabrication Test Suite for final.md:
// A. Missing Maps data → unavailable text.
// B. Missing website → unavailable text.
// C. Research failure → no fabricated competitor metrics.
// D. Empty evidence → insufficient evidence message.
// E. Comparative analysis cannot invent rating/reviews.
// F. User-provided name is not treated as factual Maps data.
// G. Every factual comparison has evidence/provenance.

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNAVAILABLE_MAPS_SOURCE_TEXT,
  INSUFFICIENT_EVIDENCE_TEXT,
} from '../lib/googleMapsUtils.js';
import { buildGroundedComparativeAnalysis } from '../services/competitorAnalysisService.js';

describe('Competitor Analysis Data Integrity Audit (final.md)', () => {

  const standardUnavailable = 'Tidak tersedia dari sumber yang terhubung.';
  const standardInsufficient = 'Data tidak cukup untuk menarik kesimpulan.';

  // A. Missing Maps data → unavailable text
  it('A. Missing Maps data strictly returns "Tidak tersedia dari sumber yang terhubung."', () => {
    assert.equal(UNAVAILABLE_MAPS_SOURCE_TEXT, standardUnavailable);

    const competitors = [
      { name: 'Warung A', google_maps_url: 'https://maps.app.goo.gl/aaa1' },
      { name: 'Warung B', google_maps_url: 'https://maps.app.goo.gl/bbb2' },
    ];

    const result = buildGroundedComparativeAnalysis(competitors);

    for (const row of result.competitor_comparison.rows) {
      const mapsData = row.google_maps_data;
      assert.equal(mapsData.rating, standardUnavailable, 'Rating must not be fabricated');
      assert.equal(mapsData.review_count, standardUnavailable, 'Review count must not be fabricated');
      assert.equal(mapsData.address, standardUnavailable, 'Address must not be fabricated');
      assert.equal(mapsData.phone, standardUnavailable, 'Phone must not be fabricated');
      assert.equal(mapsData.category, standardUnavailable, 'Category must not be fabricated');
      assert.equal(mapsData.opening_hours, standardUnavailable, 'Opening hours must not be fabricated');
      assert.equal(mapsData.pricing, standardUnavailable, 'Pricing must not be fabricated');
      assert.equal(mapsData.location, standardUnavailable, 'Location must not be fabricated');

      // Ensure none are converted to numbers or default values
      assert.notEqual(typeof mapsData.rating, 'number', 'Rating must never be a fabricated number');
      assert.notEqual(typeof mapsData.review_count, 'number', 'Review count must never be a fabricated number');
    }
  });

  // B. Missing website → unavailable text
  it('B. Missing website strictly returns unavailable text, not fabricated URL or empty guess', () => {
    const competitors = [
      { name: 'Toko Offline', google_maps_url: 'https://maps.app.goo.gl/off1' },
      { name: 'Toko Online', google_maps_url: 'https://maps.app.goo.gl/on1', website: 'https://tokoonline.com' },
    ];

    const result = buildGroundedComparativeAnalysis(competitors);
    const offlineRow = result.competitor_comparison.rows.find(r => r.competitor === 'Toko Offline');
    const onlineRow = result.competitor_comparison.rows.find(r => r.competitor === 'Toko Online');

    assert.equal(offlineRow.website, standardUnavailable);
    assert.equal(onlineRow.website, 'https://tokoonline.com');
  });

  // C. Research failure → no fabricated competitor metrics
  it('C. Research failure/fallback generates zero fabricated metrics or multiplied prices', () => {
    const competitors = [
      { name: 'Warung Kopi', google_maps_url: 'https://maps.app.goo.gl/kopi1' },
      { name: 'Kedai Kopi', google_maps_url: 'https://maps.app.goo.gl/kopi2' },
    ];

    const report = buildGroundedComparativeAnalysis(competitors);

    // Verify product categories and pricing in fallback
    assert.deepEqual(report.product_analysis.product_categories, [], 'Must not fabricate product list');
    for (const row of report.competitor_comparison.rows) {
      assert.equal(row.pricing, standardUnavailable);
      assert.ok(!row.pricing.includes('$'), 'Must not contain fabricated dollar signs');
      assert.ok(!row.pricing.includes('10000'), 'Must not contain multiplied numerical regex numbers');
    }
  });

  // D. Empty evidence → insufficient evidence message
  it('D. Empty evidence strictly yields "Data tidak cukup untuk menarik kesimpulan."', () => {
    assert.equal(INSUFFICIENT_EVIDENCE_TEXT, standardInsufficient);

    const competitors = [
      { name: 'Comp 1', google_maps_url: 'https://maps.app.goo.gl/c1' },
      { name: 'Comp 2', google_maps_url: 'https://maps.app.goo.gl/c2' },
    ];

    const report = buildGroundedComparativeAnalysis(competitors);

    // Differentiators
    assert.ok(report.product_analysis.unique_differentiators.includes(standardInsufficient));

    // Positioning by competitor
    for (const [name, pos] of Object.entries(report.positioning_analysis.by_competitor)) {
      assert.equal(pos.positioning, standardInsufficient);
      assert.equal(pos.target_audience, standardInsufficient);
      assert.equal(pos.value_proposition, standardInsufficient);
    }
  });

  // E. Comparative analysis cannot invent rating/reviews
  it('E. Comparative analysis report cannot invent rating/reviews anywhere in report', () => {
    const competitors = [
      { name: 'Brand A', google_maps_url: 'https://maps.app.goo.gl/ba' },
      { name: 'Brand B', google_maps_url: 'https://maps.app.goo.gl/bb' },
    ];

    const report = buildGroundedComparativeAnalysis(competitors);
    const jsonString = JSON.stringify(report);

    // Ensure no simulated 4.8 / 5.0 or review numbers exist
    assert.equal(jsonString.includes('"rating":4.'), false);
    assert.equal(jsonString.includes('"rating":5.'), false);
    assert.equal(jsonString.includes('"review_count":'), true);
    // Every review count must be standard unavailable
    for (const row of report.competitor_comparison.rows) {
      assert.equal(row.google_maps_data.review_count, standardUnavailable);
    }
  });

  // F. User-provided name is not treated as factual Maps data
  it('F. User-provided name is not treated as factual Maps category or location', () => {
    const competitors = [
      { name: 'Kopi Kenangan Jakarta Selatan', google_maps_url: 'https://maps.app.goo.gl/k1' },
      { name: 'Bengkel Motor Bandung', google_maps_url: 'https://maps.app.goo.gl/b1' },
    ];

    const report = buildGroundedComparativeAnalysis(competitors);

    // Even though name says "Jakarta Selatan" or "Bengkel", category and location MUST be unavailable from Maps link
    for (const row of report.competitor_comparison.rows) {
      assert.equal(row.google_maps_data.category, standardUnavailable);
      assert.equal(row.google_maps_data.location, standardUnavailable);
    }
  });

  // G. Every factual comparison has evidence/provenance
  it('G. Every factual comparison has evidence/provenance and avoids subjective superlatives', () => {
    const competitors = [
      { name: 'Entitas A', google_maps_url: 'https://maps.app.goo.gl/ea', website: 'https://entitas-a.com' },
      { name: 'Entitas B', google_maps_url: 'https://maps.app.goo.gl/eb' },
    ];

    const report = buildGroundedComparativeAnalysis(competitors);

    // Provenance verification
    for (const row of report.competitor_comparison.rows) {
      assert.ok(row.provenance, 'Row must include provenance record');
      assert.equal(row.provenance.maps_url_source, 'Input Pengguna');
    }

    // Comparative statement matches valid example from final.md lines 61-63
    const overview = report.executive_summary.overview;
    assert.ok(overview.includes('Entitas A memiliki website yang tersedia'));
    assert.ok(overview.includes('Entitas B tidak memiliki website yang tersedia'));

    // Verify recommendations avoid unsubstantiated superlatives
    const recs = report.strategic_recommendations;
    for (const r of recs) {
      assert.equal(r.recommendation.includes('sebaiknya '), false);
      assert.equal(r.recommendation.includes('lebih bagus'), false);
      assert.equal(r.recommendation.includes('unggul'), false);
      assert.ok(r.rationale.includes('bukti nyata'));
    }
  });

});
