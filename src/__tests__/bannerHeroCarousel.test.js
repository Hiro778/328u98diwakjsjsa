import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Promotional Hero Banner & Carousel Specifications (ban.md)', () => {
  const rendererPath = path.resolve('src/components/pos/PublicMenuRenderer.jsx');
  const designerPath = path.resolve('src/pages/dashboard/pos/QRMenuDesignerPage.jsx');

  test('PublicMenuRenderer defines BannerCarousel with responsive aspect ratio presets', () => {
    const src = fs.readFileSync(rendererPath, 'utf8');

    // BannerCarousel component exists
    assert.ok(src.includes('function BannerCarousel'), 'BannerCarousel component must be defined');

    // Aspect ratio presets (ban.md Section 2)
    assert.ok(src.includes("'3.2 / 1'"), 'Must define compact aspect ratio 3.2 / 1');
    assert.ok(src.includes("'2.6 / 1'"), 'Must define medium aspect ratio 2.6 / 1');
    assert.ok(src.includes("'2.1 / 1'"), 'Must define large aspect ratio 2.1 / 1');

    // Aspect classes & style
    assert.ok(src.includes('aspect-[3.2/1]'), 'Must support aspect-[3.2/1]');
    assert.ok(src.includes('aspect-[2.6/1]'), 'Must support aspect-[2.6/1]');
    assert.ok(src.includes('aspect-[2.1/1]'), 'Must support aspect-[2.1/1]');
    assert.ok(src.includes('aspectRatio: aspectConfig.aspectRatio'), 'Must apply responsive aspectRatio style');
  });

  test('PublicMenuRenderer supports imagePosition and object-fit cover (ban.md Section 3)', () => {
    const src = fs.readFileSync(rendererPath, 'utf8');

    assert.ok(src.includes('object-cover'), 'Image must use object-cover');
    assert.ok(src.includes('getObjectPositionClass'), 'Must have helper for object position');
    assert.ok(src.includes('object-top'), 'Must support object-top');
    assert.ok(src.includes('object-bottom'), 'Must support object-bottom');
    assert.ok(src.includes('object-center'), 'Must support object-center default');
  });

  test('PublicMenuRenderer carousel behavior: controls only for multiple banners and swipe support (ban.md Section 4)', () => {
    const src = fs.readFileSync(rendererPath, 'utf8');

    // Multiple banners controls check
    assert.ok(src.includes('banners.length > 1'), 'Must condition carousel controls on banners.length > 1');
    assert.ok(src.includes('aria-label="Previous banner"'), 'Must have Previous arrow button');
    assert.ok(src.includes('aria-label="Next banner"'), 'Must have Next arrow button');
    assert.ok(src.includes('handlePrev'), 'Must have handlePrev callback');
    assert.ok(src.includes('handleNext'), 'Must have handleNext callback');

    // Indicators
    assert.ok(src.includes('Slide ${idx + 1}') || src.includes('Slide '), 'Must render indicator dots');

    // Touch & swipe handling
    assert.ok(src.includes('onTouchStart'), 'Must support touch start');
    assert.ok(src.includes('onTouchMove'), 'Must support touch move');
    assert.ok(src.includes('onTouchEnd'), 'Must support touch end');

    // Auto-slide effect
    assert.ok(src.includes('setInterval'), 'Must have auto-slide interval timer');
  });

  test('PublicMenuRenderer banner content overlay only when text or custom opacity present (ban.md Section 5)', () => {
    const src = fs.readFileSync(rendererPath, 'utf8');

    assert.ok(src.includes('hasOverlayContent'), 'Must check if banner has overlay content');
    assert.ok(src.includes('bg-gradient-to-t from-black/85 via-black/35 to-transparent'), 'Must use gradient overlay');
    assert.ok(src.includes('b.title'), 'Must render title if present');
    assert.ok(src.includes('b.description'), 'Must render description if present');
    assert.ok(src.includes('b.ctaText'), 'Must render ctaText if present');
    assert.ok(src.includes('b.ctaUrl'), 'Must render link for ctaUrl if present');
  });

  test('QRMenuDesignerPage BannerEditor displays hero aspect ratios (ban.md Section 2)', () => {
    const src = fs.readFileSync(designerPath, 'utf8');

    assert.ok(src.includes('Tinggi & Proporsi Banner'), 'Must have descriptive header');
    assert.ok(src.includes('3.2 : 1'), 'Must display 3.2:1 ratio for compact');
    assert.ok(src.includes('2.6 : 1'), 'Must display 2.6:1 ratio for medium');
    assert.ok(src.includes('2.1 : 1'), 'Must display 2.1:1 ratio for large');
  });

  test('QRMenuDesignerPage BannerModal provides imagePosition selector and persistence (ban.md Section 8)', () => {
    const src = fs.readFileSync(designerPath, 'utf8');

    assert.ok(src.includes('imagePosition'), 'BannerModal must manage imagePosition state');
    assert.ok(src.includes('Posisi Fokus Gambar'), 'BannerModal must render Posisi Fokus Gambar section');
    assert.ok(src.includes('handleSaveBanner({ title, description, ctaText, ctaUrl, imagePosition'), 'handleSaveBanner must accept and persist imagePosition');
  });
});
