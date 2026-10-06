import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DESIGN_SETTINGS,
  normalizeDesignSettings,
  updateMenuBackground,
  uploadDesignAsset,
} from '../services/qrMenuDesignService.js';

describe('Merchant Menu Background & Responsive Branding Tests', () => {
  const profilePagePath = path.resolve('src/pages/dashboard/ProfilePage.jsx');
  const publicMenuPagePath = path.resolve('src/pages/public/PublicMenuPage.jsx');
  const publicMenuRendererPath = path.resolve('src/components/pos/PublicMenuRenderer.jsx');
  const productDetailPagePath = path.resolve('src/pages/public/PublicProductDetailPage.jsx');

  describe('1. Service Layer & Default Design Settings', () => {
    test('DEFAULT_DESIGN_SETTINGS includes backgroundImage and backgroundOverlay tokens', () => {
      assert.equal(DEFAULT_DESIGN_SETTINGS.theme.backgroundImage, '');
      assert.equal(DEFAULT_DESIGN_SETTINGS.theme.backgroundOverlay, 0);
    });

    test('normalizeDesignSettings retains custom backgroundImage and defaults properly', () => {
      const normalizedEmpty = normalizeDesignSettings({});
      assert.equal(normalizedEmpty.theme.backgroundImage, '');
      assert.equal(normalizedEmpty.theme.backgroundOverlay, 0);

      const custom = {
        theme: {
          backgroundImage: 'https://supabase.co/storage/v1/object/public/product-images/qr-menu/biz-1/background/test.jpg',
          backgroundOverlay: 10,
        },
      };
      const normalizedCustom = normalizeDesignSettings(custom);
      assert.equal(normalizedCustom.theme.backgroundImage, custom.theme.backgroundImage);
      assert.equal(normalizedCustom.theme.backgroundOverlay, 10);
    });

    test('updateMenuBackground requires businessId', async () => {
      await assert.rejects(
        async () => {
          await updateMenuBackground('', 'https://example.com/bg.jpg');
        },
        /business_id diperlukan/
      );
    });

    test('uploadDesignAsset rejects invalid extensions and accepts background type', async () => {
      const dummyFile = { name: 'malicious.exe', type: 'application/octet-stream' };
      await assert.rejects(
        async () => {
          await uploadDesignAsset('biz-123', dummyFile, 'background');
        },
        /Format file tidak didukung|Ekstensi file tidak diizinkan/
      );
    });
  });

  describe('2. Merchant Dashboard Settings UI (ProfilePage.jsx)', () => {
    test('ProfilePage renders "Background Menu" section with preview, upload, remove, and save buttons', () => {
      assert.ok(fs.existsSync(profilePagePath), 'ProfilePage.jsx must exist');
      const src = fs.readFileSync(profilePagePath, 'utf8');

      // Section title & description
      assert.ok(src.includes('Background Menu'), 'Must have Background Menu section title');
      assert.ok(src.includes('Foto latar belakang untuk halaman menu publik'), 'Must describe the public menu background');

      // Controls
      assert.ok(src.includes('Pilih Foto Background') || src.includes('Ganti Foto'), 'Must have upload button');
      assert.ok(src.includes('Hapus Foto') || src.includes('Hapus Background'), 'Must have remove button');
      assert.ok(src.includes('Simpan Background'), 'Must have save button');

      // Format validation / restrictions
      assert.ok(src.includes('image/jpeg,image/jpg,image/png,image/webp'), 'Must restrict to safe web image formats');
      assert.ok(src.includes('validateAvatarFile(file)'), 'Must validate file with validateAvatarFile');
      assert.ok(src.includes('Maksimal 5 MB'), 'Must indicate max 5MB size limit');

      // Tenant isolation: calls updateMenuBackground with current business.id
      assert.ok(src.includes('updateMenuBackground(business.id'), 'Must update background scoped to business.id');
      assert.ok(src.includes('uploadDesignAsset(business.id, selectedBgFile, \'background\')'), 'Must upload asset scoped to business.id');
    });

    test('ProfilePage does not use emoji for UI elements in Background section', () => {
      const src = fs.readFileSync(profilePagePath, 'utf8');
      const backgroundSectionStart = src.indexOf('Background Menu');
      assert.ok(backgroundSectionStart > -1);
      const backgroundSectionEnd = src.indexOf('</section>', backgroundSectionStart);
      const sectionText = backgroundSectionEnd > -1
        ? src.slice(backgroundSectionStart, backgroundSectionEnd)
        : src.slice(backgroundSectionStart, backgroundSectionStart + 2000);

      // Verify no emoji unicode characters in the section
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      assert.ok(!emojiRegex.test(sectionText), 'Background menu section must not contain emojis');
    });
  });

  describe('3. Public Menu & Presentation Layer (PublicMenuRenderer & PublicMenuPage)', () => {
    test('PublicMenuRenderer enforces data-theme="light" and applies merchant background layer', () => {
      assert.ok(fs.existsSync(publicMenuRendererPath), 'PublicMenuRenderer.jsx must exist');
      const src = fs.readFileSync(publicMenuRendererPath, 'utf8');

      // Force light theme
      assert.ok(src.includes('data-theme="light"'), 'PublicMenuRenderer must enforce data-theme="light"');

      // Background image layer
      assert.ok(src.includes('theme.backgroundImage') || src.includes('theme?.backgroundImage'), 'PublicMenuRenderer must resolve backgroundImage from theme');
      assert.ok(src.includes('bg-white/80') || src.includes('bg-white/85'), 'Must render light overlay for readability');
      assert.ok(src.includes('backgroundSize: \'cover\''), 'Must use background-size: cover');
      assert.ok(src.includes('backgroundPosition: \'center\''), 'Must use background-position: center');
      assert.ok(src.includes('backgroundRepeat: \'no-repeat\''), 'Must use background-repeat: no-repeat');

      // Layering
      assert.ok(src.includes('z-10'), 'Content must be layered above background with z-10');
    });

    test('PublicMenuPage enforces data-theme="light" on outer container and drawers', () => {
      assert.ok(fs.existsSync(publicMenuPagePath), 'PublicMenuPage.jsx must exist');
      const src = fs.readFileSync(publicMenuPagePath, 'utf8');

      // Force light theme on page, order success view, and cart/checkout drawers
      assert.ok(src.includes('data-theme="light"'), 'PublicMenuPage must enforce data-theme="light"');
      assert.ok(src.includes('orderSuccess'), 'Must support orderSuccess view');
      assert.ok(src.includes('qrBgImage'), 'Must apply background image on order success view');
    });
  });

  describe('4. Public Product Detail Page (PublicProductDetailPage.jsx)', () => {
    test('PublicProductDetailPage enforces data-theme="light" and renders responsive background', () => {
      assert.ok(fs.existsSync(productDetailPagePath), 'PublicProductDetailPage.jsx must exist');
      const src = fs.readFileSync(productDetailPagePath, 'utf8');

      assert.ok(src.includes('data-theme="light"'), 'Must enforce data-theme="light"');
      assert.ok(src.includes('theme.backgroundImage') || src.includes('theme?.backgroundImage'), 'Must support theme backgroundImage');
      assert.ok(src.includes('bg-white/80') || src.includes('bg-white/85'), 'Must render light readability overlay');
    });

    test('PublicProductDetailPage container has responsive max-w-6xl container', () => {
      const src = fs.readFileSync(productDetailPagePath, 'utf8');
      assert.ok(src.includes('max-w-6xl'), 'Main content container must be constrained to max-w-6xl');
    });

    test('PublicProductDetailPage displays Quantity and CTA buttons on all viewports without mobile clipping', () => {
      const src = fs.readFileSync(productDetailPagePath, 'utf8');

      // Quantity selector is not hidden on mobile
      assert.ok(src.includes('Jumlah'), 'Must have quantity heading');
      assert.ok(src.includes('handleQtyChange'), 'Must have quantity change handler');

      // CTA buttons: Primary "Belanja Langsung" & Secondary "Tambah ke Keranjang"
      assert.ok(src.includes('Tambah ke Keranjang'), 'Must have Tambah ke Keranjang CTA');
      assert.ok(src.includes('Belanja Langsung'), 'Must have Belanja Langsung CTA');

      // Stacking & touch targets: min-h-[48px], flex-col on mobile, grid on desktop
      assert.ok(src.includes('min-h-[48px]'), 'CTA buttons must have min 48px touch target');
      assert.ok(src.includes('flex flex-col sm:grid sm:grid-cols-2'), 'CTAs must stack vertically on mobile to prevent overflow');
    });

    test('Mobile Sticky Action Bar includes overflow safety', () => {
      const src = fs.readFileSync(productDetailPagePath, 'utf8');
      assert.ok(src.includes('max-w-full overflow-hidden'), 'Sticky action bar must have max-w-full overflow-hidden');
      assert.ok(src.includes('min-h-[44px]'), 'Sticky action bar buttons must have min 44px touch target');
    });

    test('PublicProductDetailPage does not use emojis for status or icons', () => {
      const src = fs.readFileSync(productDetailPagePath, 'utf8');
      // Verify no emoji unicode in the page except standard checkmark / bullets if any
      const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/u;
      assert.ok(!emojiRegex.test(src), 'Product detail page must not contain emojis');
    });
  });
});
