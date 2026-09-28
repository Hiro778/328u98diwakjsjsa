import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DESIGN_SETTINGS,
  THEME_PRESETS,
  FONT_PRESETS,
  normalizeDesignSettings,
  getProductImageUrl,
} from '../services/qrMenuDesignService.js';

describe('Custom QR Menu Designer Specification Tests (CATA.MD)', () => {
  const migration056Path = path.resolve('supabase/migrations/056_tool_usage_analytics.sql');
  const migrationPath = path.resolve('supabase/migrations/057_qr_menu_design_settings.sql');
  const servicePath = path.resolve('src/services/qrMenuDesignService.js');
  const rendererPath = path.resolve('src/components/pos/PublicMenuRenderer.jsx');
  const designerPagePath = path.resolve('src/pages/dashboard/pos/QRMenuDesignerPage.jsx');
  const publicMenuPagePath = path.resolve('src/pages/public/PublicMenuPage.jsx');

  describe('1. Default Theme & Configuration Specification', () => {
    test('DEFAULT_DESIGN_SETTINGS contains expected version and theme tokens', () => {
      assert.equal(DEFAULT_DESIGN_SETTINGS.version, 1);
      assert.ok(DEFAULT_DESIGN_SETTINGS.theme.primary);
      assert.ok(DEFAULT_DESIGN_SETTINGS.theme.background);
      assert.ok(DEFAULT_DESIGN_SETTINGS.theme.surface);
      assert.ok(DEFAULT_DESIGN_SETTINGS.theme.text);
      assert.ok(DEFAULT_DESIGN_SETTINGS.theme.button);
      assert.ok(DEFAULT_DESIGN_SETTINGS.theme.fontHeading);
      assert.ok(DEFAULT_DESIGN_SETTINGS.theme.fontBody);
    });

    test('DEFAULT_DESIGN_SETTINGS layout contains standard sections in logical order', () => {
      const sectionIds = DEFAULT_DESIGN_SETTINGS.layout.map(s => s.id);
      assert.ok(sectionIds.includes('logo'), 'Must include logo section');
      assert.ok(sectionIds.includes('business_info'), 'Must include business_info section');
      assert.ok(sectionIds.includes('banner'), 'Must include banner section');
      assert.ok(sectionIds.includes('categories'), 'Must include categories section');
      assert.ok(sectionIds.includes('products'), 'Must include products section');
      assert.ok(sectionIds.includes('social'), 'Must include social section');
      assert.ok(sectionIds.includes('footer'), 'Must include footer section');
    });

    test('THEME_PRESETS offers required curated aesthetic palettes', () => {
      const expectedThemes = ['default', 'coffee', 'food', 'minimal', 'elegant', 'fresh', 'dark'];
      for (const t of expectedThemes) {
        assert.ok(THEME_PRESETS[t], `Must have ${t} theme preset`);
        assert.ok(THEME_PRESETS[t].primary, `${t} must have primary color`);
        assert.ok(THEME_PRESETS[t].background, `${t} must have background color`);
      }
    });

    test('FONT_PRESETS includes safe high-quality font selections', () => {
      const fontIds = FONT_PRESETS.map(f => f.id);
      assert.ok(fontIds.includes('Inter'));
      assert.ok(fontIds.includes('Poppins'));
      assert.ok(fontIds.includes('Plus Jakarta Sans'));
      assert.ok(fontIds.includes('Lora'));
    });
  });

  describe('2. Normalization & Backward Compatibility', () => {
    test('normalizeDesignSettings gracefully handles null or empty stored settings', () => {
      const normalizedNull = normalizeDesignSettings(null);
      assert.equal(normalizedNull.version, 1);
      assert.equal(normalizedNull.theme.primary, DEFAULT_DESIGN_SETTINGS.theme.primary);
      assert.equal(normalizedNull.layout.length, DEFAULT_DESIGN_SETTINGS.layout.length);

      const normalizedEmpty = normalizeDesignSettings({});
      assert.equal(normalizedEmpty.version, 1);
    });

    test('normalizeDesignSettings merges partial theme while preserving custom colors', () => {
      const partial = {
        version: 1,
        theme: {
          primary: '#123456',
          fontHeading: 'Lora',
        },
        layout: [
          { id: 'products', type: 'products', visible: true, props: { layout: 'list' } },
        ],
      };

      const result = normalizeDesignSettings(partial);
      assert.equal(result.theme.primary, '#123456');
      assert.equal(result.theme.fontHeading, 'Lora');
      assert.equal(result.theme.background, DEFAULT_DESIGN_SETTINGS.theme.background); // preserved fallback

      // Ensures all 7 standard sections exist even if user only saved partial layout
      assert.equal(result.layout.length, DEFAULT_DESIGN_SETTINGS.layout.length);
      const prodSection = result.layout.find(s => s.id === 'products');
      assert.equal(prodSection.props.layout, 'list');
    });
  });

  describe('3. Database Migrations & Security Isolation (CATA.MD Compliance)', () => {
    test('Migration 056 is reserved and does not conflict with QR menu designer', () => {
      assert.ok(fs.existsSync(migration056Path), 'Migration 056 must exist to avoid sequence collision');
      const sql056 = fs.readFileSync(migration056Path, 'utf8');
      assert.ok(!sql056.includes('qr_menu_design_settings'), '056 must not be used for qr_menu_design_settings');
    });

    test('Migration 057 exists and defines qr_menu_design_settings table with RLS', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 057 must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.qr_menu_design_settings'));
      assert.ok(/business_id\s+uuid NOT NULL UNIQUE REFERENCES public\.businesses\(id\)/.test(sql));
      assert.ok(sql.includes('ALTER TABLE public.qr_menu_design_settings ENABLE ROW LEVEL SECURITY'));

      // Owner check
      assert.ok(sql.includes('qr_menu_design_settings_owner_select'));
      assert.ok(sql.includes('qr_menu_design_settings_owner_insert'));
      assert.ok(sql.includes('qr_menu_design_settings_owner_update'));
      assert.ok(sql.includes('qr_menu_design_settings_owner_delete'));
      assert.ok(sql.includes('owner_id = (SELECT auth.uid())'));

      // Public read check
      assert.ok(sql.includes('qr_menu_design_settings_public_select'));
      assert.ok(sql.includes('is_menu_published = true'));
    });

    test('Migration 057 and service enforce product-images bucket with tenant isolation', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.ok(sql.includes("bucket_id = 'product-images'"));
      assert.ok(sql.includes("'qr-menu'"));

      const serviceSrc = fs.readFileSync(servicePath, 'utf8');
      assert.ok(serviceSrc.includes("from('product-images')"));
      assert.ok(!serviceSrc.includes("from('products')"));
      assert.ok(serviceSrc.includes('qr-menu/${businessId}'));
    });
  });

  describe('4. Brand-First Public Menu Renderer (CATA.MD Compliance)', () => {
    test('PublicMenuRenderer exists and supports brand identity focal point', () => {
      assert.ok(fs.existsSync(rendererPath), 'PublicMenuRenderer.jsx must exist');
      const src = fs.readFileSync(rendererPath, 'utf8');

      // Logo focal point
      assert.ok(src.includes('case \'logo\':'));
      assert.ok(src.includes('case \'business_info\':'));
      assert.ok(src.includes('case \'banner\':'));
      assert.ok(src.includes('case \'categories\':'));
      assert.ok(src.includes('case \'products\':'));
      assert.ok(src.includes('case \'footer\':'));

      // Product layout options
      assert.ok(src.includes('productLayout === \'grid\''));
      assert.ok(src.includes('productLayout === \'list\''));
      assert.ok(src.includes('productLayout === \'card\''));
    });

    test('PublicMenuPage integrates PublicMenuRenderer without hardcoded BS permanent logo', () => {
      assert.ok(fs.existsSync(publicMenuPagePath), 'PublicMenuPage.jsx must exist');
      const src = fs.readFileSync(publicMenuPagePath, 'utf8');

      assert.ok(src.includes('PublicMenuRenderer'), 'PublicMenuPage must render PublicMenuRenderer');
      assert.ok(src.includes('getDesignSettings'), 'PublicMenuPage must load design settings');
      assert.ok(
        !src.includes('<span className="text-xs font-bold text-white">BS</span>'),
        'PublicMenuPage must not have permanent BS logo in active header'
      );
    });
  });

  describe('5. Designer Page Interactive Capabilities', () => {
    test('QRMenuDesignerPage exists and provides Reorder, Device Switcher, and Properties Inspector', () => {
      assert.ok(fs.existsSync(designerPagePath), 'QRMenuDesignerPage.jsx must exist');
      const src = fs.readFileSync(designerPagePath, 'utf8');

      // Framer motion drag reorder
      assert.ok(src.includes('Reorder.Group'), 'Must use Reorder.Group for drag reorder');
      assert.ok(src.includes('Reorder.Item'), 'Must use Reorder.Item');

      // Device modes
      assert.ok(src.includes('deviceMode === \'mobile\''));
      assert.ok(src.includes('deviceMode === \'tablet\''));
      assert.ok(src.includes('deviceMode === \'desktop\''));

      // Asset uploads
      assert.ok(src.includes('uploadDesignAsset'), 'Must support uploading logo/banner');
      assert.ok(src.includes('handleLogoUpload'));
      assert.ok(src.includes('handleBannerUpload'));

      // Presets and colors
      assert.ok(src.includes('THEME_PRESETS'));
      assert.ok(src.includes('handleSelectPreset'));
    });
  });

  describe('6. Banner & Hero Cover Specification (qr.md)', () => {
    test('QRMenuDesignerPage renders BannerEditor with empty state, + Tambah Banner, and BannerModal', () => {
      const src = fs.readFileSync(designerPagePath, 'utf8');

      // BannerEditor component
      assert.ok(src.includes('function BannerEditor'), 'BannerEditor component must be defined');
      assert.ok(src.includes('Belum ada banner'), 'Must have empty state for zero banners');
      assert.ok(src.includes('Tambah Banner'), 'Must have Tambah Banner button');

      // BannerModal with title, description, CTA text & link
      assert.ok(src.includes('function BannerModal'), 'BannerModal component must be defined');
      assert.ok(src.includes('Judul Banner'), 'Modal must have Judul Banner field');
      assert.ok(src.includes('Deskripsi'), 'Modal must have Deskripsi field');
      assert.ok(src.includes('Teks Tombol CTA'), 'Modal must have CTA text field');
      assert.ok(src.includes('Link / Target CTA'), 'Modal must have CTA URL field');
      assert.ok(src.includes('handleSaveBanner'), 'Must have handleSaveBanner handler');
      assert.ok(src.includes('handleDeleteBanner'), 'Must have handleDeleteBanner handler');

      // Uses existing uploadDesignAsset service with 'banner'
      assert.ok(src.includes("uploadDesignAsset(business.id, file, 'banner')"));
    });

    test('PublicMenuRenderer renders multiple banners with captions and CTA from layout block', () => {
      const src = fs.readFileSync(rendererPath, 'utf8');

      assert.ok(src.includes('block.props?.banners'), 'PublicMenuRenderer must support block.props.banners');
      assert.ok(src.includes('b.title'), 'PublicMenuRenderer must render banner title');
      assert.ok(src.includes('b.description'), 'PublicMenuRenderer must render banner description');
      assert.ok(src.includes('b.ctaText'), 'PublicMenuRenderer must render banner CTA');
    });
  });

  describe('7. Media Sosial & Kontak Specification (qr.md)', () => {
    test('QRMenuDesignerPage provides 0/5 counter, disabled at 5, SocialModal, edit, and delete', () => {
      const src = fs.readFileSync(designerPagePath, 'utf8');

      // SocialLinksEditor
      assert.ok(src.includes('function SocialLinksEditor'), 'SocialLinksEditor component must be defined');
      assert.ok(src.includes('function SocialModal'), 'SocialModal component must be defined');
      assert.ok(src.includes('{links.length}/5'), 'Must render dynamic counter 0/5 to 5/5');
      assert.ok(src.includes('links.length >= 5'), 'Tambah Kontak must be disabled at 5 links');

      // Handlers
      assert.ok(src.includes('handleSaveSocialLink'), 'Must have handleSaveSocialLink');
      assert.ok(src.includes('handleDeleteSocialLink'), 'Must have handleDeleteSocialLink');
      assert.ok(src.includes('handleMoveSocialLink'), 'Must have handleMoveSocialLink');
      assert.ok(src.includes('sanitizeSocialUrl'), 'Must sanitize and validate social URLs');
    });

    test('PublicMenuRenderer renders social media once in Footer (IKUTI KAMI) without duplicate standalone display (qr.md)', () => {
      const src = fs.readFileSync(rendererPath, 'utf8');

      // Standalone social rendering is suppressed in PublicMenuRenderer
      assert.ok(src.includes("case 'social':"), 'Must handle social block in renderer');
      assert.ok(
        src.includes("return null"),
        'Standalone social block must return null to prevent duplicate rendering below products'
      );

      // Social media is rendered once in the Footer
      assert.ok(src.includes("case 'footer':"), 'Must have footer block');
      assert.ok(src.includes('Ikuti Kami'), 'Footer must render Ikuti Kami section');
      assert.ok(src.includes('SocialLinkButton'), 'Footer must render SocialLinkButton');
      assert.ok(src.includes('getNormalizedSocialLinks'), 'Footer must normalize social links');

      // Footer layout must be responsive 2-column without excessive padding
      assert.ok(src.includes('sm:flex-row sm:items-start sm:justify-between'), 'Footer must have responsive 2-column layout');
    });
  });

  describe('8. Product & Banner Image Flow & Fallback Specification (p.md)', () => {
    test('getProductImageUrl resolves canonical image_url, imageUrl, image, or images array', () => {
      assert.equal(getProductImageUrl(null), '');
      assert.equal(getProductImageUrl({}), '');
      assert.equal(getProductImageUrl({ image_url: 'https://example.com/a.png' }), 'https://example.com/a.png');
      assert.equal(getProductImageUrl({ imageUrl: 'https://example.com/b.png' }), 'https://example.com/b.png');
      assert.equal(getProductImageUrl({ image: 'https://example.com/c.png' }), 'https://example.com/c.png');
      assert.equal(getProductImageUrl({ images: ['https://example.com/d.png'] }), 'https://example.com/d.png');
      // Priority ordering
      assert.equal(getProductImageUrl({ image_url: 'https://example.com/p1.png', imageUrl: 'https://example.com/p2.png' }), 'https://example.com/p1.png');
    });

    test('PublicMenuRenderer checks both imageUrl and image_url on banner block with cover fallback', () => {
      const src = fs.readFileSync(rendererPath, 'utf8');

      assert.ok(src.includes('b.imageUrl || b.image_url'), 'Banner img must support both imageUrl and image_url');
      assert.ok(src.includes('block.props?.imageUrl || block.props?.image_url || business?.cover_url'), 'Banner fallback must support business.cover_url');
      assert.ok(src.includes('getProductImageUrl(product)'), 'Product cards must resolve image via getProductImageUrl helper');
    });

    test('ImageUpload component syncs preview state with incoming currentImage prop', () => {
      const imageUploadPath = path.resolve('src/components/pos/ImageUpload.jsx');
      assert.ok(fs.existsSync(imageUploadPath), 'ImageUpload.jsx must exist');
      const src = fs.readFileSync(imageUploadPath, 'utf8');

      assert.ok(src.includes('useEffect(() => {'), 'ImageUpload must contain useEffect for currentImage sync');
      assert.ok(src.includes('setPreview(currentImage || \'\')'), 'Must sync preview with currentImage');
    });

    test('QRMenuDesignerPage handleSaveBanner correctly handles fallback/virtual cover without dropping edit', () => {
      const src = fs.readFileSync(designerPagePath, 'utf8');

      assert.ok(src.includes('const found = existingBanners.some((b) => b.id === editingBanner.id)'), 'Must check if editingBanner exists in existingBanners');
      assert.ok(src.includes('// If editing a virtual fallback cover or new banner without match, append'), 'Must append if editingBanner id was not found');
    });
  });
});
