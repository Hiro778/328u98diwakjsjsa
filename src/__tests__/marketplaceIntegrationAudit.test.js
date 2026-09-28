import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROVIDER_STATUS,
  MARKETPLACE_REGISTRY,
  getAllMarketplaceProviders,
  getReadyMarketplaceProviders,
  getAvailableMarketplacesCount,
  getConnectedMarketplacesCount,
  resolveConnectionForProvider,
} from '../lib/marketplaceProviders.js';

describe('Marketplace Integration Truth & Capability Audit (apps.md)', () => {
  const cardComponentPath = path.resolve('src/sections/Marketplace/ConnectionCard.jsx');
  const pageComponentPath = path.resolve('src/sections/Marketplace/MarketplacePage.jsx');
  const modalComponentPath = path.resolve('src/sections/Marketplace/ConnectionModal.jsx');

  test('Section 1: Principle "Official API !== BisnisSehat Integration" is strictly enforced', () => {
    // Lazada and Blibli have official APIs, but NO BisnisSehat connector implemented
    assert.equal(MARKETPLACE_REGISTRY.lazada.status, PROVIDER_STATUS.IMPLEMENTATION_REQUIRED);
    assert.equal(MARKETPLACE_REGISTRY.blibli.status, PROVIDER_STATUS.IMPLEMENTATION_REQUIRED);

    // Connector file must be null for non-implemented providers
    assert.equal(MARKETPLACE_REGISTRY.lazada.connectorFile, null);
    assert.equal(MARKETPLACE_REGISTRY.blibli.connectorFile, null);

    // Capabilities must NOT be true when connector is absent
    assert.equal(MARKETPLACE_REGISTRY.lazada.capabilities.oauth, false);
    assert.equal(MARKETPLACE_REGISTRY.lazada.capabilities.productSync, false);
    assert.equal(MARKETPLACE_REGISTRY.lazada.capabilities.inventorySync, false);
    assert.equal(MARKETPLACE_REGISTRY.lazada.capabilities.orderSync, false);
  });

  test('Section 2: availableCount strictly equals number of READY providers', () => {
    const readyProviders = getReadyMarketplaceProviders();
    const availableCount = getAvailableMarketplacesCount();

    // Only Shopee and Tokopedia & Shop have implemented connectors
    assert.equal(availableCount, 2);
    assert.deepEqual(
      readyProviders.map((p) => p.id).sort(),
      ['shopee', 'tokopedia_shop'].sort()
    );

    // Non-READY providers (Lazada, Blibli) must NOT be counted in availableCount
    assert.ok(!readyProviders.some((p) => p.id === 'lazada'));
    assert.ok(!readyProviders.some((p) => p.id === 'blibli'));
  });

  test('Section 3: connectedCount only counts READY providers with active connection', () => {
    // Fake/mock connection list including a non-ready provider (e.g. if dirty DB row exists)
    const mockConnections = [
      { marketplace: 'shopee', status: 'connected' },
      { marketplace: 'lazada', status: 'connected' }, // Non-ready provider must NOT count as connected
      { marketplace: 'tokopedia', status: 'disconnected' },
    ];

    const connected = getConnectedMarketplacesCount(mockConnections);
    assert.equal(connected, 1, 'Only Shopee connection is valid because Lazada is non-READY');

    const emptyConnections = [];
    assert.equal(getConnectedMarketplacesCount(emptyConnections), 0);
  });

  test('Section 4: Tokopedia & Shop is unified into a single card per apps.md', () => {
    const allProviders = getAllMarketplaceProviders();
    const providerIds = allProviders.map((p) => p.id);

    // Must have tokopedia_shop as one card
    assert.ok(providerIds.includes('tokopedia_shop'), 'Tokopedia & Shop must exist as unified provider');

    // Must NOT have standalone duplicate cards in main registry
    assert.ok(!providerIds.includes('tiktokshop'), 'tiktokshop standalone card must not duplicate tokopedia_shop');

    // Connection resolution must support alias from either legacy tokopedia or tiktokshop
    const resolvedFromTikTok = resolveConnectionForProvider('tokopedia_shop', {
      tiktokshop: { status: 'connected', shop_name: 'Toko TikTok' },
    });
    assert.equal(resolvedFromTikTok?.shop_name, 'Toko TikTok');

    const resolvedFromTokopedia = resolveConnectionForProvider('tokopedia_shop', {
      tokopedia: { status: 'connected', shop_name: 'Toko Tokopedia' },
    });
    assert.equal(resolvedFromTokopedia?.shop_name, 'Toko Tokopedia');
  });

  test('Section 5: Implemented connectors have actual backend code files', () => {
    const shopeeConnector = path.resolve('supabase/functions/_shared/providers/shopee.ts');
    const tiktokConnector = path.resolve('supabase/functions/_shared/providers/tiktokshop.ts');

    assert.ok(fs.existsSync(shopeeConnector), 'shopee.ts connector file must exist');
    assert.ok(fs.existsSync(tiktokConnector), 'tiktokshop.ts connector file must exist');

    const shopeeContent = fs.readFileSync(shopeeConnector, 'utf8');
    assert.ok(shopeeContent.includes('signRequest'), 'Shopee must have HMAC-SHA256 signing');
    assert.ok(shopeeContent.includes('exchangeCode'), 'Shopee must implement exchangeCode');
    assert.ok(shopeeContent.includes('fetchProducts'), 'Shopee must implement fetchProducts');
    assert.ok(shopeeContent.includes('updateStock'), 'Shopee must implement updateStock');

    const tiktokContent = fs.readFileSync(tiktokConnector, 'utf8');
    assert.ok(tiktokContent.includes('exchangeCode'), 'TikTokShop must implement exchangeCode');
    assert.ok(tiktokContent.includes('fetchProducts'), 'TikTokShop must implement fetchProducts');
    assert.ok(tiktokContent.includes('updateStock'), 'TikTokShop must implement updateStock');
  });

  test('Section 6: ConnectionCard does not render fake OAuth button for non-READY providers', () => {
    const cardContent = fs.readFileSync(cardComponentPath, 'utf8');

    // Button disabled for non-ready providers
    assert.ok(cardContent.includes('Connector Belum Diimplementasikan'));
    assert.ok(cardContent.includes('cursor-not-allowed'));
    assert.ok(cardContent.includes('provider.status === PROVIDER_STATUS.READY'));

    // Truth-based capability rendering (no unconditional checkmarks)
    assert.ok(cardContent.includes('provider.capabilities.oauth ?'));
    assert.ok(cardContent.includes('provider.capabilities.inventorySync ?'));
    assert.ok(cardContent.includes('provider.capabilities.orderSync ?'));
  });

  test('Section 7: MarketplacePage displays truth-based available count', () => {
    const pageContent = fs.readFileSync(pageComponentPath, 'utf8');

    // Imports registry and count helpers
    assert.ok(pageContent.includes('getAvailableMarketplacesCount'));
    assert.ok(pageContent.includes('getConnectedMarketplacesCount'));
    assert.ok(pageContent.includes('resolveConnectionForProvider'));

    // availableCount is used as denominator, not a hardcoded '3'
    assert.ok(pageContent.includes('/{availableCount} Siap'));
  });
});
